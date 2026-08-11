"""In-memory buffer for live-draft pick events relayed by the browser tap.

The Tampermonkey userscript (userscript/draftdaddy-espn-tap.user.js) watches the
ESPN draft room's WebSocket and POSTs picks here as they happen, because the
league read API does not stream picks mid-draft (docs/live-draft-sync-research.md).
Buffers are keyed by (league, season, tap key) so only a client holding the same
random key the board displays can feed or read a league's picks. No DB — same
in-memory, TTL-evicted design as the telemetry dedupe map; a container restart
loses the buffer and the next INIT catch-up frame from the tap refills it.
"""

import time

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from . import players as players_module

router = APIRouter()

BUFFER_TTL = 12 * 60 * 60
MAX_BUFFERS = 200
MAX_PICKS_PER_BUFFER = 600
MIN_KEY_LENGTH = 4

_buffers: dict = {}


class TapPick(BaseModel):
    """One drafted player relayed by a tap.

    `espn_id` is really "provider player id" (kept as-is for wire compat) — ESPN
    ids for ESPN rooms, Yahoo/NFL ids elsewhere. Name-only picks (DOM-scraped
    rooms) may omit it and are deduped by normalized name instead.
    """

    espn_id: int | None = None
    name: str | None = None
    team: str | None = None
    pos: str | None = None
    overall: int | None = None
    round: int | None = None
    espn_team_id: int | None = None
    member_id: str | None = None


class TapEventBatch(BaseModel):
    league_id: str = Field(min_length=1, max_length=32)
    season: int
    key: str = Field(min_length=MIN_KEY_LENGTH, max_length=64)
    source: str = ""
    picks: list[TapPick] = []


def _buffer_key(league_id: str, season: int, key: str) -> str:
    return f"{league_id.strip()}:{season}:{key.strip()}"


def _evict(now: float) -> None:
    expired = [k for k, buf in _buffers.items() if now - buf["updated_at"] > BUFFER_TTL]
    for k in expired:
        del _buffers[k]
    while len(_buffers) > MAX_BUFFERS:
        oldest = min(_buffers, key=lambda k: _buffers[k]["updated_at"])
        del _buffers[oldest]


# Placeholder slots stream as -1/0; real D/ST units are -16001..-16034 and must
# survive (same rule as espn._is_placeholder).
def _is_placeholder(espn_id) -> bool:
    return espn_id in (0, -1)


def _pick_key(pick: TapPick):
    """Dedup key: provider id when present, else normalized name."""
    if pick.espn_id is not None:
        return pick.espn_id
    name = (pick.name or "").strip().lower()
    return f"n:{name}" if name else None


def store_picks(league_id: str, season: int, key: str, picks: list) -> int:
    now = time.time()
    _evict(now)
    bkey = _buffer_key(league_id, season, key)
    buf = _buffers.get(bkey)
    if buf is None:
        buf = {"picks": {}, "updated_at": now}
        _buffers[bkey] = buf
    stored = 0
    for pick in picks:
        pkey = _pick_key(pick)
        if pkey is None or _is_placeholder(pick.espn_id):
            continue
        if len(buf["picks"]) >= MAX_PICKS_PER_BUFFER and pkey not in buf["picks"]:
            break
        existing = buf["picks"].get(pkey)
        entry = {
            "espn_id": pick.espn_id,
            "name": (pick.name or "").strip() or None,
            "team": (pick.team or "").strip() or None,
            "pos": (pick.pos or "").strip().upper() or None,
            "overall": pick.overall,
            "round": pick.round,
            "espn_team_id": pick.espn_team_id,
            "lineup_slot_id": None,
            "member_id": pick.member_id,
        }
        if existing is None:
            stored += 1
        elif existing["overall"] is not None and entry["overall"] is None:
            # A live SELECTED frame already gave the true overall; an INIT
            # catch-up replay without one must not erase it.
            continue
        buf["picks"][pkey] = entry
    buf["updated_at"] = now
    return stored


def get_picks(league_id: str, season: int, key: str) -> list:
    """Buffered picks shaped like espn.get_draft() pick entries, or []."""
    key = (key or "").strip()
    if len(key) < MIN_KEY_LENGTH:
        return []
    buf = _buffers.get(_buffer_key(league_id, season, key))
    if buf is None or time.time() - buf["updated_at"] > BUFFER_TTL:
        return []
    picks = list(buf["picks"].values())
    picks.sort(key=lambda p: (p["overall"] is None, p["overall"] or 0))
    return picks


def buffer_status(league_id: str, season: int, key: str):
    key = (key or "").strip()
    if len(key) < MIN_KEY_LENGTH:
        return None
    buf = _buffers.get(_buffer_key(league_id, season, key))
    if buf is None or time.time() - buf["updated_at"] > BUFFER_TTL:
        return None
    return {"active": True, "picks": len(buf["picks"]), "last_event_at": buf["updated_at"]}


def clear_buffers() -> None:
    _buffers.clear()


# ---- shared sync plumbing (used by the ESPN and Yahoo sync endpoints) -------


def validated_slice(scoring: str, avg: str) -> tuple:
    if scoring not in players_module.SCORING_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"scoring must be one of {list(players_module.SCORING_TYPES)}",
        )
    if avg not in players_module.AVG_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"avg must be one of {list(players_module.AVG_TYPES)}",
        )
    return players_module.get_players(scoring, avg)


def normalize_member_id(value) -> str:
    return (value or "").strip().strip("{}").strip().lower()


def shape_picks(raw_picks: list, player_map: dict, index, me: str):
    """Resolve raw pick entries to named, board-matched picks.

    Name/team/pos come from the provider player map when the id is known there,
    falling back to whatever the pick itself carries (Yahoo picks and
    name-carrying taps, or ESPN taps when the player-map fetch failed).
    """
    my_team_id = None
    picks = []
    unmatched = []
    for pick in raw_picks:
        pid = pick.get("espn_id")
        info = player_map.get(pid, {}) if pid is not None else {}
        name = info.get("name") or pick.get("name") or f"ESPN player {pid}"
        team = info.get("team") or pick.get("team") or ""
        pos = info.get("pos") or pick.get("pos") or ""
        resolvable = bool(info) or bool(pick.get("name"))
        csv_id = index.match(name, team, pos) if resolvable else None
        entry = {
            "espn_id": pid,
            "name": name,
            "team": team,
            "pos": pos,
            "overall": pick["overall"],
            "round": pick["round"],
            "espn_team_id": pick["espn_team_id"],
            "lineup_slot_id": pick["lineup_slot_id"],
            "csv_id": csv_id,
        }
        picks.append(entry)
        if csv_id is None:
            unmatched.append({"espn_id": pid, "name": name, "team": team, "pos": pos})
        if my_team_id is None and me and normalize_member_id(pick.get("member_id")) == me:
            my_team_id = pick["espn_team_id"]
    return picks, unmatched, my_team_id


def merge_tap_picks(draft: dict, league_id: str, season: int, tap_key: str):
    """Fold WebSocket-tap picks into a provider pick list (provider picks win)."""
    tap_status = buffer_status(league_id, season, tap_key)
    if tap_status is None:
        return None
    raw_picks = draft["picks"]
    known = {p["espn_id"] for p in raw_picks if p.get("espn_id") is not None}
    known_names = {p["name"].strip().lower() for p in raw_picks if p.get("name")}
    team_count = len(draft["teams"])
    next_overall = max((p["overall"] or 0 for p in raw_picks), default=0)
    added = False
    for pick in get_picks(league_id, season, tap_key):
        if pick["espn_id"] is not None and pick["espn_id"] in known:
            continue
        if (pick.get("name") or "").strip().lower() in known_names:
            continue
        merged = dict(pick)
        if merged["overall"] is None:
            next_overall += 1
            merged["overall"] = next_overall
        else:
            next_overall = max(next_overall, merged["overall"])
        if merged["round"] is None and team_count:
            merged["round"] = (merged["overall"] + team_count - 1) // team_count
        raw_picks.append(merged)
        if merged["espn_id"] is not None:
            known.add(merged["espn_id"])
        added = True
    if added:
        raw_picks.sort(key=lambda p: p["overall"] or 0)
        draft["status"]["pick_count"] = len(raw_picks)
    return tap_status


@router.post("/api/draft/events")
def post_events(body: TapEventBatch):
    if not body.league_id.strip():
        raise HTTPException(status_code=400, detail="league_id is required")
    stored = store_picks(body.league_id, body.season, body.key, body.picks)
    status = buffer_status(body.league_id, body.season, body.key)
    return {"stored": stored, "total": status["picks"] if status else 0}


@router.get("/api/draft/events")
def read_events(
    league_id: str = Query(min_length=1),
    season: int = Query(),
    key: str = Query(min_length=MIN_KEY_LENGTH),
):
    status = buffer_status(league_id, season, key)
    return {
        "active": status is not None,
        "picks": get_picks(league_id, season, key),
        "last_event_at": status["last_event_at"] if status else None,
    }

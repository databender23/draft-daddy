"""Stateless async ESPN fantasy client. Cookies arrive per call, never stored."""

import asyncio
import json
import time
from urllib.parse import unquote

import httpx

from .matching import TEAM_ALIASES

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}"
LEAGUE_URL = BASE + "/segments/0/leagues/{league_id}"
PLAYERS_URL = BASE + "/players"

PLAYER_CACHE_TTL = 6 * 60 * 60
REQUEST_TIMEOUT = 20.0

AUTH_ERROR = "ESPN rejected your cookies — re-copy espn_s2 and SWID and try again."
PRIVATE_LEAGUE_ERROR = (
    "This league is private — paste your espn_s2 and SWID cookies in Settings "
    "(public leagues need no cookies)."
)
NOT_FOUND_ERROR = "League not found — check the league ID and season."
TIMEOUT_ERROR = "ESPN did not respond in time — try again in a few seconds."
UPSTREAM_ERROR = "ESPN is having trouble right now — try again in a few seconds."

PRO_TEAM_MAP = {
    0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL",
    7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV",
    14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
    21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
    28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}

POSITION_MAP = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}

# lineupSlotCounts keys (roster construction), not defaultPositionId values.
LINEUP_SLOT_NAMES = {
    "0": "qb", "2": "rb", "4": "wr", "6": "te", "7": "superflex",
    "16": "dst", "17": "k", "20": "bench", "23": "flex",
}
ROSTER_SLOT_KEYS = ("qb", "rb", "wr", "te", "flex", "superflex", "dst", "k", "bench")

_player_cache: dict = {}
_player_cache_lock = asyncio.Lock()


class ESPNError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def team_abbrev(pro_team_id) -> str:
    espn = PRO_TEAM_MAP.get(pro_team_id, "")
    return TEAM_ALIASES.get(espn, espn)


def _raise_for_status(response: httpx.Response) -> None:
    code = response.status_code
    if code < 400:
        return
    if code in (401, 403):
        raise ESPNError(401, AUTH_ERROR)
    if code == 404:
        raise ESPNError(404, NOT_FOUND_ERROR)
    if code == 429:
        raise ESPNError(502, "ESPN is rate limiting requests — try again shortly.")
    if code >= 500:
        raise ESPNError(502, UPSTREAM_ERROR)
    raise ESPNError(502, f"Unexpected response from ESPN ({code}).")


async def _get(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    try:
        return await client.get(url, **kwargs)
    except httpx.TimeoutException:
        raise ESPNError(502, TIMEOUT_ERROR)
    except httpx.HTTPError:
        raise ESPNError(502, UPSTREAM_ERROR)


def _team_name(team: dict) -> str:
    name = (team.get("name") or "").strip()
    if name:
        return name
    legacy = f"{team.get('location', '')} {team.get('nickname', '')}".strip()
    return legacy or f"Team {team.get('id')}"


def _team_member_id(team: dict):
    owners = team.get("owners") or []
    return team.get("primaryOwner") or (owners[0] if owners else None)


def _roster_picks(teams: list, taken: set, start_overall: int) -> list:
    """Rostered players ESPN's draftDetail has not reported as picks.

    draftDetail.picks is not confirmed to stream during a live draft, so rosters
    are used as a second signal for which players are off the board.
    """
    picks = []
    overall = start_overall
    for team in teams:
        entries = ((team.get("roster") or {}).get("entries")) or []
        member_id = _team_member_id(team)
        slot = 0
        for entry in entries:
            player_id = entry.get("playerId")
            if player_id is None or _is_placeholder(player_id):
                continue
            player_id = int(player_id)
            slot += 1
            if player_id in taken:
                continue
            taken.add(player_id)
            overall += 1
            picks.append(
                {
                    "espn_id": player_id,
                    "overall": overall,
                    "round": slot,
                    "espn_team_id": team.get("id"),
                    "lineup_slot_id": entry.get("lineupSlotId"),
                    "member_id": member_id,
                }
            )
    return picks


def _parse_roster_slots(data: dict):
    """League roster composition from mSettings, or None when absent."""
    counts = ((data.get("settings") or {}).get("rosterSettings") or {}).get(
        "lineupSlotCounts"
    )
    if not isinstance(counts, dict):
        return None
    slots = {key: 0 for key in ROSTER_SLOT_KEYS}
    found = False
    for slot_id, count in counts.items():
        name = LINEUP_SLOT_NAMES.get(str(slot_id))
        if name is None:
            continue
        try:
            count = int(count)
        except (TypeError, ValueError):
            continue
        if count > 0:
            slots[name] = count
            found = True
    return slots if found else None


# Pre-draft, draftDetail.picks lists every scheduled slot with playerId -1 (or
# 0). Real players are positive; D/ST units are -16001..-16034 and must survive.
def _is_placeholder(player_id) -> bool:
    return player_id in (0, -1)


def _parse_picks(draft_detail: dict) -> list:
    picks = []
    for pick in draft_detail.get("picks") or []:
        player_id = pick.get("playerId")
        if player_id is None or _is_placeholder(player_id):
            continue
        picks.append(
            {
                "espn_id": int(player_id),
                "overall": pick.get("overallPickNumber"),
                "round": pick.get("roundId"),
                "espn_team_id": pick.get("teamId"),
                "lineup_slot_id": pick.get("lineupSlotId"),
                "member_id": pick.get("memberId"),
            }
        )
    picks.sort(key=lambda p: p["overall"] if p["overall"] is not None else 0)
    return picks


async def get_draft(league_id: str, season: int, espn_s2: str, swid: str) -> dict:
    """Fetch draft picks, teams and draft status for one league."""
    url = LEAGUE_URL.format(season=season, league_id=league_id)
    params = [
        ("view", "mDraftDetail"),
        ("view", "mTeam"),
        ("view", "mRoster"),
        ("view", "mSettings"),
    ]
    headers = {"Accept": "application/json"}

    cookies = {}
    if espn_s2:
        cookies["espn_s2"] = espn_s2
    if swid:
        cookies["SWID"] = swid

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        response = await _get(
            client, url, params=params, cookies=cookies or None, headers=headers
        )
        if response.status_code in (401, 403):
            decoded = unquote(espn_s2 or "")
            if decoded and decoded != espn_s2:
                response = await _get(
                    client,
                    url,
                    params=params,
                    cookies={**cookies, "espn_s2": decoded},
                    headers=headers,
                )
        if response.status_code in (401, 403) and not cookies:
            raise ESPNError(401, PRIVATE_LEAGUE_ERROR)
        _raise_for_status(response)
        try:
            data = response.json()
        except ValueError:
            raise ESPNError(502, UPSTREAM_ERROR)

    if isinstance(data, list):
        data = data[0] if data else {}

    draft_detail = data.get("draftDetail") or {}
    raw_teams = data.get("teams") or []
    picks = _parse_picks(draft_detail)
    taken = {pick["espn_id"] for pick in picks}
    last_overall = max((p["overall"] or 0 for p in picks), default=0)
    picks.extend(_roster_picks(raw_teams, taken, last_overall))
    teams = [{"id": t.get("id"), "name": _team_name(t)} for t in raw_teams]
    return {
        "status": {
            "drafted": bool(draft_detail.get("drafted")),
            "in_progress": bool(draft_detail.get("inProgress")),
            "pick_count": len(picks),
        },
        "teams": teams,
        "picks": picks,
        "roster_slots": _parse_roster_slots(data),
    }


def _parse_player_list(payload) -> dict:
    players = {}
    if isinstance(payload, dict):
        payload = payload.get("players") or []
    for entry in payload or []:
        player = entry.get("player") if "player" in entry else entry
        if not isinstance(player, dict):
            continue
        pos = POSITION_MAP.get(player.get("defaultPositionId"))
        if pos is None:
            continue
        player_id = player.get("id")
        if player_id is None:
            continue
        name = (player.get("fullName") or "").strip()
        if not name:
            name = f"{player.get('firstName', '')} {player.get('lastName', '')}".strip()
        players[int(player_id)] = {
            "name": name,
            "team": team_abbrev(player.get("proTeamId")),
            "pos": pos,
        }
    return players


async def _fetch_player_list(season: int):
    url = PLAYERS_URL.format(season=season)
    headers = {
        "Accept": "application/json",
        "X-Fantasy-Filter": json.dumps({"filterActive": {"value": True}}),
    }
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        response = await _get(client, url, params={"view": "players_wl"}, headers=headers)
        _raise_for_status(response)
        try:
            return response.json()
        except ValueError:
            raise ESPNError(502, UPSTREAM_ERROR)


async def get_player_map(season: int) -> dict:
    """Public ESPN player list (id -> name/team/pos), cached per season."""
    now = time.monotonic()
    cached = _player_cache.get(season)
    if cached and now - cached[0] < PLAYER_CACHE_TTL:
        return cached[1]

    async with _player_cache_lock:
        cached = _player_cache.get(season)
        now = time.monotonic()
        if cached and now - cached[0] < PLAYER_CACHE_TTL:
            return cached[1]

        try:
            payload = await _fetch_player_list(season)
        except ESPNError:
            # Names/teams/positions do not change during a draft, so an expired
            # cache still beats failing the whole sync.
            if cached:
                return cached[1]
            raise

        players = _parse_player_list(payload)
        if players:
            _player_cache[season] = (time.monotonic(), players)
        elif cached:
            return cached[1]
        return players


def clear_player_cache() -> None:
    _player_cache.clear()

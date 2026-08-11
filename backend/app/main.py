"""FastAPI app: VOR draft board + stateless ESPN draft sync."""

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import draft_events
from .context import get_player_entries, get_teams
from .espn import ESPNError, get_draft, get_player_map
from .matching import MatchIndex
from .telemetry import router as telemetry_router
from .yahoo_routes import router as yahoo_router

FRONTEND_DIST = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)
USERSCRIPT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "userscript")
)

app = FastAPI(title="Fantasy Draft Board", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(telemetry_router)
app.include_router(draft_events.router)
app.include_router(yahoo_router)


class SyncRequest(BaseModel):
    league_id: str
    season: int
    espn_s2: str = ""
    swid: str = ""
    scoring: str = "PPR"
    avg: str = "average"
    tap_key: str = ""


# Shared sync plumbing lives in draft_events (also used by the Yahoo router).
_validated_slice = draft_events.validated_slice
_normalize_swid = draft_events.normalize_member_id
_shape_picks = draft_events.shape_picks
_merge_tap_picks = draft_events.merge_tap_picks


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/players")
def get_board(
    scoring: str = Query("PPR"),
    avg: str = Query("average"),
):
    last_season = get_player_entries()
    # get_players caches its tuple of dicts — copy before adding last_season.
    board = [
        {**player, "last_season": last_season.get(player["id"]) or None}
        for player in _validated_slice(scoring, avg)
    ]
    return {"players": board, "teams": get_teams()}


@app.post("/api/espn/sync")
async def espn_sync(body: SyncRequest):
    board = _validated_slice(body.scoring, body.avg)
    try:
        draft = await get_draft(body.league_id, body.season, body.espn_s2, body.swid)
    except ESPNError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    tap = _merge_tap_picks(draft, body.league_id, body.season, body.tap_key)
    raw_picks = draft["picks"]
    player_map = {}
    if raw_picks:
        # Name lookup is ancillary: picks in hand are still worth returning
        # (unresolved ones fall back to a placeholder name + null csv_id).
        try:
            player_map = await get_player_map(body.season)
        except ESPNError:
            player_map = {}

    picks, unmatched, my_team_id = _shape_picks(
        raw_picks, player_map, MatchIndex(board), _normalize_swid(body.swid)
    )

    return {
        "status": draft["status"],
        "teams": draft["teams"],
        "my_team_id": my_team_id,
        "roster_slots": draft.get("roster_slots"),
        "picks": picks,
        "unmatched": unmatched,
        "tap": tap,
    }


@app.get("/api/draft/live")
async def draft_live(
    league_id: str = Query(min_length=1),
    season: int = Query(),
    key: str = Query(min_length=4),
    scoring: str = Query("PPR"),
    avg: str = Query("average"),
):
    """Tap-buffer picks matched to the board, no provider API call required.

    The provider-agnostic live path: any tap (ESPN, Yahoo, NFL.com…) that POSTs
    to /api/draft/events can drive the board through this endpoint alone.
    """
    board = _validated_slice(scoring, avg)
    tap = draft_events.buffer_status(league_id, season, key)
    raw_picks = draft_events.get_picks(league_id, season, key)
    player_map = {}
    needs_map = any(
        p.get("espn_id") is not None and not p.get("name") for p in raw_picks
    )
    if needs_map:
        try:
            player_map = await get_player_map(season)
        except ESPNError:
            player_map = {}
    picks, unmatched, _ = _shape_picks(raw_picks, player_map, MatchIndex(board), "")
    return {"tap": tap, "picks": picks, "unmatched": unmatched}


if os.path.isdir(USERSCRIPT_DIR):
    app.mount("/tap", StaticFiles(directory=USERSCRIPT_DIR), name="tap")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

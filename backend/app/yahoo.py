"""Stateless async Yahoo Fantasy client. Tokens arrive per call, never stored.

Yahoo's official API supports live drafts server-side: /league/{key}/draftresults
populates DURING the draft (docs/live-draft-sync-research.md §Yahoo). Auth is
OAuth2 — the app's client id/secret live in env vars (YAHOO_CLIENT_ID /
YAHOO_CLIENT_SECRET); the user's refresh token lives in their browser and is
sent with each sync request, mirroring how ESPN cookies are handled.

Yahoo's ?format=json output mirrors its XML: nested arrays of single-key dicts.
The _collapse/_walk helpers below flatten that shape defensively.
"""

import asyncio
import time

import httpx

from .espn import ESPNError, TIMEOUT_ERROR, UPSTREAM_ERROR

AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
API = "https://fantasysports.yahooapis.com/fantasy/v2"

REQUEST_TIMEOUT = 20.0
GAME_KEY_TTL = 24 * 60 * 60

YAHOO_AUTH_ERROR = "Yahoo rejected the sign-in — reconnect Yahoo in Settings."
YAHOO_NOT_FOUND_ERROR = "Yahoo league not found — check the league ID and season."

# Yahoo roster position -> our RosterConfig keys (espn.ROSTER_SLOT_KEYS).
POSITION_SLOTS = {
    "QB": "qb", "RB": "rb", "WR": "wr", "TE": "te", "K": "k", "DEF": "dst",
    "W/R/T": "flex", "W/R": "flex", "R/T": "flex", "Q/W/R/T": "superflex",
    "BN": "bench",
}

_game_key_cache: dict = {}
_game_key_lock = asyncio.Lock()


# ---- Yahoo JSON flattening --------------------------------------------------


def _collapse(node):
    """Merge Yahoo's list-of-dicts (and stray scalars) into one dict."""
    if isinstance(node, dict):
        return node
    merged = {}
    if isinstance(node, list):
        for item in node:
            if isinstance(item, dict):
                merged.update(item)
            elif isinstance(item, list):
                merged.update(_collapse(item))
    return merged


def _indexed(node):
    """Yield entries of a {'0': {...}, '1': {...}, 'count': n} collection."""
    if not isinstance(node, dict):
        return
    for key, value in node.items():
        if key == "count":
            continue
        yield value


def _walk(node, key):
    """First value for `key` anywhere inside Yahoo's nested lists/dicts."""
    if isinstance(node, dict):
        if key in node:
            return node[key]
        for value in node.values():
            found = _walk(value, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _walk(item, key)
            if found is not None:
                return found
    return None


# ---- HTTP -------------------------------------------------------------------


async def _request(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    try:
        response = await client.request(method, url, **kwargs)
    except httpx.TimeoutException:
        raise ESPNError(502, TIMEOUT_ERROR)
    except httpx.HTTPError:
        raise ESPNError(502, UPSTREAM_ERROR)
    if response.status_code in (401, 403):
        raise ESPNError(401, YAHOO_AUTH_ERROR)
    if response.status_code == 404:
        raise ESPNError(404, YAHOO_NOT_FOUND_ERROR)
    if response.status_code >= 400:
        raise ESPNError(502, f"Unexpected response from Yahoo ({response.status_code}).")
    return response


async def _get_json(client: httpx.AsyncClient, path: str, access_token: str):
    response = await _request(
        client,
        "GET",
        f"{API}{path}",
        params={"format": "json"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        return response.json()
    except ValueError:
        raise ESPNError(502, UPSTREAM_ERROR)


# ---- OAuth ------------------------------------------------------------------


def authorize_url(client_id: str, redirect_uri: str) -> str:
    params = httpx.QueryParams(
        client_id=client_id, redirect_uri=redirect_uri, response_type="code"
    )
    return f"{AUTH_URL}?{params}"


async def exchange_code(
    code: str, redirect_uri: str, client_id: str, client_secret: str
) -> dict:
    return await _token_request(
        {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
        client_id,
        client_secret,
    )


async def refresh_access_token(
    refresh_token: str, client_id: str, client_secret: str
) -> dict:
    return await _token_request(
        {"grant_type": "refresh_token", "refresh_token": refresh_token},
        client_id,
        client_secret,
    )


async def _token_request(data: dict, client_id: str, client_secret: str) -> dict:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await _request(
            client, "POST", TOKEN_URL, data=data, auth=(client_id, client_secret)
        )
    try:
        payload = response.json()
    except ValueError:
        raise ESPNError(502, UPSTREAM_ERROR)
    if "access_token" not in payload:
        raise ESPNError(401, YAHOO_AUTH_ERROR)
    return payload


# ---- Fantasy API ------------------------------------------------------------


async def _game_key(client: httpx.AsyncClient, season: int, access_token: str) -> str:
    cached = _game_key_cache.get(season)
    if cached and time.monotonic() - cached[0] < GAME_KEY_TTL:
        return cached[1]
    async with _game_key_lock:
        cached = _game_key_cache.get(season)
        if cached and time.monotonic() - cached[0] < GAME_KEY_TTL:
            return cached[1]
        data = await _get_json(
            client, f"/games;game_codes=nfl;seasons={season}", access_token
        )
        games = _walk(data, "games")
        key = None
        for entry in _indexed(games):
            key = _walk(entry, "game_key")
            if key:
                break
        if not key:
            raise ESPNError(404, f"Yahoo has no NFL game for season {season}.")
        _game_key_cache[season] = (time.monotonic(), str(key))
        return str(key)


def league_key(game: str, league_id: str) -> str:
    league_id = league_id.strip()
    return league_id if ".l." in league_id else f"{game}.l.{league_id}"


def _team_id(team_key) -> int | None:
    try:
        return int(str(team_key).rsplit(".t.", 1)[1])
    except (IndexError, ValueError):
        return None


def _parse_teams(league_payload) -> tuple[list, int | None]:
    teams = []
    my_team_id = None
    for entry in _indexed(_walk(league_payload, "teams")):
        team = _collapse(_walk(entry, "team"))
        team_id = _team_id(_walk(team, "team_key"))
        if team_id is None:
            continue
        teams.append({"id": team_id, "name": str(_walk(team, "name") or f"Team {team_id}")})
        if str(_walk(team, "is_owned_by_current_login") or "0") == "1":
            my_team_id = team_id
    teams.sort(key=lambda t: t["id"])
    return teams, my_team_id


def _parse_roster_slots(league_payload):
    slots = {key: 0 for key in
             ("qb", "rb", "wr", "te", "flex", "superflex", "dst", "k", "bench")}
    found = False
    positions = _walk(league_payload, "roster_positions")
    for entry in _indexed(positions) if isinstance(positions, dict) else (positions or []):
        info = _collapse(_walk(entry, "roster_position") or entry)
        name = POSITION_SLOTS.get(str(info.get("position") or "").upper())
        try:
            count = int(info.get("count") or 0)
        except (TypeError, ValueError):
            continue
        if name and count > 0:
            slots[name] += count
            found = True
    return slots if found else None


def _parse_player(node) -> dict:
    player = _collapse(_walk(node, "player"))
    name = _walk(player, "full") or ""
    team = str(_walk(player, "editorial_team_abbr") or "").upper()
    pos = str(_walk(player, "display_position") or "").split(",")[0].strip().upper()
    return {"name": str(name), "team": team, "pos": pos}


def _parse_draft_results(league_payload) -> list:
    picks = []
    for entry in _indexed(_walk(league_payload, "draft_results")):
        result = _walk(entry, "draft_result")
        info = _collapse(result)
        player_key = _walk(info, "player_key")
        if not player_key:
            continue  # auction nomination in progress, or empty slot
        try:
            player_id = int(str(player_key).rsplit(".p.", 1)[1])
        except (IndexError, ValueError):
            player_id = None
        detail = _parse_player(result)
        picks.append(
            {
                "espn_id": player_id,  # provider player id (Yahoo)
                "name": detail["name"] or None,
                "team": detail["team"] or None,
                "pos": detail["pos"] or None,
                "overall": _int_or_none(_walk(info, "pick")),
                "round": _int_or_none(_walk(info, "round")),
                "espn_team_id": _team_id(_walk(info, "team_key")),
                "lineup_slot_id": None,
                "member_id": None,
            }
        )
    picks.sort(key=lambda p: (p["overall"] is None, p["overall"] or 0))
    return picks


def _int_or_none(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def get_draft(league_id: str, season: int, access_token: str) -> dict:
    """Fetch draft picks, teams and draft status — espn.get_draft-shaped."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        game = await _game_key(client, season, access_token)
        key = league_key(game, league_id)
        meta = await _get_json(
            client, f"/league/{key};out=teams,settings", access_token
        )
        draft = await _get_json(
            client, f"/league/{key}/draftresults/players", access_token
        )

    league_meta = _walk(meta, "league")
    teams, my_team_id = _parse_teams(league_meta)
    draft_status = str(_walk(league_meta, "draft_status") or "").lower()
    picks = _parse_draft_results(_walk(draft, "league"))
    return {
        "status": {
            "drafted": draft_status == "postdraft",
            "in_progress": draft_status == "drafting",
            "pick_count": len(picks),
        },
        "teams": teams,
        "picks": picks,
        "roster_slots": _parse_roster_slots(league_meta),
        "my_team_id": my_team_id,
    }


def clear_game_key_cache() -> None:
    _game_key_cache.clear()

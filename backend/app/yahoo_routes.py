"""Yahoo OAuth + draft-sync endpoints.

The Yahoo app's client id/secret are env vars (YAHOO_CLIENT_ID /
YAHOO_CLIENT_SECRET — endpoints 503 without them, so the app runs fine
Yahoo-less). User tokens follow the ESPN-cookie model: the browser holds the
refresh token and sends it per request; nothing is stored server-side. The
OAuth popup flow hands tokens back to the app tab via postMessage locked to
this origin.
"""

import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from . import draft_events, yahoo
from .espn import ESPNError
from .matching import MatchIndex

router = APIRouter()

NOT_CONFIGURED = "Yahoo sync is not configured on this server."
NOT_CONNECTED = "Connect Yahoo first — click Connect Yahoo in Settings."


class YahooSyncRequest(BaseModel):
    league_id: str
    season: int
    refresh_token: str = ""
    access_token: str = ""
    scoring: str = "PPR"
    avg: str = "average"
    tap_key: str = ""


def _creds() -> tuple:
    return (
        os.environ.get("YAHOO_CLIENT_ID", "").strip(),
        os.environ.get("YAHOO_CLIENT_SECRET", "").strip(),
    )


def _redirect_uri(request: Request) -> str:
    override = os.environ.get("YAHOO_REDIRECT_URI", "").strip()
    if override:
        return override
    # Honor the proxy's scheme (App Runner terminates TLS before uvicorn).
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{request.url.netloc}/api/yahoo/callback"


@router.get("/api/yahoo/status")
def yahoo_status():
    client_id, client_secret = _creds()
    return {"configured": bool(client_id and client_secret)}


@router.get("/api/yahoo/login")
def yahoo_login(request: Request):
    client_id, _ = _creds()
    if not client_id:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    return RedirectResponse(yahoo.authorize_url(client_id, _redirect_uri(request)))


@router.get("/api/yahoo/callback")
async def yahoo_callback(request: Request, code: str = "", error: str = ""):
    client_id, client_secret = _creds()
    if not client_id:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    if error or not code:
        payload = {"type": "yahoo-auth", "ok": False, "error": error or "cancelled"}
    else:
        try:
            token = await yahoo.exchange_code(
                code, _redirect_uri(request), client_id, client_secret
            )
            payload = {
                "type": "yahoo-auth",
                "ok": True,
                "access_token": token.get("access_token", ""),
                "refresh_token": token.get("refresh_token", ""),
                "expires_in": token.get("expires_in", 3600),
            }
        except ESPNError as exc:
            payload = {"type": "yahoo-auth", "ok": False, "error": exc.detail}

    # postMessage is locked to this origin, so only the Draft Daddy tab that
    # opened the popup can receive the tokens.
    html = f"""<!doctype html><meta charset="utf-8"><title>Yahoo sign-in</title>
<body style="font-family:sans-serif;padding:2rem">
<p>{"Connected — you can close this window." if payload["ok"] else "Sign-in failed — you can close this window."}</p>
<script>
if (window.opener) {{
  window.opener.postMessage({json.dumps(payload)}, window.location.origin);
  window.setTimeout(function () {{ window.close(); }}, 400);
}}
</script></body>"""
    return HTMLResponse(html)


@router.post("/api/yahoo/sync")
async def yahoo_sync(body: YahooSyncRequest):
    board = draft_events.validated_slice(body.scoring, body.avg)
    client_id, client_secret = _creds()
    if not client_id:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    if not body.access_token and not body.refresh_token:
        raise HTTPException(status_code=401, detail=NOT_CONNECTED)

    auth = None

    async def refreshed_access() -> str:
        nonlocal auth
        token = await yahoo.refresh_access_token(
            body.refresh_token, client_id, client_secret
        )
        auth = {
            "access_token": token.get("access_token", ""),
            "refresh_token": token.get("refresh_token", "") or body.refresh_token,
            "expires_in": token.get("expires_in", 3600),
        }
        return auth["access_token"]

    try:
        access = body.access_token or await refreshed_access()
        try:
            draft = await yahoo.get_draft(body.league_id, body.season, access)
        except ESPNError as exc:
            # Stale access token: refresh once and retry before giving up.
            if exc.status_code != 401 or not body.access_token or not body.refresh_token:
                raise
            draft = await yahoo.get_draft(
                body.league_id, body.season, await refreshed_access()
            )
    except ESPNError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    tap = draft_events.merge_tap_picks(draft, body.league_id, body.season, body.tap_key)
    picks, unmatched, _ = draft_events.shape_picks(
        draft["picks"], {}, MatchIndex(board), ""
    )
    return {
        "status": draft["status"],
        "teams": draft["teams"],
        "my_team_id": draft.get("my_team_id"),
        "roster_slots": draft.get("roster_slots"),
        "picks": picks,
        "unmatched": unmatched,
        "tap": tap,
        "auth": auth,
    }

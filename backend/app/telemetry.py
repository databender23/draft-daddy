"""Visitor telemetry: forwards anonymous pageviews to the databender.co
analytics pipeline and pings Slack once per new session.

Both sinks are env-gated and best-effort: with ANALYTICS_ENDPOINT / SLACK_WEBHOOK_URL
unset (the default — local dev, plain docker run) this module does nothing.
No PII and no ESPN credential state is ever read or sent.
"""

import asyncio
import logging
import os
import time

import httpx
from fastapi import APIRouter, Request, Response

log = logging.getLogger("telemetry")
router = APIRouter()

SEND_TIMEOUT = 3.0
SESSION_TTL = 6 * 60 * 60

_seen_sessions: dict = {}
_seen_visitors: dict = {}
_daily = {"day": "", "count": 0}

VISITOR_TTL = 30 * 24 * 60 * 60  # best-effort: resets on container restart


def _analytics_endpoint():
    return os.environ.get("ANALYTICS_ENDPOINT") or None


def _slack_webhook():
    return os.environ.get("SLACK_WEBHOOK_URL") or None


def _device_for(viewport_width) -> str:
    try:
        width = int(viewport_width)
    except (TypeError, ValueError):
        return "desktop"
    if width < 768:
        return "mobile"
    if width < 1024:
        return "tablet"
    return "desktop"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _new_session(session_id: str) -> bool:
    now = time.monotonic()
    for key in [k for k, seen in _seen_sessions.items() if now - seen > SESSION_TTL]:
        _seen_sessions.pop(key, None)
    if session_id in _seen_sessions:
        return False
    _seen_sessions[session_id] = now
    return True


def _first_visit(visitor_id: str) -> bool:
    now = time.monotonic()
    for key in [k for k, seen in _seen_visitors.items() if now - seen > VISITOR_TTL]:
        _seen_visitors.pop(key, None)
    if visitor_id in _seen_visitors:
        _seen_visitors[visitor_id] = now
        return False
    _seen_visitors[visitor_id] = now
    return True


def _today_count() -> int:
    day = time.strftime("%Y-%m-%d")
    if _daily["day"] != day:
        _daily["day"] = day
        _daily["count"] = 0
    _daily["count"] += 1
    return _daily["count"]


def _int_or_none(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_event(body: dict) -> dict:
    """Site contract: {event, visitorId, sessionId, device} at top level."""
    utm = body.get("utm") if isinstance(body.get("utm"), dict) else {}
    event = {
        "eventType": "pageview",
        "page": "/draft",
        "referrer": body.get("referrer") or "",
        "screenWidth": _int_or_none(body.get("screen_width")),
        "screenHeight": _int_or_none(body.get("screen_height")),
        "viewportWidth": _int_or_none(body.get("viewport_width")),
        "viewportHeight": _int_or_none(body.get("viewport_height")),
        "utm": {k: v for k, v in utm.items() if isinstance(v, str) and v},
    }
    return {
        "event": {k: v for k, v in event.items() if v not in (None, "", {})},
        "visitorId": str(body.get("visitor_id") or ""),
        "sessionId": str(body.get("session_id") or ""),
        "device": _device_for(body.get("viewport_width")),
    }


async def _forward(payload: dict, ip: str, user_agent: str) -> None:
    endpoint = _analytics_endpoint()
    if not endpoint:
        return
    headers = {"Content-Type": "application/json"}
    if ip:
        headers["X-Forwarded-For"] = ip
    if user_agent:
        headers["User-Agent"] = user_agent
    try:
        async with httpx.AsyncClient(timeout=SEND_TIMEOUT) as client:
            await client.post(endpoint, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        log.info("analytics forward failed: %s", exc)


def _browser_of(ua: str) -> str:
    if "Firefox/" in ua:
        return "Firefox"
    if "Edg/" in ua:
        return "Edge"
    if "Chrome/" in ua:
        return "Chrome"
    if "Safari/" in ua:
        return "Safari"
    return "Unknown browser"


def _source_of(body: dict) -> str:
    utm = body.get("utm") if isinstance(body.get("utm"), dict) else {}
    if utm.get("source"):
        return str(utm["source"])
    referrer = str(body.get("referrer") or "")
    if referrer:
        host = referrer.split("//")[-1].split("/")[0]
        return host or "Direct"
    return "Direct"


def _is_public_ip(ip: str) -> bool:
    return bool(ip) and not ip.startswith(("10.", "192.168.", "172.", "127.", "fe80", "::"))


async def _geo_of(client, ip: str) -> str:
    """City, RegionCode via the same free service the website's pipeline uses."""
    if not _is_public_ip(ip):
        return ""
    try:
        res = await client.get(
            f"http://ip-api.com/json/{ip}?fields=status,city,regionCode,countryCode"
        )
        data = res.json()
        if data.get("status") != "success":
            return ""
        parts = [p for p in (data.get("city"), data.get("regionCode")) if p]
        if not parts:
            return data.get("countryCode") or ""
        return ", ".join(parts)
    except Exception:
        return ""


async def _slack_ping(body: dict, ip: str, user_agent: str, first_visit: bool) -> None:
    """Block Kit message matching the website's alert style (context rows, teal bar)."""
    webhook = _slack_webhook()
    if not webhook:
        return
    count = _today_count()
    try:
        async with httpx.AsyncClient(timeout=SEND_TIMEOUT) as client:
            geo = await _geo_of(client, ip)
            device = _device_for(body.get("viewport_width"))
            visit = "✨ First visit" if first_visit else "🔁 Returning"
            context = [visit, f"🎯 {_source_of(body)}"]
            if geo:
                context.append(f"🌍 {geo}")
            context.extend([f"💻 {device}", f"🌐 {_browser_of(user_agent)}"])
            blocks = [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"🏈 *Draft Daddy Visitor* | *#{count}* today",
                    },
                },
                {
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": "  •  ".join(context)}],
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"🔑 Visitor ID: `{str(body.get('visitor_id'))[:18]}`",
                        }
                    ],
                },
            ]
            await client.post(
                webhook,
                json={
                    "text": f"🏈 Draft Daddy visitor #{count} today",
                    "attachments": [{"color": "#1A9988", "blocks": blocks}],
                },
            )
    except httpx.HTTPError as exc:
        log.info("slack ping failed: %s", exc)


@router.post("/api/telemetry", status_code=204)
async def telemetry(request: Request) -> Response:
    """Always 204; the draft UI must never notice telemetry existing or failing."""
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
    except Exception:
        body = {}

    payload = _build_event(body)
    tasks = []
    if payload["visitorId"] and payload["sessionId"]:
        ip = _client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        tasks.append(_forward(payload, ip, user_agent))
        if _new_session(payload["sessionId"]):
            tasks.append(
                _slack_ping(body, ip, user_agent, _first_visit(payload["visitorId"]))
            )
    if tasks:
        try:
            await asyncio.gather(*tasks)
        except Exception as exc:  # pragma: no cover - belt and braces
            log.info("telemetry send failed: %s", exc)
    return Response(status_code=204)


def reset_state() -> None:
    """Test hook."""
    _seen_sessions.clear()
    _seen_visitors.clear()
    _daily["day"] = ""
    _daily["count"] = 0

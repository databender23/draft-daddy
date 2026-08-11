import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from app import main as main_module  # noqa: E402
from app import telemetry as telemetry_module  # noqa: E402

BODY = {
    "visitor_id": "v-123",
    "session_id": "s-456",
    "referrer": "https://example.com",
    "screen_width": 2560,
    "screen_height": 1440,
    "viewport_width": 1400,
    "viewport_height": 900,
    "utm": {"source": "league-chat", "medium": "link"},
}


class FakeAsyncClient:
    """Records posts; injected in place of httpx.AsyncClient."""

    calls: list = []
    raise_error = False

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        FakeAsyncClient.calls.append({"url": url, "json": json, "headers": headers or {}})
        if FakeAsyncClient.raise_error:
            import httpx

            raise httpx.ConnectError("down")

    async def get(self, url, **kwargs):
        FakeAsyncClient.calls.append({"url": url, "json": None, "headers": {}})

        class GeoRes:
            @staticmethod
            def json():
                return {"status": "success", "city": "Chicago", "regionCode": "IL"}

        return GeoRes()


@pytest.fixture
def client(monkeypatch):
    telemetry_module.reset_state()
    FakeAsyncClient.calls = []
    FakeAsyncClient.raise_error = False
    monkeypatch.setattr(telemetry_module.httpx, "AsyncClient", FakeAsyncClient)
    return TestClient(main_module.app)


def test_no_envs_means_no_outbound_calls(client, monkeypatch):
    monkeypatch.delenv("ANALYTICS_ENDPOINT", raising=False)
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    res = client.post("/api/telemetry", json=BODY)
    assert res.status_code == 204
    assert FakeAsyncClient.calls == []


def test_forwards_site_contract_payload(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENDPOINT", "https://databender.co/api/analytics/event")
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    res = client.post(
        "/api/telemetry",
        json=BODY,
        headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1", "User-Agent": "TestUA/1.0"},
    )
    assert res.status_code == 204
    assert len(FakeAsyncClient.calls) == 1
    call = FakeAsyncClient.calls[0]
    payload = call["json"]
    assert set(payload) == {"event", "visitorId", "sessionId", "device"}
    assert payload["visitorId"] == "v-123"
    assert payload["sessionId"] == "s-456"
    assert payload["device"] == "desktop"
    event = payload["event"]
    assert event["eventType"] == "pageview"
    assert event["page"] == "/draft"
    assert event["viewportWidth"] == 1400
    assert event["utm"] == {"source": "league-chat", "medium": "link"}
    assert call["headers"]["X-Forwarded-For"] == "203.0.113.9"
    assert call["headers"]["User-Agent"] == "TestUA/1.0"


def test_device_buckets(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENDPOINT", "https://x.example/e")
    for width, expected in ((500, "mobile"), (900, "tablet"), (1400, "desktop"), (None, "desktop")):
        FakeAsyncClient.calls = []
        telemetry_module.reset_state()
        body = {**BODY, "viewport_width": width, "session_id": f"s-{width}"}
        client.post("/api/telemetry", json=body)
        assert FakeAsyncClient.calls[0]["json"]["device"] == expected


def _slack_calls():
    return [c for c in FakeAsyncClient.calls if "hooks.slack" in c["url"]]


def _context_text(payload):
    blocks = payload["attachments"][0]["blocks"]
    return " | ".join(
        el["text"] for b in blocks if b["type"] == "context" for el in b["elements"]
    )


def test_slack_once_per_session_with_rich_blocks(client, monkeypatch):
    monkeypatch.delenv("ANALYTICS_ENDPOINT", raising=False)
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/T/B/x")
    client.post("/api/telemetry", json=BODY, headers={
        "X-Forwarded-For": "203.0.113.9",
        "User-Agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36",
    })
    client.post("/api/telemetry", json=BODY)
    calls = _slack_calls()
    assert len(calls) == 1
    payload = calls[0]["json"]
    assert "Draft IQ visitor #1 today" in payload["text"]
    assert payload["attachments"][0]["color"] == "#1A9988"
    context = _context_text(payload)
    assert "✨ First visit" in context
    assert "🎯 league-chat" in context          # utm_source wins over referrer
    assert "🌍 Chicago, IL" in context          # geo lookup (faked ip-api response)
    assert "💻 desktop" in context
    assert "🌐 Chrome" in context

    # same visitor, new session -> new ping, but now Returning
    client.post("/api/telemetry", json={**BODY, "session_id": "s-789"}, headers={
        "X-Forwarded-For": "203.0.113.9",
        "User-Agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36",
    })
    calls = _slack_calls()
    assert len(calls) == 2
    assert "#2 today" in calls[1]["json"]["text"]
    assert "🔁 Returning" in _context_text(calls[1]["json"])


def test_slack_direct_source_without_utm(client, monkeypatch):
    monkeypatch.delenv("ANALYTICS_ENDPOINT", raising=False)
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/T/B/x")
    body = {**BODY, "utm": {}, "referrer": "", "session_id": "s-direct"}
    client.post("/api/telemetry", json=body)
    context = _context_text(_slack_calls()[0]["json"])
    assert "🎯 Direct" in context


def test_upstream_failure_still_204(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENDPOINT", "https://x.example/e")
    FakeAsyncClient.raise_error = True
    res = client.post("/api/telemetry", json=BODY)
    assert res.status_code == 204


def test_malformed_and_missing_ids_are_quiet_204s(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENDPOINT", "https://x.example/e")
    assert client.post(
        "/api/telemetry", content=b"not json", headers={"Content-Type": "application/json"}
    ).status_code == 204
    assert client.post("/api/telemetry", json={"referrer": "x"}).status_code == 204
    assert FakeAsyncClient.calls == []

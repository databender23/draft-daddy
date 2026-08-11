import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import main as main_module
from app.espn import ESPNError

BODY = {
    "league_id": "12345",
    "season": 2026,
    "espn_s2": "cookie",
    "swid": "{AAAA-BBBB}",
    "scoring": "PPR",
    "avg": "average",
}

ROSTER_SLOTS = {
    "qb": 1, "rb": 2, "wr": 3, "te": 1, "flex": 1,
    "superflex": 0, "dst": 1, "k": 1, "bench": 7,
}

DRAFT = {
    "status": {"drafted": True, "in_progress": False, "pick_count": 3},
    "teams": [{"id": 1, "name": "Team One"}, {"id": 2, "name": "Team Two"}],
    "roster_slots": ROSTER_SLOTS,
    "picks": [
        {
            "espn_id": 111,
            "overall": 1,
            "round": 1,
            "espn_team_id": 2,
            "lineup_slot_id": 2,
            "member_id": "{aaaa-bbbb}",
        },
        {
            "espn_id": 222,
            "overall": 2,
            "round": 1,
            "espn_team_id": 1,
            "lineup_slot_id": 16,
            "member_id": "{cccc-dddd}",
        },
        {
            "espn_id": 999,
            "overall": 3,
            "round": 1,
            "espn_team_id": 1,
            "lineup_slot_id": 20,
            "member_id": "{cccc-dddd}",
        },
    ],
}

PLAYER_MAP = {
    111: {"name": "Bijan Robinson", "team": "ATL", "pos": "RB"},
    222: {"name": "Eagles D/ST", "team": "PHI", "pos": "DST"},
}


@pytest.fixture
def client(monkeypatch):
    async def fake_get_draft(league_id, season, espn_s2, swid):
        return DRAFT

    async def fake_get_player_map(season):
        return PLAYER_MAP

    monkeypatch.setattr(main_module, "get_draft", fake_get_draft)
    monkeypatch.setattr(main_module, "get_player_map", fake_get_player_map)
    return TestClient(main_module.app)


def test_sync_response_matches_contract(client):
    res = client.post("/api/espn/sync", json=BODY)
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "status",
        "teams",
        "my_team_id",
        "roster_slots",
        "picks",
        "unmatched",
        "tap",
    }
    assert body["tap"] is None
    assert body["status"] == DRAFT["status"]
    assert body["teams"] == DRAFT["teams"]
    assert body["my_team_id"] == 2
    assert body["roster_slots"] == ROSTER_SLOTS

    picks = body["picks"]
    assert len(picks) == 3
    assert set(picks[0]) == {
        "espn_id",
        "name",
        "team",
        "pos",
        "overall",
        "round",
        "espn_team_id",
        "lineup_slot_id",
        "csv_id",
    }
    assert picks[0]["name"] == "Bijan Robinson"
    assert isinstance(picks[0]["csv_id"], str)
    assert isinstance(picks[1]["csv_id"], str)


def test_unresolvable_espn_id_is_reported_unmatched(client):
    body = client.post("/api/espn/sync", json=BODY).json()
    orphan = next(p for p in body["picks"] if p["espn_id"] == 999)
    assert orphan["csv_id"] is None
    assert orphan["name"] == "ESPN player 999"
    assert 999 in {u["espn_id"] for u in body["unmatched"]}


def test_my_team_id_is_null_when_swid_matches_nothing(client):
    body = client.post("/api/espn/sync", json={**BODY, "swid": "{ZZZZ}"}).json()
    assert body["my_team_id"] is None


def test_member_id_never_leaks_to_the_client(client):
    body = client.post("/api/espn/sync", json=BODY).json()
    assert all("member_id" not in p and "memberId" not in p for p in body["picks"])


@pytest.mark.parametrize(
    "status_code,detail",
    [
        (401, "ESPN rejected your cookies — re-copy espn_s2 and SWID and try again."),
        (404, "League not found — check the league ID and season."),
        (502, "ESPN is having trouble right now — try again in a few seconds."),
    ],
)
def test_espn_errors_become_http_errors(monkeypatch, status_code, detail):
    async def failing(*args, **kwargs):
        raise ESPNError(status_code, detail)

    monkeypatch.setattr(main_module, "get_draft", failing)
    res = TestClient(main_module.app).post("/api/espn/sync", json=BODY)
    assert res.status_code == status_code
    assert res.json() == {"detail": detail}


def test_player_map_failure_still_returns_the_picks(monkeypatch):
    async def fake_get_draft(league_id, season, espn_s2, swid):
        return DRAFT

    async def failing_map(season):
        raise ESPNError(502, "ESPN is having trouble right now — try again in a few seconds.")

    monkeypatch.setattr(main_module, "get_draft", fake_get_draft)
    monkeypatch.setattr(main_module, "get_player_map", failing_map)
    res = TestClient(main_module.app).post("/api/espn/sync", json=BODY)
    assert res.status_code == 200
    body = res.json()
    assert len(body["picks"]) == 3
    assert body["picks"][0]["name"] == "ESPN player 111"
    assert all(p["csv_id"] is None for p in body["picks"])
    assert body["my_team_id"] == 2


def test_invalid_scoring_rejected_before_any_espn_call(monkeypatch):
    async def explode(*args, **kwargs):
        raise AssertionError("ESPN must not be contacted for an invalid slice")

    monkeypatch.setattr(main_module, "get_draft", explode)
    res = TestClient(main_module.app).post("/api/espn/sync", json={**BODY, "scoring": "X"})
    assert res.status_code == 400


def test_health():
    res = TestClient(main_module.app).get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

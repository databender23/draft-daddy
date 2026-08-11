import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import draft_events
from app import main as main_module

KEY = "abcd1234"

PRE_DRAFT = {
    "status": {"drafted": False, "in_progress": True, "pick_count": 0},
    "teams": [{"id": i, "name": f"Team {i}"} for i in range(1, 13)],
    "roster_slots": None,
    "picks": [],
}

PLAYER_MAP = {
    111: {"name": "Bijan Robinson", "team": "ATL", "pos": "RB"},
    222: {"name": "Eagles D/ST", "team": "PHI", "pos": "DST"},
}


def post_events(client, picks, key=KEY, league_id="12345", season=2026):
    return client.post(
        "/api/draft/events",
        json={"league_id": league_id, "season": season, "key": key, "picks": picks},
    )


@pytest.fixture
def client(monkeypatch):
    draft_events.clear_buffers()

    async def fake_get_draft(league_id, season, espn_s2, swid):
        return {
            "status": dict(PRE_DRAFT["status"]),
            "teams": list(PRE_DRAFT["teams"]),
            "roster_slots": None,
            "picks": [],
        }

    async def fake_get_player_map(season):
        return PLAYER_MAP

    monkeypatch.setattr(main_module, "get_draft", fake_get_draft)
    monkeypatch.setattr(main_module, "get_player_map", fake_get_player_map)
    yield TestClient(main_module.app)
    draft_events.clear_buffers()


def test_post_then_get_roundtrip(client):
    res = post_events(
        client,
        [
            {"espn_id": 111, "overall": 1, "espn_team_id": 2},
            {"espn_id": -16021, "overall": 2, "espn_team_id": 3},
        ],
    )
    assert res.status_code == 200
    assert res.json() == {"stored": 2, "total": 2}

    body = client.get(
        "/api/draft/events", params={"league_id": "12345", "season": 2026, "key": KEY}
    ).json()
    assert body["active"] is True
    assert [p["espn_id"] for p in body["picks"]] == [111, -16021]


def test_placeholder_ids_are_dropped_but_dst_survives(client):
    res = post_events(
        client,
        [{"espn_id": 0}, {"espn_id": -1}, {"espn_id": -16001, "overall": 5}],
    )
    assert res.json() == {"stored": 1, "total": 1}


def test_wrong_key_sees_nothing(client):
    post_events(client, [{"espn_id": 111, "overall": 1}])
    body = client.get(
        "/api/draft/events",
        params={"league_id": "12345", "season": 2026, "key": "otherkey"},
    ).json()
    assert body == {"active": False, "picks": [], "last_event_at": None}


def test_init_replay_does_not_erase_live_overall(client):
    post_events(client, [{"espn_id": 111, "overall": 7}])
    post_events(client, [{"espn_id": 111, "overall": None}])
    picks = draft_events.get_picks("12345", 2026, KEY)
    assert picks[0]["overall"] == 7


def test_sync_merges_tap_picks_and_matches_them(client):
    post_events(
        client,
        [
            {"espn_id": 111, "overall": 1, "espn_team_id": 2},
            {"espn_id": 222, "overall": 13, "espn_team_id": 2},
        ],
    )
    body = client.post(
        "/api/espn/sync",
        json={"league_id": "12345", "season": 2026, "tap_key": KEY},
    ).json()

    assert body["tap"]["active"] is True
    assert body["tap"]["picks"] == 2
    assert body["status"]["pick_count"] == 2
    picks = {p["espn_id"]: p for p in body["picks"]}
    assert picks[111]["name"] == "Bijan Robinson"
    assert isinstance(picks[111]["csv_id"], str)
    assert picks[111]["round"] == 1
    # overall 13 in a 12-team league = round 2
    assert picks[222]["round"] == 2


def test_sync_without_tap_key_ignores_buffer(client):
    post_events(client, [{"espn_id": 111, "overall": 1}])
    body = client.post(
        "/api/espn/sync", json={"league_id": "12345", "season": 2026}
    ).json()
    assert body["tap"] is None
    assert body["picks"] == []


def test_api_picks_win_over_tap_duplicates(client, monkeypatch):
    async def fake_get_draft(league_id, season, espn_s2, swid):
        return {
            "status": {"drafted": False, "in_progress": True, "pick_count": 1},
            "teams": list(PRE_DRAFT["teams"]),
            "roster_slots": None,
            "picks": [
                {
                    "espn_id": 111,
                    "overall": 1,
                    "round": 1,
                    "espn_team_id": 4,
                    "lineup_slot_id": 2,
                    "member_id": "{aaaa}",
                }
            ],
        }

    monkeypatch.setattr(main_module, "get_draft", fake_get_draft)
    post_events(client, [{"espn_id": 111, "overall": 1, "espn_team_id": 9}])
    body = client.post(
        "/api/espn/sync",
        json={"league_id": "12345", "season": 2026, "tap_key": KEY},
    ).json()
    assert body["status"]["pick_count"] == 1
    assert body["picks"][0]["espn_team_id"] == 4


def test_missing_overall_gets_sequenced_after_known_picks(client):
    post_events(
        client,
        [
            {"espn_id": 111, "overall": 3},
            {"espn_id": 222, "overall": None},
        ],
    )
    body = client.post(
        "/api/espn/sync",
        json={"league_id": "12345", "season": 2026, "tap_key": KEY},
    ).json()
    picks = {p["espn_id"]: p for p in body["picks"]}
    assert picks[222]["overall"] == 4


def test_short_key_is_rejected(client):
    res = post_events(client, [{"espn_id": 111}], key="ab")
    assert res.status_code == 422


def test_buffer_isolation_by_league_and_season(client):
    post_events(client, [{"espn_id": 111, "overall": 1}], league_id="12345", season=2026)
    assert draft_events.get_picks("12345", 2025, KEY) == []
    assert draft_events.get_picks("99999", 2026, KEY) == []


def test_name_only_picks_are_stored_and_deduped(client):
    res = post_events(
        client,
        [
            {"name": "Bijan Robinson", "team": "ATL", "pos": "rb", "overall": 1},
            {"name": "bijan robinson", "team": "ATL", "pos": "RB", "overall": 1},
            {"name": "   "},
            {},
        ],
    )
    assert res.json() == {"stored": 1, "total": 1}


def test_draft_live_matches_name_only_picks_without_espn(client, monkeypatch):
    async def explode(*args, **kwargs):
        raise AssertionError("draft_live must not call the ESPN league API")

    monkeypatch.setattr(main_module, "get_draft", explode)
    post_events(
        client,
        [{"name": "Bijan Robinson", "team": "ATL", "pos": "RB", "overall": 1, "espn_team_id": 5}],
    )
    body = client.get(
        "/api/draft/live",
        params={"league_id": "12345", "season": 2026, "key": KEY},
    ).json()
    assert body["tap"]["active"] is True
    assert len(body["picks"]) == 1
    pick = body["picks"][0]
    assert pick["espn_id"] is None
    assert pick["name"] == "Bijan Robinson"
    assert isinstance(pick["csv_id"], str)
    assert body["unmatched"] == []


def test_draft_live_resolves_ids_through_player_map(client):
    post_events(client, [{"espn_id": 111, "overall": 1}])
    body = client.get(
        "/api/draft/live",
        params={"league_id": "12345", "season": 2026, "key": KEY},
    ).json()
    assert body["picks"][0]["name"] == "Bijan Robinson"
    assert isinstance(body["picks"][0]["csv_id"], str)


def test_sync_uses_tap_name_when_player_map_lacks_id(client, monkeypatch):
    async def empty_map(season):
        return {}

    monkeypatch.setattr(main_module, "get_player_map", empty_map)
    post_events(
        client,
        [{"espn_id": 424242, "name": "Bijan Robinson", "team": "ATL", "pos": "RB", "overall": 1}],
    )
    body = client.post(
        "/api/espn/sync",
        json={"league_id": "12345", "season": 2026, "tap_key": KEY},
    ).json()
    assert body["picks"][0]["name"] == "Bijan Robinson"
    assert isinstance(body["picks"][0]["csv_id"], str)

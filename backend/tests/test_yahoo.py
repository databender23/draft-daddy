import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import draft_events, main as main_module, yahoo

# Fixtures mirror Yahoo's ?format=json shape: nested arrays of single-key dicts.

GAMES_JSON = {
    "fantasy_content": {
        "games": {
            "0": {"game": [{"game_key": "461", "code": "nfl", "season": "2026"}]},
            "count": 1,
        }
    }
}

LEAGUE_JSON = {
    "fantasy_content": {
        "league": [
            {"league_key": "461.l.12345", "name": "Test League", "draft_status": "drafting"},
            {
                "teams": {
                    "0": {
                        "team": [
                            [
                                {"team_key": "461.l.12345.t.1"},
                                {"name": "Team Uno"},
                                {"is_owned_by_current_login": 1},
                            ]
                        ]
                    },
                    "1": {
                        "team": [
                            [{"team_key": "461.l.12345.t.2"}, {"name": "Team Dos"}]
                        ]
                    },
                    "count": 2,
                }
            },
            {
                "settings": [
                    {
                        "roster_positions": [
                            {"roster_position": {"position": "QB", "count": 1}},
                            {"roster_position": {"position": "RB", "count": 2}},
                            {"roster_position": {"position": "WR", "count": 2}},
                            {"roster_position": {"position": "TE", "count": 1}},
                            {"roster_position": {"position": "W/R/T", "count": 1}},
                            {"roster_position": {"position": "DEF", "count": 1}},
                            {"roster_position": {"position": "K", "count": 1}},
                            {"roster_position": {"position": "BN", "count": 6}},
                            {"roster_position": {"position": "IR", "count": 2}},
                        ]
                    }
                ]
            },
        ]
    }
}


def _player(key, full, abbr, pos):
    return {
        "players": {
            "0": {
                "player": [
                    [
                        {"player_key": key},
                        {"name": {"full": full}},
                        {"editorial_team_abbr": abbr},
                        {"display_position": pos},
                    ]
                ]
            },
            "count": 1,
        }
    }


DRAFT_JSON = {
    "fantasy_content": {
        "league": [
            {"league_key": "461.l.12345"},
            {
                "draft_results": {
                    "0": {
                        "draft_result": [
                            {
                                "pick": 1,
                                "round": 1,
                                "team_key": "461.l.12345.t.2",
                                "player_key": "461.p.9999",
                            },
                            _player("461.p.9999", "Bijan Robinson", "Atl", "RB"),
                        ]
                    },
                    "1": {
                        "draft_result": [
                            {
                                "pick": 2,
                                "round": 1,
                                "cost": "14",
                                "team_key": "461.l.12345.t.1",
                                "player_key": "461.p.100024",
                            },
                            _player("461.p.100024", "Pittsburgh", "Pit", "DEF"),
                        ]
                    },
                    # A slot with no player yet (auction nomination in progress).
                    "2": {"draft_result": {"pick": 3, "round": 1}},
                    "count": 3,
                }
            },
        ]
    }
}


@pytest.fixture
def yahoo_client(monkeypatch):
    draft_events.clear_buffers()
    yahoo.clear_game_key_cache()

    async def fake_get_json(client, path, access_token):
        if path.startswith("/games"):
            return GAMES_JSON
        if "draftresults" in path:
            return DRAFT_JSON
        return LEAGUE_JSON

    monkeypatch.setattr(yahoo, "_get_json", fake_get_json)
    monkeypatch.setenv("YAHOO_CLIENT_ID", "cid")
    monkeypatch.setenv("YAHOO_CLIENT_SECRET", "secret")
    yield TestClient(main_module.app)
    draft_events.clear_buffers()
    yahoo.clear_game_key_cache()


def test_get_draft_parses_yahoo_shapes(yahoo_client):
    draft = asyncio.run(yahoo.get_draft("12345", 2026, "token"))
    assert draft["status"] == {"drafted": False, "in_progress": True, "pick_count": 2}
    assert draft["teams"] == [
        {"id": 1, "name": "Team Uno"},
        {"id": 2, "name": "Team Dos"},
    ]
    assert draft["my_team_id"] == 1
    assert draft["roster_slots"] == {
        "qb": 1, "rb": 2, "wr": 2, "te": 1, "flex": 1,
        "superflex": 0, "dst": 1, "k": 1, "bench": 6,
    }
    picks = draft["picks"]
    assert picks[0]["name"] == "Bijan Robinson"
    assert picks[0]["espn_id"] == 9999
    assert picks[0]["espn_team_id"] == 2
    assert picks[1]["pos"] == "DEF"
    assert picks[1]["team"] == "PIT"


def test_yahoo_sync_matches_picks_to_board(yahoo_client):
    res = yahoo_client.post(
        "/api/yahoo/sync",
        json={"league_id": "12345", "season": 2026, "access_token": "token"},
    )
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "status", "teams", "my_team_id", "roster_slots", "picks", "unmatched", "tap", "auth",
    }
    assert body["my_team_id"] == 1
    picks = {p["name"]: p for p in body["picks"]}
    assert isinstance(picks["Bijan Robinson"]["csv_id"], str)
    # Yahoo DEF resolves through the DST-by-team matcher (Pit -> PIT).
    assert isinstance(picks["Pittsburgh"]["csv_id"], str)
    assert body["unmatched"] == []
    assert body["auth"] is None


def test_yahoo_sync_merges_tap_buffer(yahoo_client):
    draft_events.store_picks(
        "12345",
        2026,
        "abcd1234",
        [draft_events.TapPick(name="Ja'Marr Chase", team="CIN", pos="WR", overall=3)],
    )
    body = yahoo_client.post(
        "/api/yahoo/sync",
        json={
            "league_id": "12345",
            "season": 2026,
            "access_token": "token",
            "tap_key": "abcd1234",
        },
    ).json()
    assert body["tap"]["active"] is True
    assert body["status"]["pick_count"] == 3
    names = [p["name"] for p in body["picks"]]
    assert "Ja'Marr Chase" in names


def test_yahoo_sync_refreshes_when_no_access_token(yahoo_client, monkeypatch):
    async def fake_refresh(refresh_token, client_id, client_secret):
        assert refresh_token == "reftok"
        return {"access_token": "fresh", "expires_in": 3600}

    monkeypatch.setattr(yahoo, "refresh_access_token", fake_refresh)
    body = yahoo_client.post(
        "/api/yahoo/sync",
        json={"league_id": "12345", "season": 2026, "refresh_token": "reftok"},
    ).json()
    assert body["auth"] == {
        "access_token": "fresh",
        "refresh_token": "reftok",
        "expires_in": 3600,
    }
    assert len(body["picks"]) == 2


def test_yahoo_sync_requires_tokens(yahoo_client):
    res = yahoo_client.post("/api/yahoo/sync", json={"league_id": "12345", "season": 2026})
    assert res.status_code == 401


def test_yahoo_endpoints_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("YAHOO_CLIENT_ID", raising=False)
    monkeypatch.delenv("YAHOO_CLIENT_SECRET", raising=False)
    client = TestClient(main_module.app)
    assert client.get("/api/yahoo/status").json() == {"configured": False}
    res = client.post(
        "/api/yahoo/sync",
        json={"league_id": "12345", "season": 2026, "access_token": "x"},
    )
    assert res.status_code == 503


def test_yahoo_status_configured(yahoo_client):
    assert yahoo_client.get("/api/yahoo/status").json() == {"configured": True}

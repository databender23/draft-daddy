"""Context artifacts (team_context.json / player_context.json) + /api/players shape.

The artifacts are optional at runtime, so every test points the env vars at a
committed fixture (or at a path that does not exist) and clears the lru_caches —
never at backend/data/, which changes with each pipeline run.
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from app import context as context_module
from app import main as main_module

FIXTURES = Path(__file__).resolve().parent / "fixtures"
TEAM_FIXTURE = FIXTURES / "team_context.json"
PLAYER_FIXTURE = FIXTURES / "player_context.json"
CORRUPT_FIXTURE = FIXTURES / "corrupt_context.json"

WITH_CONTEXT = "16161"  # Bijan Robinson, present in the player fixture
KONAMI_QB = "13589"  # Josh Allen, the fixture's flagged rushing QB
WITHOUT_CONTEXT = "13604"  # Saquon Barkley, deliberately absent


@pytest.fixture
def client():
    return TestClient(main_module.app)


@pytest.fixture(autouse=True)
def _isolate_context_cache():
    """Every test starts and ends with cold caches and no env overrides."""
    context_module.clear_cache()
    yield
    context_module.clear_cache()


def _point_at(monkeypatch, team_path, player_path):
    monkeypatch.setenv("TEAM_CONTEXT_PATH", str(team_path))
    monkeypatch.setenv("PLAYER_CONTEXT_PATH", str(player_path))
    context_module.clear_cache()


# --- loader -----------------------------------------------------------------


def test_loads_both_fixtures(monkeypatch):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    assert context_module.get_team_context()["season"] == 2026
    assert context_module.get_player_context()["season_prior"] == 2025
    assert set(context_module.get_teams()) == {"ATL", "PHI", "KCC"}
    assert set(context_module.get_player_entries()) == {WITH_CONTEXT, "15281", KONAMI_QB}


def test_missing_files_are_empty(monkeypatch):
    _point_at(monkeypatch, FIXTURES / "nope.json", FIXTURES / "nope.json")
    assert context_module.get_team_context() == {}
    assert context_module.get_player_context() == {}
    assert context_module.get_teams() == {}
    assert context_module.get_player_entries() == {}


def test_corrupt_json_is_empty_not_fatal(monkeypatch):
    _point_at(monkeypatch, CORRUPT_FIXTURE, CORRUPT_FIXTURE)
    assert context_module.get_teams() == {}
    assert context_module.get_player_entries() == {}


def test_results_are_cached(monkeypatch):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    first = context_module.get_team_context()
    monkeypatch.setenv("TEAM_CONTEXT_PATH", str(FIXTURES / "nope.json"))
    assert context_module.get_team_context() is first


# --- /api/players contract --------------------------------------------------


def test_response_has_players_and_teams(monkeypatch, client):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    body = client.get("/api/players").json()
    assert set(body) == {"players", "teams"}
    assert body["players"]
    assert body["teams"]["ATL"] == {
        "bye": 5,
        "pass_rate": 0.58,
        "pass_rank": 4,
        "sos": {"QB": 12, "RB": 27, "WR": 8, "TE": 19, "K": 30, "DST": 3},
    }


def test_teams_map_is_verbatim(monkeypatch, client):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    body = client.get("/api/players").json()
    assert body["teams"] == context_module.get_teams()


def test_last_season_present_and_absent(monkeypatch, client):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    by_id = {p["id"]: p for p in client.get("/api/players").json()["players"]}
    assert all("last_season" in p for p in by_id.values())

    hit = by_id[WITH_CONTEXT]["last_season"]
    assert hit["games"] == 17
    assert hit["opp_label"] == "touches/g"
    assert hit["td_regression"] is True
    assert hit["konami"] is False
    assert hit["rush_share"] is None  # non-QB

    assert by_id[WITHOUT_CONTEXT]["last_season"] is None


def test_konami_qb_carries_rush_share(monkeypatch, client):
    """The tooltip prints the share itself, so it must survive the join."""
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    by_id = {p["id"]: p for p in client.get("/api/players").json()["players"]}
    qb = by_id[KONAMI_QB]["last_season"]
    assert qb["konami"] is True
    assert qb["rush_share"] == pytest.approx(0.3891)


def test_missing_artifacts_degrade_gracefully(monkeypatch, client):
    _point_at(monkeypatch, FIXTURES / "nope.json", FIXTURES / "nope.json")
    body = client.get("/api/players").json()
    assert body["teams"] == {}
    assert body["players"]
    assert all(p["last_season"] is None for p in body["players"])


def test_corrupt_artifacts_degrade_gracefully(monkeypatch, client):
    _point_at(monkeypatch, CORRUPT_FIXTURE, CORRUPT_FIXTURE)
    body = client.get("/api/players").json()
    assert body["teams"] == {}
    assert all(p["last_season"] is None for p in body["players"])


def test_other_player_fields_unchanged(monkeypatch, client):
    from app.players import get_players

    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    served = client.get("/api/players").json()["players"][0]
    cached = get_players("PPR", "average")[0]
    assert {k: v for k, v in served.items() if k != "last_season"} == dict(cached)


def test_cached_board_is_not_mutated(monkeypatch, client):
    from app.players import get_players

    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    client.get("/api/players")
    assert all("last_season" not in p for p in get_players("PPR", "average"))


def test_bad_query_params_still_rejected(monkeypatch, client):
    _point_at(monkeypatch, TEAM_FIXTURE, PLAYER_FIXTURE)
    assert client.get("/api/players?scoring=Bogus").status_code == 400
    assert client.get("/api/players?avg=bogus").status_code == 400

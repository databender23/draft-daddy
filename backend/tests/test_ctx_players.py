"""Konami / rush-share rules in data-pipeline/ctx_players.py.

Pure unit tests on synthetic season aggregates — no network, no artifacts.
The pipeline lives outside the backend package, so the path is added the same
way conftest.py reaches into data-pipeline/output for the pinned CSV.
"""

import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2] / "data-pipeline"
sys.path.insert(0, str(PIPELINE))

import ctx_players  # noqa: E402


def agg(pos="QB", games=16, attempts=460, carries=112, rush_yards=579,
        rush_tds=14, points=364.6):
    """A season total shaped like aggregate_players() output."""
    return {
        "name": "Test Player", "pos": pos, "team": "BUF", "last_week": games,
        "games": games, "target_share_sum": 0.0, "target_share_games": 0,
        "attempts": attempts, "carries": carries, "targets": 0.0,
        "receptions": 0.0, "passing_tds": 28.0, "rushing_tds": rush_tds,
        "receiving_tds": 0.0, "rushing_yards": rush_yards,
        "rushing_2pt_conversions": 0.0, "fantasy_points_ppr": points,
    }


def test_rush_share_is_qb_only():
    assert ctx_players._rush_share(agg()) == pytest.approx(0.3892, abs=1e-4)
    assert ctx_players._rush_share(agg(pos="RB")) is None
    assert ctx_players._rush_share(agg(points=0.0)) == 0.0


def test_workhorse_rushing_qb_is_flagged():
    starter = agg()
    assert ctx_players._konami(starter, ctx_players._rush_share(starter)) is True


def test_low_volume_backup_is_not_flagged():
    """A mop-up QB clears 25 % on two scrambles — volume is the guard."""
    backup = agg(games=2, attempts=4, carries=2, rush_yards=15,
                 rush_tds=0, points=2.58)
    share = ctx_players._rush_share(backup)
    assert share >= ctx_players.KONAMI_THRESHOLD
    assert ctx_players._konami(backup, share) is False


def test_pocket_passer_with_volume_is_not_flagged():
    pocket = agg(attempts=600, carries=30, rush_yards=90, rush_tds=1, points=330.0)
    assert ctx_players._konami(pocket, ctx_players._rush_share(pocket)) is False


def test_entry_carries_rush_share_and_konami():
    entry = ctx_players.build_entry(agg(), ctx_players.league_td_rates({"x": agg()}))
    assert entry["rush_share"] == pytest.approx(0.3892, abs=1e-4)
    assert entry["konami"] is True
    assert ctx_players.build_entry(
        agg(pos="RB"), ctx_players.league_td_rates({"x": agg(pos="RB")})
    )["rush_share"] is None

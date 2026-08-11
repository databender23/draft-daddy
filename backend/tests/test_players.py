import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.players import AVG_TYPES, POSITIONS, SCORING_TYPES, get_players


@pytest.fixture(scope="module")
def board():
    return get_players("PPR", "average")


def test_slice_is_non_trivial(board):
    assert 400 < len(board) < 1200


def test_every_slice_loads():
    for scoring in SCORING_TYPES:
        for avg in AVG_TYPES:
            slice_ = get_players(scoring, avg)
            assert slice_, f"empty slice for {scoring}/{avg}"


def test_ids_are_unique(board):
    ids = [p["id"] for p in board]
    assert len(ids) == len(set(ids))


def test_sorted_by_vor_desc(board):
    vors = [p["vor"] if p["vor"] is not None else -999 for p in board]
    assert vors == sorted(vors, reverse=True)


def test_contract_fields_present(board):
    expected = {
        "id", "name", "first_name", "last_name", "team", "pos", "points",
        "sd_pts", "dropoff", "floor", "ceiling", "vor", "floor_vor",
        "ceiling_vor", "ecr", "adp", "adp_diff", "aav", "uncertainty",
        "rank", "pos_rank", "tier", "age",
    }
    assert expected <= set(board[0].keys())


def test_positions_are_known(board):
    assert {p["pos"] for p in board} <= {"QB", "RB", "WR", "TE", "K", "DST"}


def test_every_slice_covers_every_position():
    for scoring in SCORING_TYPES:
        for avg in AVG_TYPES:
            found = {p["pos"] for p in get_players(scoring, avg)}
            assert set(POSITIONS) <= found, f"{scoring}/{avg} missing {set(POSITIONS) - found}"


def test_weighted_dst_is_backfilled_from_average():
    weighted = {p["id"]: p for p in get_players("PPR", "weighted") if p["pos"] == "DST"}
    average = {p["id"]: p for p in get_players("PPR", "average") if p["pos"] == "DST"}
    assert weighted
    assert set(weighted) == set(average)


def test_non_ppr_slice_differs_from_ppr():
    ppr = {p["id"]: p["points"] for p in get_players("PPR", "average")}
    non_ppr = {p["id"]: p["points"] for p in get_players("Non-PPR", "average")}
    shared = set(ppr) & set(non_ppr)
    assert shared
    assert any(ppr[i] != non_ppr[i] for i in shared)


def test_numeric_types(board):
    for player in board[:50]:
        assert isinstance(player["vor"], float)
        assert player["rank"] is None or isinstance(player["rank"], int)
        assert player["age"] is None or isinstance(player["age"], int)

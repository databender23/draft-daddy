import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.matching import (
    MatchIndex,
    first_name_variant,
    normalize_name,
    normalize_team,
)
from app.players import get_players


@pytest.fixture(scope="module")
def board():
    return get_players("PPR", "average")


@pytest.fixture(scope="module")
def index(board):
    return MatchIndex(board)


@pytest.fixture(scope="module")
def by_id(board):
    return {p["id"]: p for p in board}


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Kenneth Walker III", "kenneth walker"),
        ("De'Von Achane", "devon achane"),
        ("Amon-Ra St. Brown", "amonra st brown"),
        ("Michael Penix Jr.", "michael penix"),
        ("  Josh   Allen  ", "josh allen"),
        ("Marvin Harrison Jr.", "marvin harrison"),
    ],
)
def test_normalize_name(raw, expected):
    assert normalize_name(raw) == expected


def test_normalize_team_fixups():
    assert normalize_team("GB") == "GBP"
    assert normalize_team("JAX") == "JAC"
    assert normalize_team("WSH") == "WAS"
    assert normalize_team("BAL") == "BAL"


@pytest.mark.parametrize(
    "name,team,pos,expected_last",
    [
        ("Kenneth Walker III", "SEA", "RB", "Walker III"),
        ("De'Von Achane", "MIA", "RB", "Achane"),
        ("Amon-Ra St. Brown", "DET", "WR", "St. Brown"),
        ("Michael Penix Jr.", "ATL", "QB", "Penix Jr."),
    ],
)
def test_suffix_and_punctuation_matches(index, by_id, name, team, pos, expected_last):
    csv_id = index.match(name, team, pos)
    assert csv_id is not None
    assert by_id[csv_id]["last_name"] == expected_last


def test_dst_matches_by_team_not_name(index, by_id):
    csv_id = index.match("Eagles D/ST", "PHI", "DST")
    assert csv_id is not None
    player = by_id[csv_id]
    assert player["pos"] == "DST"
    assert player["team"] == "PHI"


def test_dst_with_espn_team_fixup(index, by_id):
    csv_id = index.match("Packers D/ST", "GB", "DST")
    assert csv_id is not None
    assert by_id[csv_id]["team"] == "GBP"


def test_espn_gb_abbrev_matches_csv_gbp(index, by_id):
    csv_id = index.match("Josh Jacobs", "GB", "RB")
    assert csv_id is not None
    player = by_id[csv_id]
    assert player["team"] == "GBP"
    assert player["name"] == "Josh Jacobs"


def test_team_drift_still_matches_on_name_and_pos(index, by_id):
    csv_id = index.match("Amon-Ra St. Brown", "FA", "WR")
    assert csv_id is not None
    assert by_id[csv_id]["last_name"] == "St. Brown"


def test_unmatched_player_returns_none(index):
    assert index.match("Fictional Nonexistent Player", "SEA", "WR") is None
    assert index.match("Josh Allen", "BUF", "TE") is None


def test_dst_unknown_team_returns_none(index):
    assert index.match("Berlin D/ST", "BER", "DST") is None


def test_last_name_first_initial_tier(index, by_id):
    direct = index.match("De'Von Achane", "MIA", "RB")
    small_index = MatchIndex([by_id[direct]])
    assert small_index.match("D. Achane", "MIA", "RB") == direct
    assert small_index.match("Devon Achane Jr.", "MIA", "RB") == direct


@pytest.mark.parametrize(
    "a,b,expected",
    [
        ("chig", "chigoziem", True),
        ("irv", "irvin", True),
        ("jeff", "jeffery", True),
        ("kenny", "kenneth", True),
        ("josh", "javonte", False),
        ("jamaal", "javonte", False),
        ("jacardia", "jaylen", False),
        ("kevin", "keon", False),
        ("", "kenneth", False),
    ],
)
def test_first_name_variant(a, b, expected):
    assert first_name_variant(a, b) is expected


@pytest.mark.parametrize(
    "espn_name,espn_team,pos,csv_name",
    [
        ("Chig Okonkwo", "WSH", "TE", "Chigoziem Okonkwo"),
        ("Kenny Gainwell", "TB", "RB", "Kenneth Gainwell"),
        ("Irv Charles", "SEA", "WR", "Irvin Charles"),
    ],
)
def test_short_form_first_name_survives_team_change(
    index, by_id, espn_name, espn_team, pos, csv_name
):
    csv_id = index.match(espn_name, espn_team, pos)
    assert csv_id is not None
    assert by_id[csv_id]["name"] == csv_name


@pytest.mark.parametrize(
    "espn_name,espn_team,pos",
    [
        ("Josh Williams", "TB", "RB"),
        ("Jamaal Williams", "FA", "RB"),
        ("Jacardia Wright", "SEA", "RB"),
        ("Kevin Coleman Jr.", "MIA", "WR"),
        ("Tejhaun Palmer", "NE", "WR"),
    ],
)
def test_different_players_sharing_a_last_name_do_not_collide(index, espn_name, espn_team, pos):
    assert index.match(espn_name, espn_team, pos) is None

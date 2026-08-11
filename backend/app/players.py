"""Load and serve the ffanalytics VOR projections CSV."""

import csv
import os
from functools import lru_cache

DATA_PATH = os.environ.get(
    "DATA_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "projections.csv"),
)

SCORING_TYPES = ("PPR", "Half-PPR", "Non-PPR")
AVG_TYPES = ("average", "robust", "weighted")
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DST")

# The `weighted` slice of the source CSV carries no DST rows at all; a board
# missing a whole position would make those players undraftable and every ESPN
# pick at that position unmatchable, so it is backfilled from this slice.
FALLBACK_AVG_TYPE = "average"

_FLOAT_FIELDS = {
    "points": "points",
    "sd_pts": "sd_pts",
    "dropoff": "dropoff",
    "floor": "floor",
    "ceiling": "ceiling",
    "points_vor": "vor",
    "floor_vor": "floor_vor",
    "ceiling_vor": "ceiling_vor",
    "overall_ecr": "ecr",
    "adp": "adp",
    "adp_diff": "adp_diff",
    "aav": "aav",
    "uncertainty": "uncertainty",
}

_INT_FIELDS = {
    "rank": "rank",
    "pos_rank": "pos_rank",
    "tier": "tier",
    "age": "age",
}


def _to_float(value):
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _vor_key(player):
    return player["vor"] if player["vor"] is not None else float("-inf")


@lru_cache(maxsize=1)
def _load_all():
    with open(DATA_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _slice_by_id(scoring: str, avg_type: str) -> dict:
    by_id = {}
    for row in _load_all():
        if row.get("scoring_type") != scoring or row.get("avg_type") != avg_type:
            continue
        player = {
            "id": row["id"],
            "name": f"{row['first_name']} {row['last_name']}".strip(),
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "team": row["team"],
            "pos": row["pos"],
        }
        for src, dest in _FLOAT_FIELDS.items():
            player[dest] = _to_float(row.get(src))
        for src, dest in _INT_FIELDS.items():
            player[dest] = _to_int(row.get(src))
        existing = by_id.get(player["id"])
        if existing is None or _vor_key(player) > _vor_key(existing):
            by_id[player["id"]] = player
    return by_id


@lru_cache(maxsize=16)
def get_players(scoring: str = "PPR", avg_type: str = "average") -> tuple:
    """Return the player board for one scoring type + averaging method.

    Deduped by ffanalytics player id (keeps the higher-VOR row), backfilled for
    positions the slice omits entirely, and sorted by VOR descending.
    """
    by_id = _slice_by_id(scoring, avg_type)

    if avg_type != FALLBACK_AVG_TYPE:
        present = {player["pos"] for player in by_id.values()}
        missing = {pos for pos in POSITIONS if pos not in present}
        if missing:
            for player in _slice_by_id(scoring, FALLBACK_AVG_TYPE).values():
                if player["pos"] in missing and player["id"] not in by_id:
                    by_id[player["id"]] = player

    players = sorted(by_id.values(), key=_vor_key, reverse=True)
    return tuple(players)

"""Prior-season player context, joined to projections.csv ids.

Volume is sticky, touchdowns are not — so the artifact carries opportunity
(touches / targets / plays per game), PPR points per game, target share, and two
flags: TD regression risk (actual TDs well above what the player's own volume
predicts at league-average rates) and the QB "Konami code" rushing share
(`rush_share`, plus a `konami` boolean that also demands a real workload).
"""

import unicodedata
from collections import defaultdict

from ctx_sources import ff_team, num

SKILL_POSITIONS = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE"}
OPP_LABELS = {"QB": "plays/g", "RB": "touches/g", "WR": "targets/g", "TE": "targets/g"}
TD_REGRESSION_THRESHOLD = 3.0
TD_REGRESSION_THRESHOLD_QB = 6.0
KONAMI_THRESHOLD = 0.25
# Rushing share is meaningless on a handful of snaps: a backup who scrambles
# twice in mop-up duty clears 25 % on noise alone, and the badge reads as
# "high floor". 150 plays (attempts + carries) is roughly four full starts.
KONAMI_MIN_PLAYS = 150

_VOLUME_KEYS = (
    "attempts", "carries", "targets", "receptions", "passing_tds", "rushing_tds",
    "receiving_tds", "rushing_yards", "rushing_2pt_conversions", "fantasy_points_ppr",
)


def ascii_fold(name: str) -> str:
    """Strip accents — nflverse writes "Audric Estimé", the CSV writes "Estime",
    and matching.normalize_name would otherwise drop the accented letter entirely."""
    decomposed = unicodedata.normalize("NFKD", name or "")
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def aggregate_players(weekly: list) -> dict:
    """{player_id: season totals} for skill-position regular-season rows."""
    totals = {}
    for row in weekly:
        if row.get("season_type") != "REG":
            continue
        pos = SKILL_POSITIONS.get(row.get("position") or "")
        if not pos:
            continue
        pid = row.get("player_id")
        if not pid:
            continue
        agg = totals.get(pid)
        if agg is None:
            agg = totals[pid] = {
                "name": ascii_fold(
                    row.get("player_display_name") or row.get("player_name") or ""
                ),
                "pos": pos,
                "team": ff_team(row["team"]),
                "last_week": -1,
                "games": 0,
                "target_share_sum": 0.0,
                "target_share_games": 0,
                **{key: 0.0 for key in _VOLUME_KEYS},
            }
        week = int(num(row, "week"))
        if week > agg["last_week"]:
            agg["last_week"] = week
            agg["team"] = ff_team(row["team"])  # trades: use the latest team
        agg["games"] += 1
        for key in _VOLUME_KEYS:
            agg[key] += num(row, key)
        if (row.get("target_share") or "").strip() not in ("", "NA"):
            agg["target_share_sum"] += num(row, "target_share")
            agg["target_share_games"] += 1
    return totals


def league_td_rates(totals: dict) -> dict:
    """Position-average TD per opportunity: {pos: {"rush":, "rec":, "pass":}}."""
    sums = defaultdict(lambda: defaultdict(float))
    for agg in totals.values():
        bucket = sums[agg["pos"]]
        for key in ("carries", "targets", "attempts", "rushing_tds",
                    "receiving_tds", "passing_tds"):
            bucket[key] += agg[key]
    rates = {}
    for pos, bucket in sums.items():
        rates[pos] = {
            "rush": bucket["rushing_tds"] / bucket["carries"] if bucket["carries"] else 0.0,
            "rec": bucket["receiving_tds"] / bucket["targets"] if bucket["targets"] else 0.0,
            "pass": bucket["passing_tds"] / bucket["attempts"] if bucket["attempts"] else 0.0,
        }
    return rates


def _opportunities(agg: dict) -> float:
    pos = agg["pos"]
    if pos == "QB":
        return agg["attempts"] + agg["carries"]
    if pos == "RB":
        return agg["carries"] + agg["targets"]
    return agg["targets"]


def _expected_tds(agg: dict, rates: dict) -> float:
    rate = rates.get(agg["pos"], {"rush": 0.0, "rec": 0.0, "pass": 0.0})
    if agg["pos"] == "QB":
        return agg["attempts"] * rate["pass"] + agg["carries"] * rate["rush"]
    return agg["carries"] * rate["rush"] + agg["targets"] * rate["rec"]


def _actual_tds(agg: dict) -> float:
    if agg["pos"] == "QB":
        return agg["passing_tds"] + agg["rushing_tds"]
    return agg["rushing_tds"] + agg["receiving_tds"]


def _rush_share(agg: dict):
    """Share of a QB's PPR points earned with his legs; None off-position.

    The tooltip prints this number, so it is emitted for every QB, flagged or not.
    """
    if agg["pos"] != "QB":
        return None
    if agg["fantasy_points_ppr"] <= 0:
        return 0.0
    rushing = (
        agg["rushing_yards"] / 10.0
        + 6 * agg["rushing_tds"]
        + 2 * agg["rushing_2pt_conversions"]
    )
    return round(rushing / agg["fantasy_points_ppr"], 4)


def _konami(agg: dict, rush_share) -> bool:
    """Rushing-floor badge: a high share *plus* enough volume to believe it."""
    if rush_share is None:
        return False
    if agg["attempts"] + agg["carries"] < KONAMI_MIN_PLAYS:
        return False
    return rush_share >= KONAMI_THRESHOLD


def _td_regression(agg: dict, actual: float, expected: float, konami: bool) -> bool:
    # QB TD totals (23-46) dwarf RB/WR totals (5-15), so the flat threshold is
    # inside normal noise there; and designed-runner QBs beat the pooled QB
    # rushing-TD rate every year by construction, not by luck — a konami QB's
    # "excess" TDs are his identity, not a regression signal.
    if agg["pos"] == "QB":
        if konami:
            return False
        return (actual - expected) >= TD_REGRESSION_THRESHOLD_QB
    return (actual - expected) >= TD_REGRESSION_THRESHOLD


def build_entry(agg: dict, rates: dict) -> dict:
    games = max(agg["games"], 1)
    expected = _expected_tds(agg, rates)
    actual = _actual_tds(agg)
    share = None
    if agg["pos"] != "QB" and agg["target_share_games"]:
        share = round(agg["target_share_sum"] / agg["target_share_games"], 4)
    rush_share = _rush_share(agg)
    konami = _konami(agg, rush_share)
    return {
        "games": agg["games"],
        "ppg": round(agg["fantasy_points_ppr"] / games, 2),
        "opportunities_pg": round(_opportunities(agg) / games, 2),
        "opp_label": OPP_LABELS[agg["pos"]],
        "target_share": share,
        "tds": int(round(actual)),
        "expected_tds": round(expected, 2),
        "td_regression": _td_regression(agg, actual, expected, konami),
        "konami": konami,
        "rush_share": rush_share,
    }


def _quality(agg: dict) -> tuple:
    return (agg["games"], agg["fantasy_points_ppr"])


def build_players(weekly: list, index) -> tuple:
    """Return ({csv_id: entry}, join report). `index` is a matching.MatchIndex."""
    totals = aggregate_players(weekly)
    rates = league_td_rates(totals)

    players, claimed, unmatched = {}, {}, []
    for agg in totals.values():
        csv_id = index.match(agg["name"], agg["team"], agg["pos"])
        if not csv_id:
            unmatched.append(agg)
            continue
        held = claimed.get(csv_id)
        if held is not None and _quality(held) >= _quality(agg):
            continue
        claimed[csv_id] = agg
        players[csv_id] = build_entry(agg, rates)

    unmatched.sort(key=lambda a: a["fantasy_points_ppr"], reverse=True)
    report = {
        "candidates": len(totals),
        "matched": len(players),
        "unmatched": unmatched,
        "td_rates": rates,
        "flagged_regression": sorted(
            (claimed[pid]["name"] for pid, e in players.items() if e["td_regression"])
        ),
        "flagged_konami": sorted(
            f"{claimed[pid]['name']} ({e['rush_share']:.0%})"
            for pid, e in players.items()
            if e["konami"]
        ),
    }
    return players, report

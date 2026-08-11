"""Team-level context: run/pass lean and positional strength of schedule.

SOS methodology (same as the mainstream preseason sites): measure how many
fantasy points each defense allowed per game to each position last season, then
average that over every game on the team's upcoming schedule.
Rank 1 = EASIEST = opponents allowed the MOST points.
"""

from collections import defaultdict

from ctx_sources import ff_team, num

POSITIONS = ("QB", "RB", "WR", "TE", "K", "DST")

# nflverse `position` -> the fantasy bucket it scores in. FB is an RB for
# fantasy purposes (matching.POSITION_ALIASES agrees).
POSITION_BUCKET = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "K": "K"}

# ESPN-style kicking scoring; nflverse leaves fantasy_points_ppr at 0 for
# kickers, so K production has to be reconstructed from the make/miss columns.
FG_BUCKETS = (
    ("fg_made_0_19", 3.0), ("fg_made_20_29", 3.0), ("fg_made_30_39", 3.0),
    ("fg_made_40_49", 4.0), ("fg_made_50_59", 5.0), ("fg_made_60_", 5.0),
)

# ESPN D/ST points-allowed tiers, (max_points_allowed, fantasy_points).
DST_TIERS = ((0, 5.0), (6, 4.0), (13, 3.0), (17, 1.0), (27, 0.0), (34, -1.0), (45, -3.0))
DST_SHUTOUT_FLOOR = -5.0


def kicker_points(row: dict) -> float:
    total = sum(weight * num(row, key) for key, weight in FG_BUCKETS)
    return total + num(row, "pat_made") - num(row, "fg_missed") - num(row, "pat_missed")


def _points_allowed_tier(points: float) -> float:
    for limit, value in DST_TIERS:
        if points <= limit:
            return value
    return DST_SHUTOUT_FLOOR


def pass_lean(team_rows: list) -> dict:
    """{ff_team: {"pass_rate": float, "pass_rank": int}} from team season totals."""
    rates = {}
    for row in team_rows:
        if row.get("season_type") != "REG":
            continue
        attempts, carries = num(row, "attempts"), num(row, "carries")
        plays = attempts + carries
        if plays <= 0:
            continue
        rates[ff_team(row["team"])] = attempts / plays
    ranked = sorted(rates, key=lambda t: rates[t], reverse=True)
    return {
        team: {"pass_rate": round(rates[team], 4), "pass_rank": i + 1}
        for i, team in enumerate(ranked)
    }


def _team_week_tables(weekly: list) -> tuple:
    """Per team-week: points scored, and the D/ST fantasy points its defense earned."""
    scored = defaultdict(float)
    defense = defaultdict(float)
    opponent = {}
    for row in weekly:
        key = (ff_team(row["team"]), row["week"])
        opponent[key] = ff_team(row["opponent_team"])
        scored[key] += (
            6 * (num(row, "rushing_tds") + num(row, "receiving_tds")
                 + num(row, "special_teams_tds") + num(row, "def_tds"))
            + 3 * num(row, "fg_made")
            + num(row, "pat_made")
            + 2 * (num(row, "rushing_2pt_conversions") + num(row, "receiving_2pt_conversions"))
        )
        defense[key] += (
            num(row, "def_sacks")
            + 2 * num(row, "def_interceptions")
            + 2 * num(row, "fumble_recovery_opp")
            + 2 * num(row, "def_safeties")
            + 6 * (num(row, "def_tds") + num(row, "special_teams_tds"))
        )
    return scored, defense, opponent


def points_allowed_per_game(weekly: list) -> dict:
    """{defense_ff_team: {position: mean fantasy points allowed per game}}.

    Regular season only. A defense's D/ST column is the D/ST production the
    *opposing* defense put up against this team's offense (sacks, takeaways,
    return TDs and the points-allowed tier) — i.e. how generous this offense is
    to a streaming D/ST.
    """
    weekly = [r for r in weekly if r.get("season_type") == "REG"]
    scored, defense, opponent = _team_week_tables(weekly)

    allowed = defaultdict(lambda: defaultdict(float))
    games = defaultdict(set)
    for row in weekly:
        bucket = POSITION_BUCKET.get(row.get("position") or "")
        if not bucket:
            continue
        points = kicker_points(row) if bucket == "K" else num(row, "fantasy_points_ppr")
        allowed[ff_team(row["opponent_team"])][bucket] += points

    for (team, week), opp in opponent.items():
        games[team].add(week)
        # The D/ST facing `opp`'s offense scored this; charge it to `opp`.
        allowed[opp]["DST"] += defense[(team, week)] + _points_allowed_tier(
            scored.get((opp, week), 0.0)
        )

    return {
        team: {
            pos: round(allowed[team].get(pos, 0.0) / len(weeks), 3) for pos in POSITIONS
        }
        for team, weeks in games.items()
    }


def strength_of_schedule(schedules: dict, allowed: dict) -> dict:
    """{ff_team: {position: rank 1..32}} — 1 = easiest schedule."""
    raw = {}
    for team, plan in schedules.items():
        opponents = [o for o in plan["opponents"] if o in allowed]
        if not opponents:
            continue
        raw[team] = {
            pos: sum(allowed[o][pos] for o in opponents) / len(opponents)
            for pos in POSITIONS
        }

    ranks = {team: {} for team in raw}
    for pos in POSITIONS:
        # Highest opponent points allowed = softest schedule = rank 1.
        order = sorted(raw, key=lambda t: raw[t][pos], reverse=True)
        for i, team in enumerate(order):
            ranks[team][pos] = i + 1
    return ranks


def build_teams(schedules: dict, team_rows: list, weekly: list) -> tuple:
    lean = pass_lean(team_rows)
    allowed = points_allowed_per_game(weekly)
    sos = strength_of_schedule(schedules, allowed)

    teams = {}
    for team, plan in sorted(schedules.items()):
        entry = lean.get(team, {"pass_rate": None, "pass_rank": None})
        teams[team] = {
            "bye": plan["bye"],
            "pass_rate": entry["pass_rate"],
            "pass_rank": entry["pass_rank"],
            "sos": sos.get(team, {}),
        }
    return teams, allowed

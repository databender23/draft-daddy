#!/usr/bin/env python3
"""Build the team + player context artifacts the draft app tooltips read.

    python3 build_team_context.py [season]      # season defaults to the current year

Writes ../backend/data/team_context.json (bye week, run/pass lean, positional
strength of schedule for `season`) and ../backend/data/player_context.json
(prior-season production keyed by projections.csv ids). Both are static artifacts
baked into the image — draft day makes no new network calls.

Sources: ESPN's public proTeamSchedules_wl endpoint and the nflverse release
CSVs (cached under cache/; delete a file there to force a re-download).
"""

import datetime
import json
import sys
import types
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
BACKEND_APP = PIPELINE_DIR.parent / "backend"
sys.path.insert(0, str(PIPELINE_DIR))
sys.path.insert(0, str(BACKEND_APP))

import ctx_players  # noqa: E402
import ctx_sources  # noqa: E402
import ctx_teams  # noqa: E402

try:  # espn.py imports httpx, which only the backend venv is guaranteed to have
    from app.espn import team_abbrev
except ModuleNotFoundError:  # pragma: no cover - offline convenience shim
    _stub = types.ModuleType("httpx")
    _stub.__getattr__ = lambda name: object  # annotations only, never called
    sys.modules.setdefault("httpx", _stub)
    from app.espn import team_abbrev

from app.matching import build_index  # noqa: E402
from app.players import get_players  # noqa: E402

DATA_DIR = PIPELINE_DIR.parent / "backend" / "data"
TEAM_TARGET = DATA_DIR / "team_context.json"
PLAYER_TARGET = DATA_DIR / "player_context.json"
EXPECTED_TEAMS = 32
SOS_POSITIONS = ctx_teams.POSITIONS


def build(season: int) -> tuple:
    prior = season - 1
    print(f"Building context for {season} (prior season {prior})")

    print("ESPN schedules:")
    schedules = ctx_sources.espn_schedules(season, team_abbrev)
    print("nflverse:")
    team_rows = ctx_sources.team_season_stats(prior)
    weekly = ctx_sources.player_week_stats(prior)

    teams, allowed = ctx_teams.build_teams(schedules, team_rows, weekly)

    index = build_index(get_players("PPR", "average"))
    players, report = ctx_players.build_players(weekly, index)

    team_doc = {
        "season": season,
        "generated": datetime.date.today().isoformat(),
        "teams": teams,
    }
    player_doc = {"season_prior": prior, "players": players}
    return team_doc, player_doc, report, allowed


def validate(team_doc: dict, player_doc: dict) -> list:
    errors = []
    teams = team_doc["teams"]
    if len(teams) != EXPECTED_TEAMS:
        errors.append(f"expected {EXPECTED_TEAMS} teams, got {len(teams)}")
    for team, entry in teams.items():
        missing = [p for p in SOS_POSITIONS if p not in entry.get("sos", {})]
        if missing:
            errors.append(f"{team}: missing SOS for {missing}")
        if not entry.get("bye"):
            errors.append(f"{team}: no bye week")
        if entry.get("pass_rate") is None:
            errors.append(f"{team}: no pass rate")
    for pos in SOS_POSITIONS:
        ranks = sorted(e["sos"][pos] for e in teams.values() if pos in e.get("sos", {}))
        if ranks != list(range(1, len(teams) + 1)):
            errors.append(f"SOS ranks for {pos} are not a 1..{len(teams)} permutation")
    if not player_doc["players"]:
        errors.append("player_context is empty")
    return errors


def summarize(team_doc, player_doc, report, allowed) -> None:
    teams = team_doc["teams"]
    print(f"\nTeams: {len(teams)}")
    lean = sorted(teams.items(), key=lambda kv: kv[1]["pass_rank"])
    print("  Most pass-heavy:", ", ".join(
        f"{t} {e['pass_rate']:.0%}" for t, e in lean[:5]))
    print("  Most run-heavy: ", ", ".join(
        f"{t} {1 - e['pass_rate']:.0%}" for t, e in lean[-5:][::-1]))
    print("  Sample rows:")
    for team in ("KCC", "IND", "LVR", "LAR"):
        entry = teams.get(team)
        if entry:
            sos = " ".join(f"{p}{entry['sos'][p]:>3}" for p in SOS_POSITIONS)
            print(f"    {team:4s} bye {entry['bye']:>2}  pass {entry['pass_rate']:.3f} "
                  f"(#{entry['pass_rank']:>2})  SOS {sos}")
    for pos in SOS_POSITIONS:
        easy = sorted(teams, key=lambda t: teams[t]["sos"][pos])[:3]
        hard = sorted(teams, key=lambda t: -teams[t]["sos"][pos])[:3]
        soft = max(allowed, key=lambda t: allowed[t][pos])
        print(f"    SOS {pos:3s}: easiest {easy} | toughest {hard} "
              f"(softest {pos} defense last year: {soft} {allowed[soft][pos]:.1f}/g)")

    players = player_doc["players"]
    matched, candidates = report["matched"], report["candidates"]
    print(f"\nPlayers: {matched}/{candidates} nflverse skill players joined to CSV ids "
          f"({matched / candidates:.1%})")
    print("  Top unmatched (by PPR points last season):")
    for agg in report["unmatched"][:10]:
        print(f"    {agg['name']:24s} {agg['pos']:3s} {agg['team']:4s} "
              f"{agg['fantasy_points_ppr']:6.1f} pts")
    rates = report["td_rates"]
    print("  League TD rates: " + ", ".join(
        f"{pos} rush {r['rush']:.3f}/car, rec {r['rec']:.3f}/tgt"
        + (f", pass {r['pass']:.3f}/att" if pos == "QB" else "")
        for pos, r in sorted(rates.items())))
    print(f"\n  TD regression flags ({len(report['flagged_regression'])}): "
          + ", ".join(report["flagged_regression"]))
    print(f"  Konami flags ({len(report['flagged_konami'])}): "
          + ", ".join(report["flagged_konami"]))
    top = sorted(players.items(), key=lambda kv: -kv[1]["ppg"])[:5]
    print("  Sample entries (top PPG):")
    for pid, entry in top:
        share = f" {entry['target_share']:.0%} tgt" if entry["target_share"] else ""
        print(f"    id {pid:>7s}  {entry['games']:>2}g {entry['ppg']:5.1f} PPG "
              f"{entry['opportunities_pg']:5.1f} {entry['opp_label']}{share}")


def write(path: Path, doc: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, sort_keys=False)
        f.write("\n")
    print(f"Wrote {path} ({path.stat().st_size // 1024} KB)")


def main() -> None:
    season = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today().year
    team_doc, player_doc, report, allowed = build(season)

    errors = validate(team_doc, player_doc)
    summarize(team_doc, player_doc, report, allowed)
    if errors:
        print("\nFAIL:")
        for error in errors:
            print(f"  {error}")
        sys.exit(1)

    print()
    write(TEAM_TARGET, team_doc)
    write(PLAYER_TARGET, player_doc)
    print("Restart the backend (or rebuild the Docker image) to serve the new context.")


if __name__ == "__main__":
    main()

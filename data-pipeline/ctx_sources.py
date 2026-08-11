"""Data sources for build_team_context.py: ESPN schedules + nflverse CSVs.

Pure stdlib (urllib). Downloads are cached in data-pipeline/cache/ and reused,
so re-runs are offline and fast. Delete a cached file to force a refresh.
"""

import csv
import json
import urllib.request
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
CACHE_DIR = PIPELINE_DIR / "cache"

ESPN_SCHEDULE_URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
    "{season}?view=proTeamSchedules_wl"
)
NFLVERSE_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/{group}/{name}"
)
USER_AGENT = "draft-app-team-context/1.0 (+https://github.com/nflverse)"
TIMEOUT = 60

# nflverse abbrevs -> ffanalytics abbrevs used by projections.csv.
# LA is the Rams in nflverse (LAR is never emitted); everything not listed
# is already identical in both vocabularies.
NFLVERSE_TO_FF = {
    "GB": "GBP",
    "KC": "KCC",
    "NE": "NEP",
    "NO": "NOS",
    "SF": "SFO",
    "TB": "TBB",
    "LV": "LVR",
    "JAX": "JAC",
    "LA": "LAR",
    "WSH": "WAS",
    "OAK": "LVR",
    "SD": "LAC",
    "STL": "LAR",
}


def num(row: dict, key: str) -> float:
    """Numeric CSV cell as float; blanks / NA / junk become 0.0."""
    try:
        return float(row.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


def ff_team(nflverse_abbrev: str) -> str:
    key = (nflverse_abbrev or "").strip().upper()
    return NFLVERSE_TO_FF.get(key, key)


def _download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cached  {dest.name} ({dest.stat().st_size // 1024} KB)")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  fetch   {url}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        payload = response.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(payload)
    tmp.replace(dest)
    print(f"  saved   {dest.name} ({dest.stat().st_size // 1024} KB)")
    return dest


def fetch_espn_season(season: int) -> dict:
    """Raw ESPN proTeamSchedules_wl payload for one season (cached)."""
    dest = CACHE_DIR / f"espn_pro_schedules_{season}.json"
    _download(ESPN_SCHEDULE_URL.format(season=season), dest)
    with dest.open(encoding="utf-8") as f:
        return json.load(f)


def nflverse_csv(group: str, name: str) -> list:
    """Download (once) and parse an nflverse release CSV into dict rows."""
    dest = CACHE_DIR / name
    _download(NFLVERSE_URL.format(group=group, name=name), dest)
    with dest.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def team_season_stats(prior_season: int) -> list:
    return nflverse_csv("stats_team", f"stats_team_reg_{prior_season}.csv")


def player_week_stats(prior_season: int) -> list:
    return nflverse_csv("stats_player", f"stats_player_week_{prior_season}.csv")


def espn_schedules(season: int, espn_to_ff) -> dict:
    """{ff_abbrev: {"bye": int|None, "opponents": [ff_abbrev, ...]}} for `season`.

    Opponents repeat when two teams meet twice (division games) — that is
    intentional, SOS averages over the games actually played. ESPN omits the bye
    week key from proGamesByScoringPeriod, so opponents == games played.
    """
    payload = fetch_espn_season(season)
    pro_teams = payload.get("settings", {}).get("proTeams", [])
    by_id = {}
    for team in pro_teams:
        team_id = team.get("id")
        abbrev = espn_to_ff(team_id)
        if not team_id or not abbrev or abbrev == "FA":
            continue
        by_id[team_id] = abbrev

    schedules = {}
    for team in pro_teams:
        team_id = team.get("id")
        abbrev = by_id.get(team_id)
        if not abbrev:
            continue
        bye = team.get("byeWeek") or None
        opponents = []
        games = team.get("proGamesByScoringPeriod") or {}
        for week in sorted(games, key=lambda w: int(w)):
            for game in games[week]:
                away = game.get("awayProTeamId")
                home = game.get("homeProTeamId")
                other = away if home == team_id else home
                opponent = by_id.get(other)
                if opponent:
                    opponents.append(opponent)
        schedules[abbrev] = {"bye": bye, "opponents": opponents}
    return schedules

"""Load the optional team/player context artifacts built by data-pipeline.

Both files are static JSON baked next to projections.csv. They are optional at
runtime: a missing or corrupt file degrades to an empty dict so the board keeps
serving (the UI just omits tooltips).

Paths follow the DATA_PATH pattern in players.py — module-level defaults that an
env var can override. The loaders re-read the env var on each cache miss so
tests can monkeypatch + cache_clear without re-importing the module.
"""

import json
import os
from functools import lru_cache

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

TEAM_CONTEXT_PATH = os.environ.get(
    "TEAM_CONTEXT_PATH", os.path.join(_DATA_DIR, "team_context.json")
)
PLAYER_CONTEXT_PATH = os.environ.get(
    "PLAYER_CONTEXT_PATH", os.path.join(_DATA_DIR, "player_context.json")
)


def _load_json(path: str) -> dict:
    """Return the parsed object, or {} for missing/unreadable/non-object JSON."""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def get_team_context() -> dict:
    """`team_context.json` as a dict: {season, generated, teams: {abbrev: {...}}}."""
    return _load_json(os.environ.get("TEAM_CONTEXT_PATH", TEAM_CONTEXT_PATH))


@lru_cache(maxsize=1)
def get_player_context() -> dict:
    """`player_context.json` as a dict: {season_prior, players: {csv_id: {...}}}."""
    return _load_json(os.environ.get("PLAYER_CONTEXT_PATH", PLAYER_CONTEXT_PATH))


def get_teams() -> dict:
    """The `teams` map alone ({} when the artifact is absent or malformed)."""
    teams = get_team_context().get("teams")
    return teams if isinstance(teams, dict) else {}


def get_player_entries() -> dict:
    """The `players` map alone ({} when the artifact is absent or malformed)."""
    entries = get_player_context().get("players")
    return entries if isinstance(entries, dict) else {}


def clear_cache() -> None:
    """Drop both cached artifacts (used by tests after repointing the env vars)."""
    get_team_context.cache_clear()
    get_player_context.cache_clear()

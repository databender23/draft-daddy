"""Match ESPN players to CSV rows by normalized name / team / position."""

import re

SUFFIX_TOKENS = frozenset({"jr", "sr", "ii", "iii", "iv", "v"})

# ESPN abbrev -> ffanalytics abbrev used by the projections CSV.
TEAM_ALIASES = {
    "GB": "GBP",
    "KC": "KCC",
    "NE": "NEP",
    "NO": "NOS",
    "SF": "SFO",
    "TB": "TBB",
    "LV": "LVR",
    "JAX": "JAC",
    "WSH": "WAS",
    "OAK": "LVR",
    "SD": "LAC",
    "STL": "LAR",
    "WFT": "WAS",
}

POSITION_ALIASES = {
    "D/ST": "DST",
    "DST": "DST",
    "DEF": "DST",
    "D": "DST",
    "PK": "K",
    "K": "K",
    "FB": "RB",
}

_PUNCT = re.compile(r"[.'‘’`\-‐-―]")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_name(name: str) -> str:
    if not name:
        return ""
    text = _PUNCT.sub("", name.lower())
    text = _NON_ALNUM.sub(" ", text)
    tokens = [t for t in text.split() if t and t not in SUFFIX_TOKENS]
    return " ".join(tokens)


def normalize_team(team: str) -> str:
    if not team:
        return ""
    key = team.strip().upper()
    return TEAM_ALIASES.get(key, key)


def normalize_pos(pos: str) -> str:
    if not pos:
        return ""
    key = pos.strip().upper()
    return POSITION_ALIASES.get(key, key)


def first_name_variant(a: str, b: str) -> bool:
    """True when two given names are plausibly the same person's.

    Covers ESPN's short forms ("Chig" / "Chigoziem", "Irv" / "Irvin") and
    nicknames sharing a long stem ("Kenny" / "Kenneth").
    """
    if not a or not b:
        return False
    if a.startswith(b) or b.startswith(a):
        return True
    shared = 0
    for left, right in zip(a, b):
        if left != right:
            break
        shared += 1
    return shared >= 4


def split_name(name: str):
    tokens = normalize_name(name).split()
    if not tokens:
        return "", ""
    if len(tokens) == 1:
        return "", tokens[0]
    return tokens[0], " ".join(tokens[1:])


class MatchIndex:
    """Lookup tiers from most to least specific, built over one players slice."""

    def __init__(self, players):
        self._full_team_pos = {}
        self._full_pos = {}
        self._last_initial_team_pos = {}
        self._last_pos_candidates = {}
        self._dst_by_team = {}
        self._ambiguous = set()
        for player in players:
            self._add(player)

    def _add(self, player):
        pid = player.get("id")
        if not pid:
            return
        pos = normalize_pos(player.get("pos") or player.get("position") or "")
        team = normalize_team(player.get("team") or "")
        full = normalize_name(player.get("name") or "")
        last = normalize_name(player.get("last_name") or "")
        first = normalize_name(player.get("first_name") or "")

        if pos == "DST":
            self._dst_by_team.setdefault(team, pid)
            return

        self._full_team_pos.setdefault((full, team, pos), pid)
        self._put(self._full_pos, (full, pos), pid)
        if last and first:
            self._put(
                self._last_initial_team_pos, (last, first[0], team, pos), pid
            )
            self._last_pos_candidates.setdefault((last, pos), []).append((first, pid))

    def _put(self, table, key, pid):
        existing = table.get(key)
        if existing is None:
            table[key] = pid
        elif existing != pid:
            self._ambiguous.add(key)

    def _get(self, table, key):
        if key in self._ambiguous:
            return None
        return table.get(key)

    def match(self, name: str, team_abbrev: str, pos: str):
        pos = normalize_pos(pos)
        team = normalize_team(team_abbrev)

        if pos == "DST":
            return self._dst_by_team.get(team)

        full = normalize_name(name)
        if not full:
            return None

        hit = self._full_team_pos.get((full, team, pos))
        if hit:
            return hit

        hit = self._get(self._full_pos, (full, pos))
        if hit:
            return hit

        first, last = split_name(name)
        if not (first and last):
            return None

        hit = self._get(self._last_initial_team_pos, (last, first[0], team, pos))
        if hit:
            return hit

        candidates = [
            pid
            for candidate_first, pid in self._last_pos_candidates.get((last, pos), ())
            if first_name_variant(first, candidate_first)
        ]
        if len(set(candidates)) == 1:
            return candidates[0]
        return None


def build_index(players) -> MatchIndex:
    return MatchIndex(players)

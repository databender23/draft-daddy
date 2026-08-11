import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("httpx")

from app import espn as espn_module
from app.espn import ESPNError, clear_player_cache, get_draft, get_player_map


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


LEAGUE = {
    "draftDetail": {"drafted": False, "inProgress": True, "picks": []},
    "teams": [
        {
            "id": 1,
            "name": "Team One",
            "primaryOwner": "{AAAA}",
            "roster": {
                "entries": [
                    {"playerId": 111, "lineupSlotId": 2},
                    {"playerId": 222, "lineupSlotId": 20},
                ]
            },
        },
        {
            "id": 2,
            "name": "Team Two",
            "owners": ["{BBBB}"],
            "roster": {"entries": [{"playerId": 333, "lineupSlotId": 16}]},
        },
    ],
}


def _patch_league(monkeypatch, payload):
    seen = {}

    async def fake_get(client, url, **kwargs):
        seen["params"] = kwargs.get("params")
        return FakeResponse(payload)

    monkeypatch.setattr(espn_module, "_get", fake_get)
    return seen


def test_draft_requests_mroster_view(monkeypatch):
    seen = _patch_league(monkeypatch, LEAGUE)
    asyncio.run(get_draft("1", 2026, "s2", "{AAAA}"))
    assert ("view", "mRoster") in seen["params"]


def test_rosters_supply_picks_when_draft_detail_is_empty(monkeypatch):
    _patch_league(monkeypatch, LEAGUE)
    draft = asyncio.run(get_draft("1", 2026, "s2", "{AAAA}"))
    assert [p["espn_id"] for p in draft["picks"]] == [111, 222, 333]
    assert draft["status"]["pick_count"] == 3
    assert [p["overall"] for p in draft["picks"]] == [1, 2, 3]
    assert draft["picks"][0]["member_id"] == "{AAAA}"
    assert draft["picks"][2]["member_id"] == "{BBBB}"


def test_roster_picks_do_not_duplicate_draft_detail_picks(monkeypatch):
    payload = {
        **LEAGUE,
        "draftDetail": {
            "drafted": True,
            "inProgress": False,
            "picks": [
                {
                    "playerId": 111,
                    "overallPickNumber": 1,
                    "roundId": 1,
                    "teamId": 1,
                    "lineupSlotId": 2,
                    "memberId": "{AAAA}",
                }
            ],
        },
    }
    _patch_league(monkeypatch, payload)
    draft = asyncio.run(get_draft("1", 2026, "s2", "{AAAA}"))
    ids = [p["espn_id"] for p in draft["picks"]]
    assert ids == [111, 222, 333]
    assert len(ids) == len(set(ids))
    assert draft["picks"][1]["overall"] == 2


def test_player_map_falls_back_to_stale_cache_on_upstream_failure(monkeypatch):
    clear_player_cache()
    payload = {"players": [{"id": 7, "fullName": "Bijan Robinson", "defaultPositionId": 2, "proTeamId": 1}]}

    async def ok(season):
        return payload

    monkeypatch.setattr(espn_module, "_fetch_player_list", ok)
    first = asyncio.run(get_player_map(2026))
    assert first[7]["name"] == "Bijan Robinson"

    async def boom(season):
        raise ESPNError(502, "down")

    monkeypatch.setattr(espn_module, "_fetch_player_list", boom)
    monkeypatch.setattr(espn_module, "PLAYER_CACHE_TTL", -1)
    assert asyncio.run(get_player_map(2026)) == first
    clear_player_cache()


def test_player_map_raises_when_there_is_no_cache(monkeypatch):
    clear_player_cache()

    async def boom(season):
        raise ESPNError(502, "down")

    monkeypatch.setattr(espn_module, "_fetch_player_list", boom)
    with pytest.raises(ESPNError):
        asyncio.run(get_player_map(2026))


def test_parse_roster_slots_reads_msettings_counts():
    data = {
        "settings": {
            "rosterSettings": {
                "lineupSlotCounts": {
                    "0": 2, "2": 2, "4": 3, "6": 1, "7": 1, "16": 1,
                    "17": 1, "20": 8, "21": 2, "23": 1,
                }
            }
        }
    }
    slots = espn_module._parse_roster_slots(data)
    assert slots == {
        "qb": 2, "rb": 2, "wr": 3, "te": 1, "superflex": 1,
        "dst": 1, "k": 1, "bench": 8, "flex": 1,
    }


def test_parse_roster_slots_none_without_settings():
    assert espn_module._parse_roster_slots({}) is None
    assert espn_module._parse_roster_slots({"settings": {"rosterSettings": {}}}) is None
    zeroes = {"settings": {"rosterSettings": {"lineupSlotCounts": {"0": 0, "21": 4}}}}
    assert espn_module._parse_roster_slots(zeroes) is None


def test_parse_picks_skips_predraft_placeholders_keeps_dst():
    detail = {
        "picks": [
            {"playerId": -1, "overallPickNumber": 1, "roundId": 1, "teamId": 3},
            {"playerId": 0, "overallPickNumber": 2, "roundId": 1, "teamId": 7},
            {"playerId": 4241389, "overallPickNumber": 3, "roundId": 1, "teamId": 6},
            {"playerId": -16021, "overallPickNumber": 4, "roundId": 1, "teamId": 5},
        ]
    }
    picks = espn_module._parse_picks(detail)
    assert [p["espn_id"] for p in picks] == [4241389, -16021]

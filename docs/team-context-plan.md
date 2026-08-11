# Plan: player hover tooltips — bye week, strength of schedule, run/pass lean

Status: proposed (research verified 2026-08-06). Restores the old Power BI app's
strength-of-schedule and run-vs-pass context, plus bye weeks, as a hover tooltip on every
player row.

## Research findings (all verified live)

| Data | Source | Verified |
|---|---|---|
| **Bye weeks** | ESPN public API: `GET lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}?view=proTeamSchedules_wl` → `settings.proTeams[].byeWeek`. No auth. | ✓ 32 teams, e.g. KC bye 5 (2026). Not present in the ffanalytics CSV (checked — no bye column). |
| **Full NFL schedules** | Same ESPN response: `proTeams[].proGamesByScoringPeriod` → 17 weeks of opponent `proTeamId`s. | ✓ |
| **Run/pass lean** | nflverse (nflfastR) team season stats: `github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_reg_{prior_season}.csv` → `attempts` (pass), `carries` (rush) per team. Plain CSV, no auth, stable project. | ✓ 32 rows for 2025; e.g. ARI 649 pass / 366 rush. |
| **Strength of schedule** | **Computed, not scraped**: nflverse weekly player stats (`stats_player_week_{prior_season}.csv` — has `position`, `opponent_team`, `fantasy_points_ppr`) → fantasy points allowed per game by each defense to each position → average over each team's 2026 opponents (ESPN schedule above) → rank 1–32 per position. | ✓ 19,421 weekly rows for 2025 with the needed columns. |

Rejected: scraping FantasyPros' SOS page (JS-rendered, needs a headless browser, fragile);
ESPN page scraping (what the old app did — no stable API for positional SOS). Computing SOS
from points-allowed × schedule is the same methodology those sites use pre-season, fully
reproducible, and adds zero scraping dependencies.

## Design

### Pipeline (new file: `data-pipeline/build_team_context.py`, pure Python)

Run once per season alongside the R scrape (and re-run in-season if desired — byes/SOS only
change if the NFL reschedules games):

1. Fetch ESPN `proTeamSchedules_wl` for the target season → byes + schedules (map ESPN
   proTeamId → ffanalytics abbrevs via the same alias table as `backend/app/espn.py`).
2. Download the two nflverse CSVs for the prior season.
3. Compute per team: `bye`, `pass_rate` = attempts/(attempts+carries), `pass_rank` (1 = most
   pass-heavy), and `sos_<pos>` rank 1–32 for QB/RB/WR/TE/K/DST (1 = easiest schedule =
   opponents allowed the most fantasy points to that position last season).
4. Write `backend/data/team_context.json` keyed by ffanalytics team abbrev, with a
   `generated`/`season` header. Baked into the Docker image like `projections.csv`.

Static artifact (not a live backend fetch) so draft day has zero new network dependencies.

### Backend (small)

- `players.py` (or a new `team_context.py` ≤100 lines): load `team_context.json` if present;
  `GET /api/players` response gains a top-level `teams` map `{abbrev: {bye, pass_rate,
  pass_rank, sos: {QB: n, …}}}`. Players stay unchanged — the frontend joins by `player.team`.
  Missing file → `teams: {}` and the UI simply omits tooltips (graceful degradation).
- Tests: fixture team_context + endpoint shape test.

### Frontend

- `PlayerTooltip` component: appears on hover **and keyboard focus** of the player-name cell
  (and on the cursor row via the keyboard flow), ~250ms delay so it never slows the 60-second
  clock. Content, all plain text:
  - **Bye: week 9** — plus a ⚠ line when the bye collides with 2+ of my current roster at any
    position (the roster data is already client-side).
  - **SOS (RB): 27/32 — tough** — the rank for *that player's* position, with easy (1–10) /
    average (11–21) / tough (22–32) wording so the number reads without a legend.
  - **Team lean: 58% pass (4th)** — pass rate + rank; for RBs the run share is the headline
    (`61% run (2nd)`), for QB/WR/TE the pass share.
- Same tooltip on the Suggested Pick card and Best Available tiles (shared component).
- No new columns on the board (it's already dense) — tooltip only, per the request.

### Docs
- Update `data-pipeline/README.md` runbook (one new command) and the in-app How-to-use page.
- CLAUDE.md: note the second data artifact and its regeneration command.

## Order of work
1. `build_team_context.py` + run it for 2026 → commit artifact.
2. Backend loader + `teams` in the players payload + tests.
3. Tooltip component + wiring (board, tiles, suggested card) + bye-conflict check.
4. Docs + full end-to-end run.

## Addendum: player-level stats (researched 2026-08-06)

From a survey of "which stats matter" sources (ESPN, The Ringer, BR, DraftKings…), the
consensus is **volume is sticky, efficiency and TDs are not**. For a draft app whose
projections already price in expected volume, the only additions worth their screen space are
the ones that let a user judge whether a projection/ADP is trustworthy:

**Add (tooltip "Last season" block + max two badges, zero new columns):**
1. Opportunity line — touches/g or targets/g, target share, games played (nflverse
   `stats_player_week`/`_reg`; `target_share` is a native column). Rookies show "Rookie".
2. Fantasy PPG (PPR) — actual production baseline next to the projection.
3. ⚠ TD-regression badge — actual TDs vs expected TDs from volume (position-average TD rate ×
   player opportunities; ffopportunity's precomputed xTD dataset is no longer published —
   verified 404 — so compute the crude version). The Calvin Ridley rule.
4. ⚡ Konami badge (QBs) — rushing share of fantasy production ≥ threshold (~25%): identifies
   high-floor rushing QBs.

**Skip:** aDOT, routes/YPRR, snap %, on-target %, personnel packages, WR/CB matchups
(in-season/DFS tools, high explanation cost, priced into projections), and the 2013-era
efficiency stats (YPC, longest run, touches/fumble — poor year-over-year predictiveness).

Plumbing: same pipeline script emits a second artifact `backend/data/player_context.json`;
players are joined server-side using the existing `MatchIndex` (nflverse names → CSV ids), so
the frontend just reads `player.last_season`. Unmatched players simply get no block.

## Open questions (defaults chosen, flag if wrong)
- SOS window: season-long only for v1 (the old app was season-long). Playoff-weeks (15–17) SOS
  is a natural v2 for keeper/trade decisions.
- Prior-season points-allowed is the standard preseason proxy; it can't account for offseason
  defensive changes. Acceptable — same limitation every SOS provider has.

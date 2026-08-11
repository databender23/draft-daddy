# Data pipeline

Produces the two data artifacts the draft app serves: the VOR projections CSV
(from the [ffanalytics](https://github.com/FantasyFootballAnalytics/ffanalytics)
R package — full methodology docs:
<https://ffanalytics.fantasyfootballanalytics.net/>) and the team/player context
JSONs that back the player tooltips.

## Files

| File | Purpose |
|---|---|
| `ffanalytics_vor.R` | Scrapes ~10 projection sources, computes PPR / Half-PPR / Non-PPR projections with VOR, writes `output/fantasyFootball_vor_<season>.csv` |
| `load_latest.py` | Validates the newest CSV in `output/` and installs it as `../backend/data/projections.csv` |
| `build_team_context.py` | Builds `../backend/data/team_context.json` (bye week, run/pass lean, positional SOS) and `../backend/data/player_context.json` (prior-season production per projections-CSV id) |
| `ctx_sources.py` | ESPN + nflverse downloads and the nflverse→ffanalytics team abbrev map (used by `build_team_context.py`) |
| `ctx_teams.py` | Team math: pass rate/rank, fantasy points allowed per defense per position, SOS ranks |
| `ctx_players.py` | Player math: opportunity, PPG, target share, expected TDs, regression + Konami flags, join to CSV ids |
| `cache/` | Disposable download cache for `build_team_context.py` (git-ignored; delete a file to force a re-download) |
| `output/` | Season CSVs land here (kept as an archive; the newest one is what gets loaded) |
| `scrape_2026.log` | Log of the most recent scrape run |

The original 2024 script lives in `../../archive/` for reference — note its Non-PPR section
mistakenly used `rec = 0.5` (Half-PPR scoring); the current script fixes this to `rec = 0`.

## Season refresh runbook (each August)

```bash
cd data-pipeline

# 1. Scrape fresh projections (5–15 minutes; needs R + ffanalytics installed)
Rscript ffanalytics_vor.R 2027          # season defaults to current year if omitted

# 2. Validate + install into the app
python3 load_latest.py                  # picks the newest output/*.csv

# 3. Build the tooltip context (byes, SOS, run/pass lean, last-season stats).
#    Run AFTER step 2 — it joins players against the installed projections.csv.
python3 build_team_context.py 2027      # season defaults to current year

# 4. Serve it
#    Local:  restart uvicorn
#    Docker: docker build -t draft-app . && redeploy
```

`load_latest.py` refuses to install a CSV that is missing required columns, has
fewer than 1,000 rows per scoring type, or lacks any of the three scoring /
averaging variants — so a partially failed scrape can't silently wipe the board.
It warns (but proceeds) when a slice is missing a whole position, since the app
backfills missing positions from the `average` slice at serve time.

## Team & player context (`build_team_context.py`)

Stdlib-only (no R, no pip installs; it imports `backend/app` for the shared
matching index and team-alias tables). It exits non-zero without writing
anything if a validation check fails, so a bad run can't install junk.

Sources — both public, no auth:

- **ESPN** `seasons/{season}?view=proTeamSchedules_wl` → `byeWeek` and the full
  17-game schedule per team.
- **nflverse** releases `stats_team_reg_{prior}.csv` (pass attempts vs carries)
  and `stats_player_week_{prior}.csv` (weekly player production).

How the numbers are computed:

- `pass_rate` = attempts / (attempts + carries) for the prior season;
  `pass_rank` 1 = most pass-heavy. The UI shows RBs the inverse (run share,
  `run_rank = 33 - pass_rank`).
- **SOS**, per position, rank 1..32 where **1 = easiest**: prior-season fantasy
  points allowed per game by each defense to that position, averaged over the
  team's upcoming opponents (a division opponent played twice counts twice).
  Highest opponent points allowed = softest schedule = rank 1.
- **K** has no `fantasy_points_ppr` in nflverse (it is always 0), so kicker
  scoring is rebuilt from the distance buckets (3/4/5 pts, PAT 1, misses −1).
  **D/ST** has no player rows at all, so a team's D/ST column is the D/ST
  production the *opposing* defense put up against that offense (sacks,
  takeaways, defensive/return TDs, plus the ESPN points-allowed tier from the
  offense's points scored) — i.e. how generous that offense is to a streamer.
- `expected_tds` applies league position-average TD rates (rush TD/carry, rec
  TD/target, pass TD/attempt) to the player's own volume; `td_regression` fires
  at actual − expected ≥ 3 (≥ 6 for QBs, whose TD totals dwarf everyone else's,
  and never for konami QBs — a designed runner beats the pooled QB rushing-TD
  rate by identity, not luck). `rush_share` is the QB's rushing share of PPR points
  (null for RB/WR/TE) and is what the tooltip prints; `konami` fires when that
  share is ≥ 25 % **and** the QB ran at least 150 plays (attempts + carries,
  ~four starts) — without the volume floor a 2-game backup with one scramble
  clears the threshold on noise. Both flags are deliberately crude — they say
  "check this projection", not a forecast.
- Players are joined to projections-CSV ids with the same `MatchIndex` the ESPN
  sync uses; accents are folded first (nflverse writes "Estimé", the CSV writes
  "Estime"). ~79 % of nflverse skill players match (the rest retired or are out
  of the league); ~82 % of CSV skill players get a block — the misses are
  rookies, which the tooltip labels as such.

Sanity checks each run prints: 32 teams, all six SOS ranks a clean 1..32
permutation, byes present, plus sample rows (2026: KC bye 5, IND/LV 13, LAR 11)
and the flagged-player lists.

## One-time R setup

```r
install.packages("remotes")
remotes::install_github("FantasyFootballAnalytics/ffanalytics")
```

## Notes

- Individual sources break from year to year (site redesigns, paywalls). The
  scrape prints per-source progress; losing one or two sources is fine — the
  projections are averaged across whatever succeeds. If a source errors hard,
  drop it from `SOURCES` in `ffanalytics_vor.R` and re-run.
- ffanalytics rate-limits itself (~2s between requests); don't parallelize it.
- ECR / ADP / AAV / uncertainty are only attached to the PPR slice, matching
  the app (the columns exist but are `NA` for Half-PPR and Non-PPR).
- Historical seasons cannot be re-scraped (the sources only publish current
  projections) — hence the `output/` archive.

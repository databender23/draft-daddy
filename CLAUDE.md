# Databender Draft IQ (fantasy football VOR draft app)

Draft-day web app: VOR (value-over-replacement) player board from ffanalytics projections, with
live draft sync that removes players as they're picked. Built manual-first — every removal
can be done by hand in ~1s because no live-sync path is guaranteed.

Three providers (`Settings.provider`): **ESPN** (league API poll + optional draft-room
WebSocket tap), **Yahoo** (official API, publishes picks live server-side — the only platform
that needs no userscript; setup in `docs/yahoo-setup.md`), and **tap** (userscript relay only,
for platforms with no usable API such as NFL.com). All three converge on the same
name/team/pos → CSV matching and the same board removal path.

## Architecture

- `backend/` — FastAPI (Python 3.11+, httpx). Stateless: ESPN cookies arrive per-request from
  the browser and are never stored or logged server-side. Serves `frontend/dist` statically.
- `frontend/` — Vite + React 18 + TypeScript, single page, Databender-branded light + dark
  themes (see Theming below). All draft state (settings, removals, roster, watchlist) lives in
  localStorage, bucketed per league+season (`lib/storage.ts`).
- `data-pipeline/` — R scrape (ffanalytics) → `output/*.csv` → `load_latest.py` validates and
  installs `backend/data/projections.csv`; `build_team_context.py` then emits
  `backend/data/team_context.json` + `player_context.json`. See its README for the season runbook.
- Single-container Docker deploy; no DB. Two OPTIONAL env vars (telemetry, below) — the app runs
  fully without them. `data-pipeline/` is excluded from the image. Production is AWS App Runner
  at https://draftiq.databender.co; runbook in `docs/deploy-aws.md`.

## Commands

```bash
# Backend (from backend/): venv at .venv
.venv/bin/python -m pytest tests/ -q          # run tests (no network needed; tests/conftest.py
                                              # pins DATA_PATH to the archived 2025 CSV so the
                                              # suite is independent of the installed season)
.venv/bin/uvicorn app.main:app --reload       # dev server :8000

# Frontend (from frontend/)
npm run dev                                   # Vite dev server, proxies /api -> :8000
npm run build                                 # tsc + vite build -> dist/ (backend serves this)
npm run check:theme                           # token purity + both-blocks var coverage (see Theming)

# Data refresh (from data-pipeline/)
Rscript ffanalytics_vor.R [season]            # 5-15 min scrape
python3 load_latest.py                        # validate + install newest output/*.csv
python3 build_team_context.py [season]        # bye/SOS/lean + prior-season player context
                                              # (run AFTER load_latest.py; needs network)

# Docker (from repo root)
docker build -t draft-app . && docker run -p 8000:8000 draft-app
```

The backend only picks up frontend/data changes on restart (static mount and CSV load happen at
import time). Rebuild `dist/` before serving; restart uvicorn after swapping the CSV.

## API contract (frontend and backend must match exactly)

- `GET /api/players?scoring=PPR|Half-PPR|Non-PPR&avg=average|robust|weighted` →
  `{players: [...], teams: {<abbrev>: {bye, pass_rate, pass_rank, sos: {QB,RB,WR,TE,K,DST}}}}`.
  Each player also carries `last_season: {games, ppg, opportunities_pg, opp_label, target_share,
  tds, expected_tds, td_regression, konami, rush_share} | null` (`rush_share` is QB-only, null
  elsewhere; `konami` also requires 150+ plays so backups don't earn the ⚡ badge). Both come from the context artifacts
  (`backend/app/context.py`); if a file is missing, `teams` is `{}` and `last_season` is `null`
  everywhere — the UI degrades to no tooltips.
- `POST /api/espn/sync` body `{league_id, season, espn_s2?, swid?, scoring, avg, tap_key?}` →
  `{status, teams, my_team_id, roster_slots, picks, unmatched, tap}`; errors return string
  `detail` (401 cookies/private, 404 league, 502 upstream). Cookies optional — public leagues
  need none. When `tap_key` matches a live tap buffer, buffered WebSocket picks are merged in
  (API picks win on conflict; missing overalls are sequenced; round derived from team count)
  and `tap` is `{active, picks, last_event_at}`, else `null`.
- `POST /api/draft/events` body `{league_id, season, key (≥4 chars), source?, picks: [{espn_id?,
  name?, team?, pos?, overall?, round?, espn_team_id?, member_id?}]}` → `{stored, total}`.
  In-memory per (league, season, key) buffer (`draft_events.py`): 12h TTL, deduped by provider
  player id when present else normalized name, an INIT replay never erases an overall a live
  SELECTED frame already set. `GET /api/draft/events` (same params as query) exists for
  debugging. Fed by the draft-room userscript, served at `/tap/draftiq-espn-tap.user.js` (from
  `userscript/`, also COPY'd in the Dockerfile).
- `GET /api/draft/live?league_id&season&key&scoring&avg` → `{tap, picks, unmatched}`. The
  provider-agnostic path: buffered tap picks matched to the board with NO provider API call.
  Drives `provider: 'tap'` mode (NFL.com etc.).
- Yahoo (`yahoo.py` client + `yahoo_routes.py`): `GET /api/yahoo/status` → `{configured}`;
  `GET /api/yahoo/login` → OAuth redirect; `GET /api/yahoo/callback` → HTML that postMessages
  tokens to the opener (locked to this origin); `POST /api/yahoo/sync` body `{league_id, season,
  refresh_token, access_token?, scoring, avg, tap_key?}` → same shape as the ESPN sync plus
  `auth` (rotated tokens to adopt, or null). Needs env `YAHOO_CLIENT_ID`/`YAHOO_CLIENT_SECRET`
  (optional — endpoints 503 without them and the rest of the app is unaffected).
- Shared sync plumbing lives in `draft_events.py` (`validated_slice`, `shape_picks`,
  `merge_tap_picks`, `normalize_member_id`) and is used by both sync endpoints — put new
  cross-provider logic there, not in `main.py`.
- `POST /api/telemetry` body `{visitor_id, session_id, referrer, screen_width, screen_height,
  viewport_width, viewport_height, utm{source,medium,campaign,term,content}}` → **always 204**,
  even on malformed input or upstream failure. Fired once from `main.tsx`, fire-and-forget; it
  must never be able to break or slow the draft UI.

## Hard-won Yahoo API facts (do not re-learn these)

- **Yahoo's official API DOES publish picks during a live draft** — `/league/{key}/draftresults`
  populates mid-draft (this is how FantasyPros syncs Yahoo server-side). No extension needed;
  works headless and on mobile. Full setup + gotchas: `docs/yahoo-setup.md`.
- OAuth2 is required even for public leagues; refresh tokens don't expire, access tokens last
  1h. Tokens live in the browser and arrive per request — never stored server-side (ESPN-cookie
  posture). The callback returns tokens via `postMessage` scoped to our own origin.
- `?format=json` output mirrors Yahoo's XML: nested arrays of single-key dicts, freely
  reordered. Always go through `yahoo.py`'s `_collapse`/`_walk`/`_indexed`; never index
  positionally.
- Game keys are per-season (`461.l.12345` = 2026), resolved via
  `/games;game_codes=nfl;seasons={season}` and cached 24h.
- Yahoo says `DEF` (not DST) and `W/R/T` (flex), `Q/W/R/T` (superflex); mapped in
  `POSITION_SLOTS`. Draft results carry embedded player objects via the `/draftresults/players`
  sub-resource, so Yahoo picks need no separate player-map call.
- Yahoo MOCK drafts are not exposed via the API — to rehearse, make a private league with a
  dummy team. Pre-draft `draftresults` is legitimately an empty list.

## Hard-won ESPN API facts (do not re-learn these)

- Base URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/...` (old
  `fantasy.espn.com/apis` host is dead).
- Pre-draft, `draftDetail.picks` contains EVERY scheduled slot with `playerId: -1` — filter
  placeholders (`-1`/`0`) but NOT all negatives: D/ST units have `playerId = -16000 - proTeamId`
  (Falcons -16001).
- Player list endpoint needs header `X-Fantasy-Filter: {"filterActive":{"value":true}}` or it
  returns only 50 rows. Public, no cookies; cached server-side per season.
- `defaultPositionId` (1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 DST) ≠ `lineupSlotId` (0 QB, 2 RB, 4 WR,
  6 TE, 7 superflex/OP, 16 DST, 17 K, 20 bench, 23 flex). Roster config parses
  `settings.rosterSettings.lineupSlotCounts` from the `mSettings` view.
- The league read API does NOT stream picks during a live draft (auction: confirmed frozen
  until one atomic flush at completion; snake: unconfirmed but assume the same). Live picks come
  from the draft room's raw plain-text WebSocket at `wss://fantasydraft.espn.com` — protocol,
  auth handshake, INIT-blob format and sources are documented in
  `docs/live-draft-sync-research.md`. Our tap userscript (`userscript/`) rides the page's own
  socket read-only. Never remove the manual-removal UI paths — every live path is best-effort.
- `SELECTED`'s 3rd token is overall-pick-number per one community capture but slot-id per
  another — unverified. If overalls look wrong, send `overall: null` from the userscript and the
  backend sequences them; removal keys on espn_id so the board is correct either way.

## Data quirks

- CSV `id` is an MFL/ffanalytics id, NOT ESPN's. ESPN picks are matched by normalized
  name+team+pos (`backend/app/matching.py`). Matching is deliberately conservative: a false
  positive silently hides an undrafted player, which is worse than a miss — keep the
  anti-collision tests green.
- Team abbrevs are ffanalytics-style (GBP, KCC, NEP, NOS, SFO, TBB, LVR, JAC, WAS); ESPN ids map
  through `PRO_TEAM_MAP` + alias fixups in `espn.py`.
- ECR/ADP/AAV/uncertainty exist only in the PPR slice (NA elsewhere) — UI shows em-dashes.
- The `weighted` avg slice has no DST rows; `players.py` backfills whole missing positions from
  `average`.
- `team_context.json` (byes/SOS/pass lean, ESPN + nflverse) and `player_context.json` (prior-season
  per-player volume/PPG/TD-regression/Konami, keyed by CSV `id`) are static build-time artifacts
  baked into the image like `projections.csv`. SOS is computed from prior-season fantasy points
  allowed, 1 = easiest. `player_context.json` covers QB/RB/WR/TE only (~82% of skill-position CSV
  rows join; rookies get `null`) — K/DST context lives in `team_context.json`.
- The original 2024 R script's "Non-PPR" was accidentally Half-PPR (`rec = 0.5`);
  `data-pipeline/ffanalytics_vor.R` fixes it. Archived source data lives in `../archive/`.

## Conventions

- Max 500 lines per file (repo standard) — split modules rather than grow them.
- Never delete files; move to `to_delete/` at repo root instead.
- Frontend state flows through `App.tsx`; persisted fields must be added to `types.ts
  Persisted`, `storage.ts` coercers, the save effect, AND the bucket-switch in `applySettings`.
- Adding a provider: write a client module returning the `espn.get_draft()` shape
  (`status`/`teams`/`picks`/`roster_slots`), reuse `draft_events.shape_picks`, add a router,
  then extend `Provider` in `types.ts` + `PROVIDERS` + the `useDraftSync` branch. Sleeper is
  the easiest remaining add (public REST, no auth).
- Keyboard shortcuts and any new draft-day feature must stay one-glance/one-click fast — this
  app is used under a 60-second pick clock. Update the in-app How-to-use page when UX changes.

## Theming (hard rule)

**Every color is a `var(--token)` defined in BOTH theme blocks.** The only place a literal color
may appear in the whole frontend is inside `:root[data-theme='light'] { … }` and
`:root[data-theme='dark'] { … }` in `frontend/src/styles.css`. No raw `#hex`, `rgb()`, `rgba()`,
or `hsl()` anywhere else — not in `board.css` / `player-context.css`, not in gradients or
box-shadows, not in JSX `style={{…}}`. Both blocks define the *complete* token set (page,
surface/surface-2, line, ink/ink-2/ink-3, accent/-hover/-soft/on-accent, good/bad/warn + softs,
`--pos-*` + `--pos-*-ink`, `--tier-1..8` + `--tier-x`, `--vor-bar`, `--hover-wash`, `--shadow-1/2`,
`--focus-ring`, `--radius`, `--radius-lg`, `--font-sans`); a token missing from either block is a
bug. `npm run check:theme` (`frontend/scripts/check-theme.mjs`) enforces exactly this — token
purity plus both-blocks var coverage — and must pass before any UI change ships.

- Resolution: `<html data-theme="light|dark">` is always the RESOLVED theme, set pre-paint by the
  inline script in `index.html`. `localStorage["ffdraft:v1:theme"]` holds an explicit choice;
  absent means follow `prefers-color-scheme` and live-follow OS changes. Each block also sets
  `color-scheme` so native controls/scrollbars match.
- Data-viz colors are re-stepped per theme, never filter-flipped: position badges and the teal
  tier/VOR ramp have distinct light and dark values, badge text ≥4.5:1 on its badge, status text
  ≥3:1 on its surface. Adding a new hue means adding both steps and re-checking contrast.
- Brand: teal accent (`#1A9988` light / ~`#22B8A5` dark), Inter, 8px controls / 12px cards.
  Logos live at `frontend/public/images/{logo-color,logo-white,logo-icon}.png` — light theme uses
  `logo-color`, dark uses `logo-white`.

## Telemetry + deploy

- Optional env vars, both **unset by default in code** (`os.environ.get` with no fallback URL) so
  local dev and bare `docker run` send nothing: `ANALYTICS_ENDPOINT` (server-to-server forward of
  the pageview to the databender.co analytics API, passing through the client's real IP via
  `X-Forwarded-For` and the original User-Agent) and `SLACK_WEBHOOK_URL` (one ping per newly-seen
  `session_id`, in-memory 6h TTL dedupe — no DB, consistent with the stateless design). Both are
  best-effort with short timeouts; failures are logged, never surfaced.
- Telemetry carries no PII and must never touch ESPN cookie state.
- Branding: the app is "Draft IQ" (TopBar wordmark, page title, OG tags in index.html with the
  share image at frontend/public/images/og-draftiq.png). A blog post draft promoting it lives at
  ../../website_dev/content-review/30-blog-draft-iq-2026.md (incl. the animated diagram) —
  wire into the site's blog-data.ts only after user approval.
- Telemetry Slack ping is a Block Kit card mirroring the site's alert style (geo via ip-api.com,
  UA-parsed browser, session/visitor dedupe in memory — resets on container restart).
- Deploy: `docs/deploy-aws.md` (ECR + App Runner at `draftiq.databender.co`, AWS CLI profile `default` (it IS the Databender account; a separate `databender` profile does not exist — account ID, service ARN and other account-specific values live in the gitignored `docs/deploy.local.md`),
  us-east-2). Website-side prerequisite: the `draft` entry in the site's analytics route
  allowlist must be deployed or events are dropped.

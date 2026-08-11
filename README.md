# Draft Daddy — Fantasy Football Draft App

A VOR (Value Over Replacement) draft board for live fantasy football drafts, with optional
league sync that removes players from the board as they come off it.

- **Draft board** — sortable, filterable table of ~700 players with Rank, Pos Rank, Tier, VOR,
  Proj Pts, SD Pts, Floor, Ceiling, Risk, ADP. Toggle scoring (PPR / Half-PPR / Non-PPR) and
  averaging method (average / robust / weighted).
- **Manual-first** — search a player and mark them drafted in about a second. Works with no
  network, no cookies, no account.
- **League sync** — three providers, all feeding the same removal + roster logic:
  - **ESPN** — point it at your league; picks are matched to the board and your roster shown.
    Optional draft-room userscript ([`userscript/`](userscript/README.md)) taps ESPN's live
    WebSocket for real-time picks.
  - **Yahoo** — connect once with Yahoo (OAuth); its official API reports picks live during the
    draft, so no userscript is needed. Requires server-side Yahoo app credentials
    ([`docs/yahoo-setup.md`](docs/yahoo-setup.md)).
  - **Tap only** — drives the board purely from the draft-room userscript, for any platform
    without a usable API.
- **Best available** — top undrafted player by VOR per position.
- **Light and dark themes** — Databender-branded, follows your OS by default, one-click toggle.

Projections and VOR come from the [ffanalytics](https://github.com/FantasyFootballAnalytics/ffanalytics)
R package, which aggregates and scrapes multiple projection sources. The scrape lives in
[`data-pipeline/`](data-pipeline/README.md); the app serves whatever that pipeline installs at
`backend/data/projections.csv` and does not compute projections itself.

## Local development

Terminal 1 — backend on `:8000`:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Terminal 2 — frontend dev server (proxies `/api` to `:8000`):

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Docker

```bash
docker build -t draft-app .
docker run -p 8000:8000 draft-app
```

Then open http://localhost:8000 — the container serves the built frontend and the API from a
single port. It deploys to any Docker host as-is: no database, no volumes, and no required
environment variables. Player data is baked into the image.

Two **optional** environment variables enable visitor telemetry; both are unset by default, so
local dev and plain `docker run` stay completely silent:

| Variable | Effect when set |
| --- | --- |
| `ANALYTICS_ENDPOINT` | Server-to-server forward of anonymous pageview events (no PII, never ESPN credentials), preserving the real client IP and User-Agent. Production value: `https://databender.co/api/analytics/event`. |
| `SLACK_WEBHOOK_URL` | Posts a rich Slack card (Block Kit, matching the databender.co alert style) the first time a browser session is seen: visit count, first-visit/returning, traffic source, geo via ip-api.com, device, browser. Deduped in memory for 6h. |
| `YAHOO_CLIENT_ID` / `YAHOO_CLIENT_SECRET` | Enable the Yahoo provider. Unset, `/api/yahoo/status` reports `configured:false` and Yahoo is hidden. See [`docs/yahoo-setup.md`](docs/yahoo-setup.md). |

Both sends are best-effort with short timeouts; failures are logged and never surface to the
client. `POST /api/telemetry` always answers `204`.

## Theming

The app ships **light and dark themes** built on the Databender brand: teal accent `#1A9988`,
Inter typography, 8px control / 12px card radii, and the site's white/`#F8F9FA` surfaces in
light mode against the app's near-black surfaces in dark mode.

- **Default is your OS setting.** With no explicit choice stored, the app follows
  `prefers-color-scheme` and switches live when you change the OS setting.
- **Toggle** in the top bar makes an explicit choice, persisted in `localStorage` under
  `ffdraft:v1:theme` (`"light"` | `"dark"`). Remove that key to go back to following the OS.
- **No flash on load** — a tiny inline script in `index.html` resolves the theme and sets
  `<html data-theme="…">` before first paint. `color-scheme` is set per theme, so native
  selects, inputs, and scrollbars follow too.

Every color in the app resolves through a CSS custom property defined in **both**
`:root[data-theme='light']` and `:root[data-theme='dark']` in `src/styles.css` — no raw hex,
`rgb()`, `rgba()`, or `hsl()` exists anywhere else, including gradients, shadows, and JSX inline
styles. `npm run check:theme` (`scripts/check-theme.mjs`) enforces both halves of that rule:
no raw colors outside the two token blocks, and every `var(--x)` used is defined in both blocks.
Adding a color means adding a token to both blocks — never a literal at the call site.

## Hosting

Production lives at **https://draftdaddy.databender.co** on AWS App Runner (single container, ECR
image, 0.25 vCPU / 0.5 GB). The full idempotent runbook — ECR, build/push, service creation,
custom domain, Route 53 records, updates, costs, teardown — is in
[`docs/deploy-aws.md`](docs/deploy-aws.md).

## Season refresh

Once a season, when new projections are out:

```bash
cd data-pipeline
Rscript ffanalytics_vor.R          # scrape fresh projections (season defaults to current year)
python3 load_latest.py             # validate + install as backend/data/projections.csv
cd .. && docker build -t draft-app .   # rebuild and redeploy (or just restart uvicorn locally)
```

See [`data-pipeline/README.md`](data-pipeline/README.md) for details, validation rules, and R
setup. There is no upload UI by design; the data file is versioned with the app. To push the
refreshed data to production, rebuild and redeploy the image per
[`docs/deploy-aws.md`](docs/deploy-aws.md) § "Shipping updates".

## ESPN cookies

Private leagues need two cookies from your own ESPN session:

1. Log in at [fantasy.espn.com](https://fantasy.espn.com) and open your league.
2. Open DevTools (F12) → **Application** tab → **Storage** → **Cookies** → `https://fantasy.espn.com`.
3. Copy the values of **`espn_s2`** (a long string) and **`SWID`** (include the surrounding
   curly braces: `{XXXXXXXX-...}`).
4. Paste them into the app's settings drawer along with your league ID and season, then hit
   **Test connection**.

Your cookies are stored **only in your browser's localStorage**. The server keeps no accounts,
no database, and no credentials — each request carries your cookies to ESPN and they are never
logged or written to disk. Cookies last months; if sync starts returning an auth error, re-copy
them. Yahoo works the same way: the OAuth refresh token lives in your browser and is sent per
request, never stored server-side.

## A note on live sync

Sync reliability differs by platform. **Yahoo's** official API reports picks *during* the draft,
so its live sync is the most dependable — pure server-side polling, no browser add-on.
**ESPN** does not document its fantasy API and its league endpoint does not stream picks
mid-draft; the app polls it (post-draft sync is fully reliable) and, for true real-time picks,
an optional userscript taps ESPN's draft-room WebSocket ([`userscript/`](userscript/README.md)).
Either way the app is built **manual-first**: marking players drafted by hand is the primary path
and always works in about a second, so no live-sync path is ever load-bearing.

---

Questions: grant@databender.co

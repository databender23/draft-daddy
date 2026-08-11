# Yahoo live-draft sync — setup

Yahoo is the **easy platform**: its official API publishes picks *during* the draft
(`/league/{key}/draftresults`), so sync is pure server-side polling — no userscript, no
extension, works on mobile. This is the same mechanism FantasyPros uses for Yahoo.
The only cost is OAuth: you must register a Yahoo app once and set two env vars.

## 1. Register the Yahoo app (once, ~3 minutes)

1. Go to https://developer.yahoo.com/apps/create/ signed in as any Yahoo account.
2. **Application Name**: anything (e.g. `Draft Daddy`).
3. **Application Type**: `Installed Application`.
4. **Redirect URI**: must be HTTPS. Production: `https://draftiq.databender.co/api/yahoo/callback`.
   For local dev Yahoo will not accept `http://localhost`, so either
   - add the production URI and test against prod, or
   - run local dev behind an HTTPS tunnel and set `YAHOO_REDIRECT_URI` to that URL.
5. **API Permissions**: check **Fantasy Sports**, leave `Read` selected (scope `fspt-r`).
6. Create → copy the **Client ID** and **Client Secret**.

Note: Yahoo now also routes commercial/product access through an application form at
https://sports.yahoo.com/developer/access/ (they review submissions and ask for a use-case
and user-volume tier). Self-serve app creation still works for personal use as of Aug 2026;
if Draft Daddy ever gets real Yahoo traffic, apply through the portal and add the required
"Fantasy data provided by Yahoo Fantasy" attribution.

## 2. Configure the server

```bash
YAHOO_CLIENT_ID=<client id>
YAHOO_CLIENT_SECRET=<client secret>
YAHOO_REDIRECT_URI=<optional; defaults to https://<host>/api/yahoo/callback>
```

Both are **optional** — with them unset, `/api/yahoo/status` reports `configured: false`,
the Settings UI explains Yahoo isn't available, and every other feature runs untouched
(same pattern as the telemetry env vars). On App Runner, add them the same way as
`SLACK_WEBHOOK_URL` (see `deploy-aws.md`).

## 3. Use it

Settings → **Platform: Yahoo** → **Connect Yahoo** (popup OAuth) → paste your league ID
(the number in `football.fantasysports.yahoo.com/f1/<leagueId>`) → **Test connection** →
turn **Live** on. Picks disappear from the board as they're made.

## How tokens are handled

Same posture as ESPN cookies: **nothing is stored server-side.** The OAuth popup returns
tokens to the app tab via `postMessage` locked to this origin; the browser keeps the
refresh token in localStorage and sends it with each sync. The access token (1h life) is
held in memory only. When it expires the backend mints a new one from the refresh token
and returns it in the response's `auth` field for the client to adopt. Yahoo refresh
tokens do not expire unless the user revokes access, so a one-time connect lasts all season.

## Gotchas worth knowing

- **Pre-draft, `draftresults` is an empty list** — that's expected, not an error. FantasyPros
  notes Yahoo leagues often can't be connected until ~30 min before the draft.
- **Yahoo's JSON is XML-shaped**: nested arrays of single-key dicts. `yahoo.py`'s
  `_collapse`/`_walk`/`_indexed` helpers flatten it defensively — reuse them rather than
  indexing positionally, since Yahoo reorders these arrays freely.
- **Auction drafts**: each pick carries `cost`; the player currently being nominated is
  absent from `draftresults` until won. Our parser skips entries with no `player_key`.
- **Game keys are per-season** (`461.l.12345` for 2026) — resolved automatically via
  `/games;game_codes=nfl;seasons={season}` and cached 24h.
- **Position mapping**: Yahoo says `DEF` where our CSV says `DST`, and `W/R/T` for flex —
  handled in `POSITION_SLOTS` and the existing `POSITION_ALIASES`.
- **Rate limits are undocumented**; reports exist of app-level blocks under heavy polling.
  Our 10s cadence (~120–480 requests over a draft) is far below anything reported.
- **Mock drafts are NOT exposed via the API** — even FantasyPros falls back to a browser
  extension for Yahoo mocks. To rehearse, create a free private Yahoo league with a dummy
  second team and schedule a real draft.

# Draft Daddy — ESPN Draft Tap (userscript)

Relays picks from ESPN's live draft room to the Draft Daddy board in real time.
ESPN's league read API does **not** stream picks mid-draft (see
`../docs/live-draft-sync-research.md`); the draft room itself talks to
`wss://fantasydraft.espn.com` over a plain-text protocol. This userscript wraps
`window.WebSocket` in the draft-room tab, listens to `SELECTED`/`SOLD` frames
(and the base64 `INIT` snapshot, so a mid-draft refresh recovers every pick),
and POSTs them to `/api/draft/events`. Read-only — it never sends anything to
ESPN and never drafts for you.

## Install (once, ~2 minutes)

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
   (Chrome/Edge/Firefox — enable Developer Mode in `chrome://extensions` if
   Tampermonkey asks for it).
2. Open `https://draftdaddy.databender.co/tap/draftdaddy-espn-tap.user.js` —
   Tampermonkey will offer to install it. (Local dev:
   `http://localhost:8000/tap/draftdaddy-espn-tap.user.js`.)
3. In Draft Daddy → **Settings → Live draft tap**, copy the tap key.
4. Open your ESPN draft room. Click the small **IQ** badge (bottom-right),
   paste the tap key, and confirm the league/season. The badge turns teal and
   counts picks as it relays them.

The board picks tap events up through the normal Live sync poll — turn **Live**
on in Draft Daddy and picks disappear from the board seconds after they're made.

## Practicing in the ESPN mock draft lobby

Mock rooms (`fantasy.espn.com/football/mockdraftlobby`) use the **same socket
protocol** but a throwaway lobby league id, so:

1. In the mock room, click the IQ badge and set the **Board league ID/season**
   to whatever bucket you want the picks to land in — your real league id (to
   watch them flow into your actual board) or something like `mocktest`.
2. In Draft Daddy, point Settings at that same league id + season and turn Live on.
3. Draft. Watch the badge count climb and players vanish from the board.

Caveat: with a league-id override, the `INIT` snapshot decode is keyed to the
room's URL league id — if the mock room URL has no `leagueId` param the
snapshot is skipped, but live `SELECTED` frames still relay fine.

## Things to verify on first live use (open protocol questions)

- **`SELECTED`'s 3rd token**: two community captures disagree (overall pick
  number vs. roster slot id). If overalls look wrong on the board, the fix is
  to send `overall: null` and let the backend sequence picks — removal is
  keyed by player id either way, so the board stays correct regardless.
- Whether snake-draft `mDraftDetail` trickles live (auction is confirmed
  frozen): with the tap running you're covered either way, and the API's
  one-shot flush at draft end reconciles anything missed.

## Troubleshooting

- Badge says **set up** — click it and paste the tap key from Draft Daddy Settings.
- Badge red (**retry**) — the POST to the backend is failing; it keeps retrying
  automatically. Check the server URL in the badge config and that you're
  online. Nothing is lost: picks queue until a POST succeeds.
- Badge never appears — Tampermonkey is off, or the room URL doesn't match
  `fantasy.espn.com/football/draft*` / `lm.fantasy.espn.com/football/draft*`.
- Refreshed the draft-room tab mid-draft — fine; the room resends `INIT` on
  reconnect and the tap replays every completed pick (the backend dedupes).
- ESPN protocol changed — the board silently falls back to what it already
  does: 10s API polling plus the one-click manual Remove flow.

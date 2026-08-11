# ESPN live-draft sync — research findings & options (2026-08-07)

Deep research (official docs, GitHub code search, vendor KBs, community forums) into how to
get picks out of an ESPN live draft in real time. TL;DR: **the league REST API almost
certainly does NOT stream picks mid-draft, but ESPN's draft room runs on a raw WebSocket
whose protocol has been fully reverse-engineered** — and there are three viable integration
paths, ranked below.

## The core facts

### 1. `mDraftDetail` polling is (probably) not a live path

- The `espn-api` maintainer (cwendt94), Aug 2024
  ([issue #558](https://github.com/cwendt94/espn-api/issues/558)): *"Currently ESPN uses
  different APIs for the live draft so the data won't reflect correctly until afterwards.
  I tried looking into it last year and was not able to get it working live."* Same
  conclusion in [issue #7](https://github.com/cwendt94/espn-api/issues/7) back in 2019.
- Measured test ([howell/draft-builder](https://github.com/howell/draft-builder), July
  2026, auction draft): the view *"freezes for the entire draft. Zero incremental updates
  across 44 minutes of picks; cache-busting headers and the mRoster view don't help. All
  64 picks appeared in one atomic flush at completion (`drafted: true`)."*
  `draftDetail.inProgress` flips true ~10 min before picks start.
- Contradicting hints: two 2026 tools
  ([draft-co-pilot](https://github.com/howrealizdat/draft-co-pilot),
  [samuelcon41/fantasy-draft](https://github.com/samuelcon41/fantasy-draft)) poll
  `mDraftDetail` every 5s as their "live" source and one claims it worked in a real league.
  No timestamped mid-draft capture exists publicly for a **snake** draft. So: unconfirmed
  for snake, confirmed-dead for auction. Keep polling as a hedge and log what happens.
- No published rate limits; 5s polling with cookies is common and unthrottled. The
  lm-api-reads host is the right one (old `fantasy.espn.com/apis` is dead).

### 2. The draft room's real transport: a raw plain-text WebSocket

Documented independently across four low-star GitHub repos (found only via GitHub *code*
search — nothing on the open web):

```
wss://fantasydraft.espn.com/game-{gameId}/league-{leagueId}/JOIN
  ?1={gameId}&2={leagueId}&3={teamId}&4={SWID}&5={fullToken}&6=false&7=false&8=KONA&nocache={rand}
```

- **Auth handshake** (from [aok17/fantasy-baseball](https://github.com/aok17/fantasy-baseball)
  `server/src/draft-sync.js`, a *working headless Node client*):
  1. With `espn_s2` + `SWID` cookies, `GET lm-api-reads…/leagues/{lid}/teams/{tid}/draftSecurity`
     → opaque token (plain text).
  2. `GET …/leagues/{lid}?view=draftInit` → `gameId` (ffl = 1, but fetch it).
  3. `fullToken = "{gameId}:{leagueId}:{teamId}:{SWID}:{securityToken}"` as param 5.
  4. Connect with `Cookie`, `Origin: https://fantasy.espn.com`, browser UA. Gotcha: the
     URL requires **unencoded** curly braces/colons — `encodeURIComponent` breaks it.
  5. Keepalive `PING {epochMs}` every 10–15s.
- **Snake message grammar** ([henryhobes/TheFranchise](https://github.com/henryhobes/TheFranchise)
  `draftOps/docs/`, captured Aug 2025):
  `SELECTED {teamId} {playerId} {overallPick} {memberId}` ·
  `SELECTING {teamId} {timeMs}` · `CLOCK {teamId} {msRemaining} {round}` ·
  `AUTOSUGGEST {playerId}` · `AUTODRAFT {teamId} {bool}` · `JOINED/LEFT` · `PING/PONG`.
  (Client → server `SELECT {playerId}` makes a pick — we will never send this.)
- **Auction grammar differs** (draft-builder, July 2026): `BID/SOLD/NOMINATION/PASSED`,
  and `CLOCK` has different arity — snake and auction need separate decoders.
- **`INIT <base64>` catch-up blob** on connect = lossless mid-draft join. draft-builder
  decoded it: run of 45-byte big-endian records
  `u32 leagueId | u32 teamId | u32 pickNumber | i32 playerId | u32 slotIdHint | u32 price | …`,
  validated 13/13 and 51/51 against post-draft REST. Pending slots have `playerId == -1`;
  D/ST ids are negative (only `-1` is the sentinel — matches our existing filter rule).
  Blob may contain interleaved non-base64 `#` chars — strip before decoding.
- Frame semantics stable across 2025 → 2026 captures. A second socket to
  `espn.connections.edge.bamgrid.com` is Disney telemetry — ignore.

### 3. What the commercial tools do (the industry ceiling)

Every vendor that live-syncs ESPN drafts (FantasyPros 400k-user extension, Draft Sharks,
Draft Hero, RotoWire) does it with a **browser extension content-script in the user's own
draft-room tab** — none do server-side ESPN sync, all are desktop-only + read-only for
ESPN (vs. true API sync on Sleeper/Yahoo/CBS). FantasyPros:
*"For ESPN leagues, you must use the FantasyPros Chrome extension"* (KB updated July 2026).
Draft Sharks: mobile draft sync impossible *"due to restrictions on their end."* Mid-draft
desync is normal enough that FantasyPros has a dedicated "Waiting for draft sync…"
runbook (refresh both tabs). Poorly-maintained implementations fail hard (Draft Hero:
2.2★, "sync stops mid draft"). ToS posture: gray area, openly tolerated for 8+ years,
no known enforcement; keep it personal-use / user's-own-cookies.

## Options, ranked for Draft Daddy

### Option A — WebSocket tap via userscript/extension (RECOMMENDED)

A tiny Tampermonkey userscript (or MV3 extension) that patches `window.WebSocket` at
`document-start` in the ESPN draft-room tab, watches `SELECTED` frames, and POSTs
`{league_id, season, picks:[{playerId, teamId, overallPick}]}` to a new Draft Daddy endpoint.
Draft Daddy frontend polls that endpoint (or the existing sync flow reads the buffer) and
removes players.

- Sub-second latency, ESPN **playerIds** (not names — plugs straight into our existing
  `matching.py` pipeline via the player-list cache), `INIT` blob gives lossless recovery
  if the tab refreshes mid-draft, zero auth work (rides the page's own socket), read-only.
- Working reference implementations: draft-builder's
  `scripts/espn-draft-room-tap.user.js` (tap → batch → POST pattern) + TheFranchise's
  snake decoder + reconnect logic (exp. backoff, 30s heartbeat death detection).
- Match both `https://fantasy.espn.com/football/draft*` and
  `https://lm.fantasy.espn.com/football/draft*`. ESPN churns sockets mid-session — derive
  state from the *current* socket, new capture seq per socket.
- Backend fit: in-memory per-league pick buffer (same precedent as the Slack dedupe map;
  stateless-container-compatible, no DB). Personal-use userscript = no store publishing.

### Option B — Headless server-side socket client (power option, more risk)

Node/Python `ws` client doing the full `draftSecurity` handshake from our backend. No
browser needed at all; restart-safe. But: it performs a real room `JOIN` visible to the
league, may contend with your own live tab (aok17 solves this with a **co-manager bot
account** invited to the league), needs fresh `espn_s2`, and is unambiguously automated
access (highest ToS exposure). Good phase-2 if the userscript proves the protocol.

### Option C — DOM scraping (industry fallback, most fragile)

Content script reading the draft-room DOM. Best selector reference:
[Haud/wyncast](https://github.com/Haud/wyncast) (`.playerinfo__playername` has held for
years; `div.draftBoardGrid` reportedly never virtualized). Yields names not ids; scoping
bugs are the classic failure (one project swept all 12 rosters into "my team"). Only worth
building if the socket tap somehow fails.

### Option D — status quo (mDraftDetail poll + manual UI)

Already built. Keep it regardless: poll during the draft with a `playerId > 0` filter,
log raw responses to settle the snake-liveness question empirically, reconcile at
`drafted: true`. Manual removal stays the guaranteed path (60s pick clock design rule).

## Testing before draft day

- **Mock draft lobby** (`fantasy.espn.com/football/mockdraftlobby`) exercises the same
  socket — free, unlimited. Caveat: mock rooms use a throwaway lobby league id (league API
  views fail there), so the userscript needs a league-id override for practice mode.
- Mock rooms are NOT readable via the league REST API (ESPN support: mock teams exist only
  until the draft completes) — API-side parsing is instead validated against the completed
  2025 draft (`?season=2025` one-shot), which our sync already handles.
- Unresolved details to confirm in a mock capture: the 3rd token of `SELECTED`
  (TheFranchise says overallPick, aok17 says slotId), and whether snake `mDraftDetail`
  trickles live (log it during the mock/real draft).

## Yahoo (2026-08-07): official API supports live sync — BUILT

`/league/{key}/draftresults` populates DURING a live draft (this is how FantasyPros syncs
Yahoo server-side — no extension). OAuth2 required even for public leagues; refresh tokens
don't expire, access tokens last 1h; tokens ride per-request from the browser, never stored.
Yahoo `?format=json` is XML-shaped (nested single-key-dict arrays). Mocks are not API-exposed.
Implemented as the `yahoo` provider — full setup, gotchas, and token handling in
`docs/yahoo-setup.md`; hard-won facts in `CLAUDE.md`.

## NFL.com (2026-08-07): SHUT DOWN — do not build

**NFL.com no longer operates season-long fantasy football as of the 2026 season; ESPN is now
the official NFL fantasy game and NFL.com leagues migrated to ESPN** (`espn.com/importnfl`).
Confirmed by ESPN Press Room + Disney (July 2026) and by NFL's own API returning a shutdown
site-message; FantasyPros dropped NFL.com from supported sync hosts on 2026-07-21 (their
NFL.com help article now 404s). `isLiveDraftLobbyOpen: false`, no 2026 game id exists. There
are no real NFL.com drafts to sync — the leagues are on ESPN, which we already support. The
generic `tap` provider (`/api/draft/live`) remains available for any future no-API platform,
but no NFL.com-specific code should be written.

Caveat on sourcing: the NFL.com research probe attempted unauthorized access (extracted an
internal app key, tried forged draft-socket auth tokens against NFL production). Those
credential-exploration results are deliberately NOT used or recorded here; only the public
shutdown facts above are retained.

## Key sources

- Socket protocol: github.com/henryhobes/TheFranchise (snake, Playwright monitor) ·
  github.com/howell/draft-builder (auction + INIT decode + userscript tap) ·
  github.com/aok17/fantasy-baseball (headless auth handshake) ·
  github.com/coalfocks/draft-aid (`Sec-WebSocket-Protocol: echo-protocol` header)
- API behavior: github.com/cwendt94/espn-api issues #7/#558, PR #538 ·
  github.com/howrealizdat/draft-co-pilot · github.com/samuelcon41/fantasy-draft ·
  thomaswildetech.com/projects/espn/league-info-json-views
- DOM selectors: github.com/Haud/wyncast · github.com/Zinkelburger/Fantasy-Football-Tool
- Vendor mechanics: FantasyPros KB 115001362368 / 360051313453 / 28876394605339 ·
  draftsharks.com/kb/sync-troubleshooting · draftkick.com/blog/building-draft-sync

# Next steps & pending tasks

Status as of 2026-08-06. The app is live at https://draftdaddy.databender.co (App Runner,
analytics + Slack pings wired, Databender light/dark branding, Draft Daddy name + OG tags).

## Before draft day (highest priority)

- [ ] **Test the draft-room tap in ESPN's mock draft lobby.** The tap is BUILT
      (2026-08-07): `userscript/draftdaddy-espn-tap.user.js` (served at
      `/tap/draftdaddy-espn-tap.user.js`) watches the draft room's WebSocket and POSTs picks
      to `/api/draft/events`; the sync merge + Settings key UI + "tap ⚡" chip are wired
      and unit-tested end-to-end. Untested against a REAL ESPN draft room. Follow
      `userscript/README.md`: install via Tampermonkey, join a mock draft, override the
      board league id, confirm picks stream in and check the two open protocol questions
      (SELECTED's 3rd token; whether snake `mDraftDetail` trickles live). Research:
      `docs/live-draft-sync-research.md`. Then deploy the new image before draft day.
      Manual Remove/Enter stays the designed fallback either way.
- [ ] **Dry-run the whole draft-day setup once**: open the prod URL, paste league URL,
      Test connection, import roster from ESPN, star a watchlist, try keyboard flow.
- [ ] Spot-check the board data one more time close to draft day (re-run the pipeline for
      late-August projection updates + injury news: `data-pipeline/README.md` runbook).

## Marketing (lead magnet)

- [ ] Review + approve the blog post draft: `../website_dev/content-review/30-blog-draft-daddy-2026.md`
      (preview artifact from the session shows it rendered). Then wire into
      `website_dev/src/lib/blog-data.ts` + sitemap; needs a featuredImage decision.
- [ ] LinkedIn post: run https://draftdaddy.databender.co through linkedin.com/post-inspector
      first to prime the OG card cache; use `?utm_source=linkedin` in the shared link so
      Slack pings and the analytics dashboard attribute traffic correctly.
- [ ] Decide whether the marketing site should link to Draft Daddy after all (currently no
      link by choice — revisit given the lead-magnet strategy).

## Yahoo — TABLED (2026-08-07: user has no Yahoo account)

The Yahoo provider is fully built and deployed to prod, but dormant (`configured:false`) and
**untested**. Tabled because the user has no Yahoo account to register the required developer
app or to test against. Nothing to do unless that changes. To pick it back up:

- [ ] Register the Yahoo app at https://developer.yahoo.com/apps/create/ with redirect URI
      `https://draftdaddy.databender.co/api/yahoo/callback` (walkthrough: `docs/yahoo-setup.md`),
      set `YAHOO_CLIENT_ID`/`YAHOO_CLIENT_SECRET` on App Runner via the jq-merge snippet in
      `docs/deploy-aws.md` §9 (preserves telemetry vars), then Connect Yahoo in Settings.
- [ ] Test with a private Yahoo league + dummy team (mocks aren't API-readable; pre-draft
      `draftresults` is legitimately empty).

## Product ideas (parked)

- [ ] **Sleeper provider.** The easiest remaining add: `api.sleeper.app/v1/draft/<draft_id>/picks`
      needs no auth. Slots in behind the same pattern as `yahoo.py` (return the get_draft shape,
      reuse `draft_events.shape_picks`) + a `Provider` entry. NFL.com is DONE/dead (shut down
      for 2026, migrated to ESPN — see `docs/live-draft-sync-research.md`); the generic `tap`
      provider already covers any other no-API platform.
- [ ] Pick countdown / on-the-clock awareness (draft-order math already possible from
      ESPN's pre-draft placeholder picks; works manual-only too since every removal = a pick).
- [ ] Browser notification/chime when your pick approaches; pick ticker + position-run alert.
- [ ] Typo-tolerant search (apostrophes/diacritics forgiveness in `lib/board.ts matchesSearch`).
- [ ] "Likely available at your next pick" survival hints on the watchlist (ADP vs picks-away).
- [ ] Playoff-weeks (15–17) SOS variant in the tooltip.
- [ ] Auction draft support (AAV data already in the CSV).

## Tech debt / small items

- [ ] `tests/test_sync.py` and `test_telemetry.py` skip silently on interpreters without
      fastapi (`pytest.importorskip`) — run via `backend/.venv` or make the skip loud.
- [ ] ~4 junk "NA NA" rows per scoring slice ship from the R pipeline (deliberately kept;
      one-line filter in `backend/app/players.py` if wanted).
- [ ] Telemetry returning-visitor memory resets on container restart (in-memory by design);
      fine for now, note if visitor counts ever matter.
- [x] Mobile layout — DONE 2026-08-10 (spec: `docs/mobile-design.md`; needs real-phone
      testing, esp. the swipe gesture and keyboard-pinned search).
- [x] Git repo — DONE 2026-08-10: public at github.com/databender23/draft-daddy.

## Draft Daddy rename (from "Draft IQ") — COMPLETE 2026-08-11

Everything renamed and migrated: app strings, docs, Slack ping, GitHub repo (draft-iq →
draft-daddy, redirects), domain (draftdaddy.databender.co primary; draftiq.databender.co
stays associated and 301s via `redirect_legacy_host` in main.py — do NOT remove it),
userscript (draftdaddy-espn-tap.user.js v0.3.0, old /tap/ filename 301s, old localStorage
config auto-migrates), OG image regenerated (og-draftdaddy.png; the old og-draftiq.png is
kept on disk for cached links), blog draft renamed to
../website_dev/content-review/30-blog-draft-daddy-2026.md. If a Yahoo dev app is ever
registered, its redirect URI must use the NEW domain.

## Each August (seasonal runbook)

1. `cd data-pipeline && Rscript ffanalytics_vor.R` (scrape new season projections)
2. `python3 load_latest.py` (validate + install)
3. `python3 build_team_context.py` (byes/SOS/team + player context)
4. Rebuild + push image, `aws apprunner start-deployment` — full commands in
   `docs/deploy-aws.md` § Shipping updates
5. Bump `PRIOR_SEASON` in `frontend/src/lib/context.ts` and `DEFAULT_SEASON` in
   `frontend/src/lib/storage.ts`; check tests still pin the 2025 fixture (conftest.py)

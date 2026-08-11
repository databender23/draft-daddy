# Draft IQ — Mobile Layout Spec (FINAL)

**Scope:** responsive retrofit, `@media (max-width: 640px)`, portrait phone 375–430px. Existing 1100px breakpoint untouched (still serves tablet).

> **Status: reviewed and finalized 2026-08-10.** The decisions below OVERRIDE anything
> contradictory in the body. §10's open questions are all resolved here.

## FINAL DECISIONS (override the body where they conflict)

1. **Swipe-right-for-MINE is IN SCOPE** (user call, 2026-08-10). Exactly ONE swipe direction
   exists in the whole design: row swipe RIGHT = MINE (`draftPlayer(p, true)`). Swipe-left does
   nothing. Implementation MUST follow §5's arbitration rules verbatim: `touch-action: pan-y`
   on rows; lock horizontal only after 10px travel with >2:1 dx:dy; ignore touches starting
   within 20px of the left edge (iOS back-swipe); ~30% row width to commit, abortable on
   release before threshold; underlay `--accent` bg + `--on-accent` `MINE` label. The swipe is
   an accelerator, never the only path — the Player-sheet footer and My Pick sheet remain the
   guaranteed routes, so the gesture can be deleted later at zero capability loss.
2. **Search overlay: keyboard "Go" and the confirm bar share ONE handler.** While the overlay
   is open, the inline `onEnter` path is not used; Go triggers exactly the confirm bar's
   ✕ Remove action on the top match. After firing, the query clears (existing `draftPlayer`
   behavior), the bar disappears, focus and keyboard stay.
3. **Toast dep-array fix ships for desktop AND mobile** (`[toast]` only). 5s desktop, 8s mobile.
4. **Chip fill-state format: progressive** — bare `RB` until a starter slot fills, then
   `RB 1/2`, then `RB ✓` dimmed when full.
5. **Keep `Show drafted`**, homed in the Board options sheet.
6. **My Pick sheet Best Available: all `livePositions`** (desktop parity); render a position's
   line dimmed (`--ink-3`) when all its starter slots are filled.
7. **Suggested-strip auto-hide: IN scope** (scroll-direction hook). It must degrade cleanly:
   if the hook misbehaves, the strip simply stays visible.
8. **Dock order as specified** — consequential actions right (Search rightmost).
9. **The Board dock slot is CUT — the dock has FOUR slots:**
   `[▦ Roster 5/9] [⬤ MY PICK] [↩ 12] [🔎 Search]` (~97px each at 390px).
   Scroll-to-top moves to tapping the app bar's brand block. Clearing the position filter is
   the ALL chip's job (already exists).
10. **PWA / manifest: out of scope.**
11. **`theme-color` meta follows the theme toggle: IN scope** — set it in `lib/theme.ts`'s
    apply path and keep the pre-paint script consistent.
12. **Implementation order:** everything in one build: the four prep commits, the fix list,
    app bar, chip rail, BoardRow list + tier dividers + swipe-right MINE, dock (4 slots),
    all sheets (Player, My Pick, Search, Sort/Board-options, Menu, Sync, Roster, Removed),
    suggested strip + auto-hide, Help-page gesture section (which must document the swipe).

---

## 0. Code verification — what I confirmed before merging

Facts the proposals asserted, checked against the tree:

| Claim | Verdict |
|---|---|
| `App.tsx` 460/500 lines | ✅ confirmed — no headroom |
| `panels.css` 492/500 lines | ✅ confirmed — **must not be edited** |
| `board.css` `@import`s chrome.css + panels.css at its top | ✅ confirmed — so mobile.css imported *from board.css* would LOSE to board.css's own rules. **D1 is wrong, D3 is right: import last from `main.tsx`.** |
| `check-theme.mjs` scans `readdirSync(SRC)` non-recursively | ✅ — `src/mobile.css` IS covered; a file under `src/css/` would NOT be. Keep it at `src/`. |
| `.table-scroll { max-height: calc(100vh - 300px); overflow: auto }` | ✅ board.css:185 |
| `.toast { bottom: 22px; left: 50%; transform: translateX(-50%) }` | ✅ panels.css:225 |
| `.roster { position: sticky; top: 62px }` | ✅ board.css:316 |
| FilterBar `autoFocus` unconditional | ✅ FilterBar.tsx:81 |
| `.search` has no `font-size` → inherits body 14px | ✅ chrome.css:177 + styles.css:184 → **iOS zoom-on-focus is real** |
| `.field input/select/textarea` also unstyled font-size | ✅ panels.css:67 |
| TooltipProvider `addEventListener('scroll', hide, true)` + `resize` | ✅ TooltipProvider.tsx:101-102 |
| `.ptip { pointer-events: none }` + row `onMouseEnter` → undismissable card on tap | ✅ player-context.css:31, DraftBoard.tsx:114 — **live bug on touch today** |
| `index.html` viewport lacks `viewport-fit=cover` | ✅ line 5 → every `env(safe-area-inset-*)` resolves to 0 |
| `handleDraft` reads `altKey/metaKey/shiftKey` | ✅ DraftBoard.tsx:73; also BestAvailable.tsx:34 |
| `.mine` = `box-shadow: inset 2px 0 0 var(--accent)` on the **left edge** | ✅ board.css:265 |

**Corrections to the proposals:**

- **D1 overstates the tooltip width problem.** `.ptip` is `width: min(620px, calc(100vw - 16px))` — it clamps fine. The actual failure is `.ptip-body { grid-template-columns: 1fr 1fr }` → two ~170px columns of 3-across KPI tiles at 375px. The fix is a single-column variant, not a rewrite.
- **D1's tier left-stripe collides with `.mine`**, which already owns the row's left edge. Rejected in favour of D2's existing `.tier` chip.
- **New bug none of them found:** `Toast.tsx` runs `useEffect(..., [toast, onDismiss])`, and App passes `onDismiss={() => setToast(null)}` — a fresh identity every render. Every App re-render (sync poll, the `now` interval, any state change) clears and restarts the 5-second timer. The toast's dismissal window is not 5s; it is "5s after App stops re-rendering." Since toast-undo is the safety net for a one-tap destructive action, this must be fixed as part of the work (`[toast]` only, or a ref).
- **`PlayerName` fires `tip.show(..., immediate=true)` on `onFocus`.** Tapping a row body focuses that span on iOS. Gating only the row's `onMouseEnter` is insufficient — the guard must live in `TooltipProvider.show`.

---

## 1. Design thesis (which lens won, overall)

**D1's ratio argument wins the row.** 176 "someone else took them" vs ~16 "that's mine" in a 12×16 draft. The two actions must not be twin buttons. One button per row, and it is Remove.

**D2's consolidation argument wins the chrome.** Three always-on components (SuggestedPick, BestAvailable, WatchStrip) plus RosterPanel are ~700px of permanent real estate answering questions that only matter *at your own pick*. They collapse into one on-demand surface.

**D3's platform-convention argument wins navigation grammar** — thumb-zone dock, sheets, pill rail, one primary row action — **but loses on tabs.** See §3.A.

**Everything defers to one rule:** manual removal must never get slower than desktop's single click. It stays a single tap, on the largest target on the screen, with a permanently reachable undo.

---

## 2. Conflict resolutions (each is a reviewer decision point)

| # | Conflict | Winner | Why |
|---|---|---|---|
| **A** | Bottom **tabs** (D3: Board/Best/Roster/Log) vs. **dock of sheet-openers** (D1/D2) | **Dock of sheet-openers** | Tabs navigate *away* from the board. Under a 60s clock the failure mode is "a pick happened while I was on the Roster tab." Sheets overlay the board and dismiss with a downward flick, so the list is never more than one gesture away. D3's "tap the active tab to scroll to top" is kept on the Board slot. |
| **B** | MY PICK: **armed mode** (D1) vs. **swipe-right** (D2/D3) vs. **sheet button only** | **Sheet button (guaranteed) + swipe-right (accelerator). Armed mode rejected.** | Armed mode makes the ✕ button change meaning — precisely the mis-tap class the design exists to eliminate — and D1 itself lists it as the first thing to cut. Swipe-right is stateless and abortable (release before threshold). |
| **C** | Search: **column-reverse results above a bottom input** (D1) vs. top-docked field (D2/D3) | **D1's bottom-pinned, keyboard-aware input — but results in NORMAL order**, with D3's **confirm bar** directly above the input | D1 is right that a top-docked input designs for a viewport that stops existing on focus. D1 is wrong that results should grow upward — inverted reading order has no precedent and puts rank 1 at the visual bottom. The confirm bar gets the top match adjacent to the thumb without inverting the list. **This is the most important merge in the spec.** |
| **D** | Roster need: **chips print `RB 1/2`** (D2) vs. dock badge (D1) vs. NEED strip (D3) | **D2's chips + D1's dock badge. D3's NEED strip cut.** | Chip-printed fill state costs zero pixels and sits exactly where you act on it. A third readout of the same fact is chrome. |
| **E** | Shell: **fixed `100dvh` grid, one inner scroller** (D1) vs. **page scroll** (D2/D3) | **Page scroll** | D1's own risk #2. The app already has one iOS-hostile nested scroller (`.table-scroll`); an app-level one is the same bug at larger scale. Sticky top chrome + fixed dock is boring and works in Safari tab mode, PWA, and Chrome Android identically. |
| **F** | Tier: **left stripe** (D1) vs. **`.tier` chip + tier-break dividers** (D2) | **D2** | The `.tier` chip and `tierClass()` already exist (zero new CSS) and the teal ramp reads faster than a 3px rule. The left edge is already spoken for by `.mine`. **Tier-break dividers are the best single idea in any of the three proposals** — cheap, and they turn the strongest draft heuristic into a structural property of the list. |
| **G** | Best Available: **horizontal lane in the scroller** (D1) vs. **inside a sheet** (D2) vs. **own tab** (D3) | **D2 — into the My Pick sheet** | 6 tiles × `minmax(150px,1fr)` = 2×3 ≈ 330px permanent. Its unique job is *cross-position* comparison, which only arises at your own pick. Between picks, one chip tap puts the best RB at row 1. D1's 92px lane pays permanent rent for a between-picks answer the chips already give. |
| **H** | Star gesture: **long-press** (D3) vs. **swipe-left** (D2) vs. **sheet only** (D1) | **Sheet only** | Long-press collides with iOS text-selection/callout and costs 500ms under a clock. Swipe-left would mean two swipe directions and double the gesture-arbitration surface. **Exactly one swipe direction exists in this design: right = MINE.** Left swipe does nothing, because Remove already has a one-tap button and a second path for it buys nothing. |
| **I** | Watchlist: **★ filter chip** (D2) vs. lane (D1) vs. wrapping list (D3) | **D2's ★ chip** | Zero permanent pixels, reuses a mechanism the user already understands, and does not grow unboundedly. |
| **J** | `mobile.css` import site | **Last import in `main.tsx`** (D3) | Verified: importing from board.css puts it *before* board.css's own rules. Media queries add no specificity. |
| **K** | App.tsx headroom | **D3's `DraftPage.tsx` extraction** + D1's `useBoardKeys` extraction | D3's is a pure composition move (no state relocation). D2's `MobileShell` duplicates the composition in two places. Do both extractions **first, as separate prep commits, before any mobile CSS lands.** |

---

## 3. Page anatomy — 390 × 844 reference

Page scrolls. Top chrome is `position: sticky`, dock is `position: fixed`. No nested scrollers.

```
┌──────────────────────────────────────────┐
│ ① APP BAR            48px   sticky top:0 │
│  [icon] Draft IQ   ● live · 38   [☰]     │
├──────────────────────────────────────────┤
│ ② CHIP RAIL         44px   sticky top:48 │
│  Sort:VOR▾│ALL 142│QB ✓│RB 1/2│WR 0/2│…  │ ← overflow-x, snap
├──────────────────────────────────────────┤
│ ③ SUGGESTED STRIP   44px   sticky top:92 │
│  ▸ NEXT · Bijan Robinson · RB · 62.1     │ ← collapses on scroll-down
├──────────────────────────────────────────┤
│ ④ LIST — the page scroll                 │
│  (banners render inline here, not fixed) │
│  ┌────────────────────────────────────┐  │
│  │ [T2] Bijan Robinson ⚡        62.1  │  │ 64px
│  │ [RB] ATL · RB4 · +8            ▬▬  │  │  [✕]
│  ├────────────────────────────────────┤  │
│  │ ─────────── TIER 3 ─────────────── │  │ 20px divider
│  ├────────────────────────────────────┤  │
│  │ …                                  │  │
│  └────────────────────────────────────┘  │
│  [ Show more (100 of 412) ]        48px  │
├══════════════════════════════════════════┤
│ ⑤ DOCK   56px + safe-area   fixed bottom │
│  ▤Board  ▦Roster  ⬤MY PICK  ↩12  🔎Search│
└──────────────────────────────────────────┘
    Toast rides at bottom: calc(dock + inset + 12px)
```

**Vertical budget (iOS Safari, collapsed toolbar ≈ 784px viewport):**
784 − 136 sticky − 90 dock/safe-area = **558px → 8 rows**, 9 with the suggested strip collapsed. (D2's "10 rows" is optimistic; state the honest number.)

### ① App bar — 48px

`background: var(--surface)`, `border-bottom: 1px solid var(--line)`, `z-index: 20`.

- Left: `logo-icon.png` @ 26px + "Draft IQ" @ 14px/600. Brand lockup (`logo-color`/`logo-white`) and `.brand-divider` are cut — `logo-icon.png` is theme-neutral.
- Center-right: tappable status block, two lines — line 1 `● live · 38 picks` (reuses `.status-chip` dot + tone classes), line 2 `142 available` @ 11px `--ink-3`. Tap → **Sync sheet**. This absorbs `.counts` out of FilterBar (D3's argument wins: the counts exist to sanity-check sync against the real draft, so they belong next to sync, not next to filters).
- Right: 44×44 `☰` → **Menu sheet**.

### ② Chip rail — 44px

`overflow-x: auto; flex-wrap: nowrap; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; scrollbar-width: none`. Visual chip height 34px inside a 44px tap band.

Order: `Sort: VOR ▾` pill (pinned left, `--surface-2`) │ `ALL 142` │ `QB ✓` │ `RB 1/2` │ `WR 0/2` │ `TE` │ `DST` │ `K` │ `★ 3` │ dashed ghost chips for hidden positions │ `⋯`.

- Position chips keep their existing `.chip.pos-*` colored bottom border.
- Fill state from `filledPositions(roster)` / `buildRoster()`. Format: bare `RB` until ≥1 starter slot at that position is filled, then `RB 1/2`, then `RB ✓` + dimmed when full. Quiet early, informative late.
- `★ n` filters to `watching` (starred and still available) — this is WatchStrip's entire job at zero pixel cost.
- `⋯` → **Board options sheet**.
- **`.chip-wrap` / `.chip-x` do not render on mobile.** A ~14px destructive target welded to a filter chip is a mis-tap that silently deletes a position from the board.

### ③ Suggested strip — 44px, collapsible

One line: 3px `--accent` left rail, `NEXT`, pos badge, name @ 15px/700, VOR right-aligned tabular. Hidden entirely when `suggestion === null`. Tap → **My Pick sheet**.

It earns 44px (rather than being folded into the dock) because `suggestPick()` is roster-aware and floor-weighted, so it routinely disagrees with row 1 — a disagreement that is worthless if you have to tap to discover it.

**Collapse behaviour (D3's auto-hide, scoped):** on scroll-down past 80px it translates up out of view; on any scroll-up it returns. The chip rail never hides — it is the primary control. This is what makes ~380px split-screen companion use survivable.

### ④ Player row — 64px, the atom

Grid: `[tier 28px] [name block 1fr] [vor 52px] [✕ 48px]`, 12px side padding.

- **Line 1:** `.tier` chip (`tierClass()`) · name 15px/600 ellipsis · `★` if starred · `PlayerBadges` ⚠/⚡ · `MINE`/`ESPN` `.tag`
- **Line 2:** `.badge pos-*` · team · `RB4` (`pos_rank`, **promoted in from the tooltip** — 5 chars answering "how far down this position am I") · signed ADP pill, **rendered only when `|adp_diff| ≥ 5`**
- **VOR block:** `fmtNum(vor,1)` @ 20px tabular, with the existing `.vor-bar` as a 2px underline scaled against `maxVor`. The only chart in the row, and it makes the VOR cliff visible while scrolling.
- **Action:** one 48×48 `✕` → `onDraft(player, false)` **explicitly** (no modifier read).
- Tap anywhere else on the row → **Player sheet**.
- `.drafted` (strikethrough + `--ink-3`) and `.mine` (inset accent left edge, widened to 3px) port unchanged. When `showDrafted` is on, drafted rows swap ✕ for `↩`.
- Perf: `content-visibility: auto; contain-intrinsic-size: 64px`. Mobile page size **100**, not 250.

**Tier-break divider:** 20px band between rows whose `tier` differs, `border-top: 1px solid var(--line-2)` + a 10px `TIER 4` label. **Rendered only when `sort.key === 'vor'`** (the default and ~95% case); meaningless under any other sort.

Name-block width at 390px: 390 − 12 − 28 − 8 − 52 − 8 − 48 − 12 = **222px** ≈ 20 characters at 15px/600. "Christian McCaffrey" is 19. Longer names ellipsis; the sheet has the full name.

### ⑤ Dock — 56px + `env(safe-area-inset-bottom)`

`position: fixed; bottom: 0; background: var(--surface); border-top: 1px solid var(--line); z-index: 30`. **Four slots (per FINAL DECISION 9), ~97px each at 390px**, all ≥44px tall.

`[▦ Roster 5/9] [⬤ MY PICK] [↩ 12] [🔎 Search]`

**Ordering rationale:** a right thumb's reach is best at the right edge, so the two highest-frequency dock items (Search, Removed/undo) sit right. MY PICK sits center-left and elevated 4px in `--accent` per convention. This mirrors the row, where the #1 action (✕) is also right-edge — one consistent "consequential things live right" rule.

- Scroll-to-top: tap the app bar's brand block (the dock has no Board slot).
- **Roster n/9** — filled-starter count answers "what do I still need" with zero taps. → Roster sheet.
- **MY PICK** — → My Pick sheet (the on-the-clock cockpit). **Not** an arm toggle.
- **↩ n** — manual removal count, doubles as a sanity check against the real draft. → Removed sheet.
- **Search** — → Search overlay.

Active/pressed = `--accent`, resting = `--ink-3`.

**Requires `viewport-fit=cover` in `index.html`'s viewport meta** or the dock sits under the home indicator.

---

## 4. Overlays

One shared `Sheet` primitive: `--scrim` backdrop, panel anchored bottom, `border-radius: var(--radius-lg) var(--radius-lg) 0 0`, drag handle in `--line-2`, `max-height: 85dvh`, `overscroll-behavior: contain`, `padding-bottom: env(safe-area-inset-bottom)`, `box-shadow: var(--shadow-2)`. Dismiss: swipe-down, scrim tap, 44px ✕, or hardware Back (one `history.pushState` entry per open sheet). Three redundant exits because an accidental sheet during a live pick must cost well under a second.

### Player sheet
Tap a row body / a Best Available line / a suggested strip.

Same `buildTooltip(player, teams[player.team], byeCounts)` output that feeds the desktop tooltip, rendered through a `.ptip.ptip-sheet` variant — **one context model, not two.** `.ptip-body` regrids `1fr 1fr` → `1fr`; `.ptip-kpis` stays 3-across (≈110px tiles, legible); `.ptip-kpis.market` stays 2-across.

**Content re-ordered for touch, because the sheet is an action surface:**
1. Header — pos badge, name 18px/700, `ATL · RB4`, tier chip, 44×44 `★` toggle (the only starring affordance on mobile), 44×44 ✕
2. **Callouts first** (`content.callouts`) — ⚠ TD regression, ⚡ Konami, bye collision, SOS. Already plain English, need zero cross-row comparison, and are the highest-value mobile reading. On desktop they sit in the right column; here they lead.
3. The stats the row dropped: Proj Pts, SD Pts, Floor, Ceiling, Risk, ADP, ADP diff, Dropoff — as a 2-column definition list
4. Team KPIs (`teamKpis`) → Last-season KPIs + `rookieNote` → Draft-market KPIs

**Sticky footer, always visible above the scroll:** two 48px buttons, `Mine` (filled `--accent`) and `✕ Someone else took them` (secondary). Pinned at the *bottom* both for thumb reach and so a fast tap can't land on an action while the sheet animates in. When the player is already drafted, a single `↩ Put back on the board`.

### My Pick sheet — the design's central trade
Dock center button or the suggested strip. Four components and ~700px of permanent chrome become one button.

1. **SuggestedPick in full** — badge, name 18px, `PlayerBadges`, the `fills your FLEX slot · floor-weighted` reason, `VOR / floor / ceil`, and its two buttons scaled to 48px
2. **Needs line** — `Open: RB, FLEX, K` from `buildRoster().starters` where `player === null`, plus `Bench 3/7`
3. **BEST AVAILABLE** — one compact 48px line per `livePositions`: `[badge] Name · VOR · floor–ceil` + trailing 44px `Mine`. Six lines ≈ 290px in a sheet vs ~330px permanent on screen
4. **WATCHING** — `watching` as compact rows with `Mine` / `✕`. Section hidden when empty

### Search overlay — full-screen, keyboard-aware
The fastest manual-removal path in the app. Hear a name → gone in <3s.

```
┌──────────────────────────────┐
│ Search              [Done]   │ 48px
├──────────────────────────────┤
│  1 [RB] Josh Jacobs  LVR 41.2│ 56px rows, NORMAL order,
│  2 [WR] Josh Downs   IND 12.1│ same ✕ action as the board
│  …                           │
├──────────────────────────────┤
│ [RB] Josh Jacobs · LVR · 41.2│ CONFIRM BAR 52px, --accent border
│      [ ✕ Remove ] [ Mine ]   │ top match, thumb-adjacent
├──────────────────────────────┤
│ [ 🔎 josh jac…            ✕ ]│ INPUT 52px, translateY(--kb-inset)
└──────────────────────────────┘
▓▓▓▓▓▓ on-screen keyboard ▓▓▓▓▓▓
```

- Input pinned above the keyboard via a `--kb-inset` CSS var written by a `visualViewport` resize/scroll listener. **iOS Safari does not shrink the layout viewport when the keyboard opens; there is no pure-CSS solution.**
- `font-size: 16px` mandatory. `inputmode="search"`, `enterkeyhint="go"`, `autocapitalize/autocorrect/spellcheck="off"`.
- `autoFocus` is correct **here and only here** — it must become a prop, gated off on the inline FilterBar path, where today it pops the keyboard on page load and eats 45% of the viewport before the user sees anything.
- Feeds the existing `search` / `matchesSearch` / `visible` pipeline unchanged. Keyboard **Go** maps to the existing `onEnter` (drafts the top undrafted result) — desktop's fastest path preserved 1:1.
- After any removal: `draftPlayer()` already calls `setSearch('')`; the overlay keeps focus and the keyboard up, and the toast renders above the keyboard. Back-to-back removals during a run are `type 3 letters → tap` with no chrome round-trip.
- `Done` (44px, top-right) or swipe-down closes.

### Roster sheet
`RosterPanel` verbatim. CSS-only changes: unset `position: sticky; top: 62px`; `.slot` padding 5px → 12px (48px rows); `.slot-actions .btn.icon` from ~20px to **44×44**. Keeps the `X slots are full → Hide QB` suggestion block — **this must render on mobile**, because it becomes the primary per-position hide affordance now that `.chip-x` is gone. Empty-state copy swaps "Alt/Cmd-click Draft" for "swipe a player right, or tap them and choose Mine."

### Removed sheet
`RemovedPanel`, rows restacked to two lines: line 1 `[badge] Name [MINE]`, line 2 `3m ago · LVR · VOR 41.2`. `↩ Add back` becomes 44×44 at the right edge. Summary line at top: `38 off the board — 26 by hand, 12 from ESPN`. Keeps the `espnCount` footnote. `sync.unmatched` renders here as a collapsible section, **not** as a full-width banner eating the top of the board.

### Board options sheet (`⋯`)
(a) **Sort** — 48px rows for all `COLUMNS` keys plus `rank`/`pos_rank`/`adp`; active key shows ▲/▼ in `--accent`; tapping the active key flips direction via the existing `handleSort()`. Closes on selection. (b) **Show drafted** toggle. (c) **Hidden positions** — a row per position with a switch (`dismissPos`/`restorePos`). (d) One-tap **Hide filled positions (QB, TE)** driven by `filledPositions()`.

### Sync sheet (app-bar status block)
Large `.status-chip`, `38 picks · tap ⚡ · synced 12s ago`, Live toggle (disabled + explanatory line when `!credsReady`), 48px `Sync now`, provider/league/season, unmatched-picks list as tappable rows with a "find on board" shortcut. Sync error text lives here, not as a `--bad-soft` banner on the board.

### Menu sheet (`☰`)
48px rows: **Scoring** segmented (PPR/Half/Non) · **Averaging** segmented · the `ADP/ECR/Risk are PPR-only` hint when `scoring !== 'PPR'` · **Theme** ☀/☾ · nav rows → How to use, Strategy, Settings.

### Settings drawer
**No TSX change** (SettingsDrawer.tsx is 435 lines). Pure CSS: `.drawer-backdrop { align-items: flex-end }`, `.drawer { width: 100%; max-height: 92dvh; border-radius: var(--radius-lg) var(--radius-lg) 0 0 }`, `.roster-grid` 3 cols → 2, all `.field input/select/textarea` → `font-size: 16px; min-height: 44px`, `.drawer-foot` buttons → 48px full-width stacked.

### Help / Strategy
Existing `.page` styles, reached from the Menu sheet. `padding: 20px 16px calc(56px + env(safe-area-inset-bottom) + 24px)`. The `<kbd>` shortcut section is **conditionally replaced** with a mobile-gestures section. Repo convention requires this on any UX change.

---

## 5. Every draft-day action → touch mapping

| # | Action | Freq / draft | Gesture | Taps | Handler |
|---|---|---|---|---|---|
| 1 | **Someone else took them** | ~176 | Row's right-edge **✕**, 48×48 | **1** | `draftPlayer(p, false)` — explicit, no modifier read |
| 2 | Same, by name | ~40 of the 176 | Dock **🔎** → type 3 letters → keyboard **Go**, or tap **✕ Remove** on the confirm bar (one shared handler, see FINAL DECISION 2) | ~3 keys + 1 | confirm-bar action |
| 4 | **My pick** — accelerator | ~16 | **Swipe row right past ~30%**, release (rules in FINAL DECISION 1 + below) | 1 gesture | `draftPlayer(p, true)` |
| 5 | **My pick** — guaranteed | ~16 | Tap row → Player sheet → footer **Mine** (48px) | **2** | `draftPlayer(p, true)` |
| 6 | **My pick** — on the clock | ~16 | Dock **MY PICK** → My Pick sheet → **Mine** on the suggestion or a Best Available line | **2** | `draftPlayer(p, true)` |
| 7 | Read player context | many | Tap anywhere on the row except ✕ | 1 | `buildTooltip()` → Player sheet |
| 8 | **Undo last removal** | as needed | **Undo** in the toast, 44px, `bottom: calc(56px + inset + 12px)`, `left:8px; right:8px` | 1 | `undoPlayer` |
| 9 | Undo an older removal | as needed | Dock **↩ n** → Removed sheet → **↩ Add back** (44px) | 2 | `undoPlayer` |
| 10 | Filter by position | high | Tap a chip in the rail; tap the active chip to return to ALL | 1 | `onPosFilter` unchanged |
| 11 | Filter to watchlist | low | Tap the **★ n** chip | 1 | client filter on `watching` |
| 12 | Star / unstar | ~5 | **★** in the Player sheet header (44×44) | 2 | `toggleStar` |
| 13 | Check roster needs | high | **Read the chips** (`RB 1/2`) — zero taps; or dock **Roster 5/9** | **0** / 1 | `buildRoster` |
| 14 | Fix a mis-marked pick | rare | Roster sheet → slot row → **✕** (not mine) or **↩** (back to board), both 44px | 2 | `onNotMine` / `onRestore` |
| 15 | See the app's recommendation | ~16 | Read the 44px suggested strip (0 taps) or tap it / dock **MY PICK** | 0 / 1 | `suggestPick` |
| 16 | Compare best across positions | ~16 | Dock **MY PICK** → Best Available block | 1 | — |
| 17 | Change sort | rare | `Sort: VOR ▾` pill → sheet → tap a key (tap again to flip) | 2 | `handleSort` unchanged |
| 18 | Hide a full position | ~2 | Roster sheet **Hide K** button, or Board options → Hidden positions | 2 | `dismissPos` |
| 19 | Restore a hidden position | rare | Tap its dashed ghost chip in the rail, or Board options | 1 | `restorePos` |
| 20 | Show drafted players | rare | Board options → **Show drafted** | 2 | `setShowDrafted` |
| 21 | Check sync / force sync | ~5 | Tap the app-bar status block → Sync sheet → **Sync now** | 1–2 | `runSync` |
| 22 | Scoring / averaging | 1 (pre-draft) | ☰ → Menu sheet | 2 | — |
| 23 | Theme | rare | ☰ → Menu sheet | 2 | `toggleTheme` |
| 24 | Settings / league setup | 1 (pre-draft) | ☰ → Settings… → full-height bottom sheet | 2 | — |
| 25 | Load more rows | ~2 | 48px **Show more (100 of 412)** at list end | 1 | explicit, never infinite-scroll |
| 26 | Scroll list to top | frequent | Tap the app bar's brand block | 1 | — |
| 27 | Dismiss any sheet | constant | Swipe down / tap scrim / 44px ✕ / hardware Back | 1 | — |
| 28 | Keyboard shortcuts ↓↑ Enter M W | — | **Explicitly omitted.** Effect skipped, `cursorIdx` forced `null` | — | see §6 |

**Swipe implementation rules:** `touch-action: pan-y` on rows so vertical scroll always wins arbitration; lock to horizontal only after 10px travel with a >2:1 dx:dy ratio; ignore touches starting within 20px of the left edge (iOS back-swipe); require ~30% width to commit; the underlay is `--accent` bg / `--on-accent` text. **Neither swipe is the only route to its action** — a user who never discovers it loses nothing.

---

## 6. What gets cut

### Cut outright (capability removed)

| Cut | Justification |
|---|---|
| **Keyboard shortcuts** ↓ ↑ Enter M W, `cursorIdx`, the `tr.cursor` outline, the global `keydown` listener | No cursor concept without a keyboard. **`cursorIdx` must be forced `null`, not merely ignored** — `DraftBoard`'s `cursorRef.current?.scrollIntoView()` effect would yank the list under the user's thumb. Every shortcut has a documented touch equivalent in §5. |
| **Hover tooltip** | Must be suppressed **at the source** in `TooltipProvider.show` via `matchMedia('(hover: none)')` — not just on the row, because `PlayerName.onFocus` also fires it. Today, tapping a row on iOS shows a 620px `pointer-events: none` card that cannot be dismissed by tapping it. This is a live bug, fixable independently, and should ship first. |
| **`.chip-wrap` / `.chip-x`** | ~14px destructive target glued to a filter chip. Re-homed to Board options + the Roster sheet's `Hide K`. |
| **Per-row `Mine` button** | The 11:1 ratio argument. Three deliberate paths replace it. |
| **Per-row star column** (`.star-col`, 30px) | ~34px of a 390px width for a five-times-per-draft action. Becomes a sheet toggle + an inline `★` marker. |
| **Alt/Cmd/Shift modifiers** in `DraftBoard.handleDraft` and `BestAvailable` | No modifier keys on touch. Mobile paths pass `mine` explicitly. |
| **Brand wordmark + `.brand-divider`** | Only `logo-icon.png` @ 26px survives. |
| **Board/Removed `.view-tabs`** | A full 44px row of permanent chrome for a view opened a handful of times. The dock's `↩ n` owns it. |

### Demoted (fully reachable, no permanent pixels)

| Component | Reclaimed | New home |
|---|---|---|
| TopBar: scoring seg, avg seg, PPR hint, page nav, theme toggle | ~120px | Menu sheet |
| TopBar: Live toggle, Sync now, sync-meta, status detail | (same row) | Sync sheet, behind one tappable app-bar line |
| **RosterPanel** | ~300px | Roster sheet; its highest-value output (per-position fill) reprinted free on the filter chips |
| **BestAvailable** 6-tile grid | ~330px | My Pick sheet |
| **WatchStrip** | ~40px, unbounded | `★` filter chip + inline `★` marker |
| **SuggestedPick** card | ~70px → 44px strip | Reason/floor/ceil/buttons → My Pick sheet |
| 9 of 11 table columns + the entire `<thead>` | the horizontal-scroll problem | Player sheet + Sort sheet |
| `Show drafted` checkbox | — | Board options |
| `.counts` line | — | App-bar status block, line 2 |
| Unmatched-picks warn banner | can exceed the visible list on a phone | Removed sheet, collapsible |

**Column disposition:** Proj Pts, SD Pts, Risk, Dropoff, ECR, AAV → sheet. Floor + Ceiling **merged** into one `92–171` range token in the sheet (two numbers, one field). ADP diff → conditional row pill at `|diff| ≥ 5`. Team → line 2. `pos_rank` → **promoted into** the row. Name, Tier, Pos, Team, VOR survive on the row.

**Kept unchanged** because they are pure glanceability-per-pixel: `.badge pos-*`, the `.tier` teal ramp, `.vor-bar`, `PlayerBadges` ⚠/⚡, the `MINE` tag, and the `.drafted` strikethrough.

---

## 7. Breakpoint strategy

| Query | Effect |
|---|---|
| `@media (max-width: 640px)` | The entire mobile layer. Everything in this spec. |
| `@media (max-width: 1100px)` | **Unchanged.** Existing tablet stack (roster panel below board). 641–1100px behaves exactly as today. |
| `@media (hover: none)` | **Orthogonal and separate.** Guards *only* tooltip suppression, so a 700–1024px touch tablet never gets an undismissable card. Implemented as a JS `matchMedia` check inside `TooltipProvider.show`, not CSS. |
| `useIsMobile()` | `matchMedia('(max-width: 640px)')` hook driving component branching. Must match the CSS query exactly — export the string from one module so they cannot drift. |

**Units:** `dvh` everywhere, never `vh`. `env(safe-area-inset-bottom)` on the dock and toast — **requires adding `viewport-fit=cover` to the viewport meta, or every inset silently resolves to 0.**

---

## 8. Implementation sketch

### Prep commits (must land first, before any mobile CSS)

1. **`components/DraftPage.tsx`** (~110 lines) — extract banners + FilterBar + `.layout` + RosterPanel composition out of App.tsx. Props only; no state moves.
2. **`hooks/useBoardKeys.ts`** (~45 lines) — the `keydown` effect out of App.tsx, gated on `!isMobile`. Also fixes its missing dependency array.
3. **`Toast.tsx` timer fix** — dep array `[toast]` only. Independent bug fix; changes desktop behaviour, so call it out in review.
4. **`TooltipProvider` `(hover: none)` guard** — standalone fix for a live touch bug.

Net App.tsx: 460 → ~330 lines, with room for the sheet state machine.

### New files

| File | ~Lines |
|---|---|
| `src/mobile.css` | 340 |
| `src/hooks/useIsMobile.ts` | 18 |
| `src/hooks/useKeyboardInset.ts` | 32 |
| `src/hooks/useSheets.ts` (single discriminated `sheet` value + history-back, **not** six booleans) | 40 |
| `src/hooks/useScrollDirection.ts` (suggested-strip collapse) | 25 |
| `src/components/mobile/Sheet.tsx` | 75 |
| `src/components/mobile/BottomDock.tsx` | 70 |
| `src/components/mobile/BoardRow.tsx` (+ `TierDivider`) | 100 |
| `src/components/mobile/PlayerSheet.tsx` | 90 |
| `src/components/mobile/MyPickSheet.tsx` | 85 |
| `src/components/mobile/SearchOverlay.tsx` | 95 |
| `src/components/mobile/SortSheet.tsx` | 55 |
| `src/components/mobile/MenuSheet.tsx` | 80 |
| `src/components/mobile/SyncSheet.tsx` | 60 |
| `src/components/mobile/ChipRail.tsx` | 65 |

### Changed files

| File | Change | Δ |
|---|---|---|
| `main.tsx` | `import './mobile.css'` **last** | +1 |
| `index.html` | `viewport-fit=cover`; make `theme-color` follow the toggle (today it's set pre-paint only, so toggling to dark leaves a white status bar — far more visible with a full-bleed mobile layout) | +2 |
| `App.tsx` | prep extractions, `useIsMobile`, `useSheets`, force `cursorIdx = null` on mobile | −130 net |
| `DraftBoard.tsx` (223) | early-return `<BoardRow>` list when mobile; `PAGE` 250 → 100 on mobile; ✕ passes `false` explicitly | +20 |
| `FilterBar.tsx` (150) | `autoFocus` becomes a prop; mobile branch renders `<ChipRail>` | +25 |
| `TooltipProvider.tsx` | `(hover: none)` bail in `show`; skip scroll/resize listeners on mobile (**`resize` fires on every iOS keyboard open**) | +10 |
| `Toast.tsx` | dep-array fix; 8s on mobile | +6 |
| `RosterPanel.tsx` | empty-state copy only (44px targets are CSS) | +3 |
| `HelpPage.tsx` | mobile-gestures section replacing `<kbd>` when mobile | +25 |
| `panels.css` (**492/500**) | **DO NOT TOUCH.** Every override lives in mobile.css. | 0 |
| `chrome.css`, `board.css`, `player-context.css` | **untouched**; mobile.css wins by import order | 0 |

**Estimated scope:** ~1,100 new lines, ~200 modified, 15 new files. Roughly 3–4 days of focused work plus real-device time.

### Theming — zero new tokens required

Verified against the existing set:

| Surface | Tokens |
|---|---|
| Dock | `--surface`, `--line`, `--ink-3`, `--accent` |
| Sheets | `--scrim`, `--surface`, `--shadow-2`, `--radius-lg`, `--line-2` (drag handle) |
| Swipe-right MINE underlay | `--accent` / `--on-accent` |
| Tier-break divider | `--line-2` + existing `--tier-N` |
| Suggested strip | `--accent-soft` bg, `--accent-ink` text, `--accent` rail |
| Confirm bar | `--surface`, `--accent` border |
| ADP pill | `--good` / `--bad` |
| Inline `★` | `--star` |

`-webkit-tap-highlight-color: transparent` uses a **keyword**, which `check-theme.mjs`'s `RAW_COLOR` regex does not match — **D1's proposed `--tap-highlight` token is unnecessary.** Resist inventing dock/sheet-specific colors; if a new token proves genuinely necessary it must go in **both** blocks or `check:theme` fails the build. Verify the swipe underlay clears 3:1 against `--surface` in both themes.

### Mandatory pre-ship fix list (all verified live in the tree)

1. `.search` + every `.field input/select/textarea` → `font-size: 16px` below 640px. Under 16px, iOS Safari zooms the viewport on focus **and does not zoom back out** — mid-draft, with no obvious recovery.
2. `.table-scroll { max-height: none; overflow: visible }` below 640px.
3. `.toast` → `bottom: calc(56px + env(safe-area-inset-bottom) + 12px); left: 8px; right: 8px; transform: none`. Today it sits at `bottom: 22px`, directly under the new dock — the undo path would be invisible.
4. `.roster { position: static; top: auto }` inside the sheet.
5. `FilterBar` `autoFocus` gated off on the inline path.
6. `TooltipProvider.show` bails on `(hover: none)`; scroll/resize listeners skipped on mobile.
7. `cursorIdx` forced `null`; `keydown` effect skipped.
8. `viewport-fit=cover` in the viewport meta.
9. `Toast` dep-array fix.
10. `body { padding-bottom: calc(56px + env(safe-area-inset-bottom) + 12px) }` so the last row clears the dock.

### Ship order (if scope must be cut)

**Phase 1 — makes the app usable at all:** the four prep/bug commits · app bar · chip rail · `BoardRow` list · dock · Player sheet · the 10-item fix list.
**Phase 2:** Search overlay + confirm bar · My Pick sheet · Roster/Removed sheets.
**Phase 3:** Sort/Board-options/Menu/Sync sheets · swipe-right · tier dividers · suggested-strip auto-hide.

---

## 9. Risks

1. **iOS keyboard + fixed positioning — the top execution risk.** Safari does not shrink the layout viewport on keyboard open. The `visualViewport`-driven `--kb-inset` hook is the only solution. **Budget real-device time; the simulator does not reproduce it.**
2. **Swipe vs. scroll arbitration.** The classic failure mode of swipeable lists. Mitigations in §5. Backstop: neither swipe is the only route to its action, so if it feels bad it can be deleted with zero capability loss.
3. **Two board code paths.** `DraftBoard` early-returning `BoardRow` means table and list can drift. Keep row data derivations shared and add a mobile smoke pass (sort × filter × drafted × mine × starred × espn) to the pre-ship checklist.
4. **Comparison shopping degrades.** You cannot scan floor across four RBs the way you can on desktop. Partial mitigation: line 2 carries VOR + tier + pos-rank + ADP delta, and the Sort sheet turns comparison into ordering. **Accept that deep analysis stays a desktop/pre-draft activity.**
5. **Two taps for "my pick," ~16×/draft** — a deliberate cost paid to eliminate mis-taps on the ~176×/draft action, and you have the whole 60s clock. If it grates in real use, the fallback is swipe-right (already specified) before adding a row button back.
6. **Live sync is effectively desktop-only.** The ESPN tap is a userscript; a phone user is almost always on the manual path (Yahoo the lone exception). That raises the stakes on the one-tap ✕ and on undo. Nothing here may make manual removal slower than the current desktop click.
7. **Silent sync removals.** The toast fires only on manual removal. On a small screen the user has far less peripheral view of the list. Consider a subtle count-change pulse on the app-bar status block.
8. **File-size ceilings.** `panels.css` at 492/500 and `App.tsx` at 460/500 leave essentially no headroom. `mobile.css` at ~340 lines must be watched; if it approaches 500 it splits into `mobile.css` + `mobile-sheets.css`, both still at `src/` top level so `check-theme` sees them.
9. **Two very different viewports.** Full-screen portrait (~784px, 8–9 rows) and split-screen companion (~380px, ~3 rows without the collapsing strip). The suggested-strip auto-hide is what makes case two usable and is the piece most likely to feel janky — test on real iOS Safari, where toolbar collapse fires scroll events of its own.
10. **Residual mis-tap risk.** Even at 48×48 with an 8px gutter, a shaky hand produces wrong removals. **Undo coverage is the real safety net** — verify the toast is reachable and legible above the dock on the smallest supported device (375×667, no safe-area inset) before anything else ships.
11. **HelpPage documents shortcuts that don't exist on touch.** Repo convention requires updating it on any UX change, and the phone is the device most likely to be in a drafter's hand.

---

## 10. Open questions — ALL RESOLVED in "FINAL DECISIONS" at the top; kept for rationale only

1. **Swipe-right for MINE — v1 or defer to phase 3?** It is the only gesture in the design and the only piece with real arbitration risk. The sheet path covers the need without it. *Recommendation: specify now, ship in phase 3, cut permanently if it tests badly.*
2. **Confirm bar vs. keyboard Go — double-fire risk.** Both fire `onEnter`-equivalent logic. Does Go dismiss the confirm bar first, or do we suppress `onEnter` while the bar is visible? *Needs an explicit call.*
3. **Toast timer fix changes desktop behaviour.** Today the toast effectively persists while App re-renders. Fixing the dep array makes it a real 5s window on desktop — shorter than users currently experience. Ship the fix on both, or mobile-only?
4. **Chip fill-state format.** `RB 1/2` (informative, wider) vs `RB ✓` only (quieter). The rail scrolls, so width is not truly scarce — but a rail of `QB 1/1 · RB 1/2 · WR 0/2 · TE 0/1` is noisy pre-draft. *Recommendation: progressive as specified in §3②; confirm.*
5. **Does mobile need `showDrafted` at all?** It exists to audit sync against the real draft. The app-bar counts + Removed sheet may cover it entirely, letting us drop a Board-options group.
6. **Best Available in the My Pick sheet: all 6 `livePositions`, or only positions with an open starter slot?** The latter is shorter and more decision-relevant; the former preserves the desktop mental model.
7. **Suggested-strip auto-hide: v1 or v2?** It costs a scroll-direction hook and is the jankiest piece. Without it, split-screen shows ~3 rows.
8. **Dock slot order.** Spec puts Search rightmost (best thumb reach for the #2 action) and Board leftmost. Convention would put Board first-and-primary. *Confirm the ergonomic argument beats the convention.*
9. **Is `Board` worth a dock slot at all?** Its only job is scroll-to-top + clear filter. Dropping it gives four 97px targets instead of five 78px ones.
10. **PWA / add-to-home-screen** — out of scope for this retrofit? It would resolve most `dvh` and URL-bar-collapse ambiguity at the cost of a manifest + install prompt.
11. **`theme-color` meta following the theme toggle** — in scope? It is a two-line fix but touches the pre-paint script contract in `index.html`.
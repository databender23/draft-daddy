import { useIsMobile } from '../hooks/useIsMobile';

/**
 * Every gesture the phone layout defines (docs/mobile-design.md §5). Repo
 * convention: the in-app How-to-use page is updated on any UX change, and the
 * phone is the device most likely to be in a drafter's hand — a page that
 * documents ↓/↑/Enter shortcuts that do not exist on touch is worse than none.
 */
function MobileGestures() {
  return (
    <>
      <li>
        <strong>Swipe right to claim a player:</strong> drag a row to the right past about a third
        of its width and let go — the row shows a teal <strong>MINE</strong> underlay as it
        travels, and the player is removed from the board and added to your roster. Release before
        that point and nothing happens. Vertical scrolling always wins, so a normal flick down the
        list can never trigger it.
      </li>
      <li>
        <strong>Every gesture has a button:</strong> the swipe is only an accelerator. Tapping a
        row opens the player sheet, whose footer has <strong>Mine</strong> and{' '}
        <strong>✕ Someone else took them</strong>; <strong>MY PICK</strong> in the dock offers the
        same two on the suggestion and on the best available at every position.
      </li>
      <li>
        <strong>Sheets:</strong> the dock along the bottom opens the roster, your pick, the removed
        list and search. Close any sheet by flicking it down from its handle, tapping outside it,
        tapping <strong>✕</strong>, or pressing your phone&rsquo;s Back button.
      </li>
      <li>
        <strong>Star a player:</strong> tap the row, then <strong>★</strong> in the sheet header.
        The <strong>★</strong> chip in the filter rail then shows only starred players still
        available.
      </li>
      <li>
        <strong>Sort and options:</strong> the <strong>Sort: VOR ▾</strong> pill (or{' '}
        <strong>⋯</strong>) at the ends of the filter rail opens sorting, <em>Show drafted</em>,
        and hiding or restoring positions. Tap the active sort key again to flip direction.
      </li>
      <li>
        <strong>Scroll back to the top:</strong> tap <strong>Draft Daddy</strong> in the top bar.
      </li>
    </>
  );
}

export default function HelpPage() {
  const isMobile = useIsMobile();
  return (
    <article className="page">
      <h1>How to use the draft board</h1>
      <p className="page-lead">
        Everything is built around one goal: when you&rsquo;re on the clock with 60 seconds, the
        right pick should be one glance and one click away.
      </p>

      <h2>1 · Connect your ESPN league (once, before draft day)</h2>
      <ol>
        <li>
          Open your league at fantasy.espn.com and copy the address bar URL.
        </li>
        <li>
          Open <strong>Settings</strong> here and paste it into <strong>Quick connect</strong> —
          league, season and your team fill in automatically.
        </li>
        <li>
          Hit <strong>Test connection</strong>. Public leagues connect immediately. If yours is
          private, the app will ask for two cookies (<code>espn_s2</code> and <code>SWID</code>) —
          find them at fantasy.espn.com → DevTools → Application → Cookies, and paste them in.
          They stay in your browser only.
        </li>
        <li>
          Click <strong>Import from ESPN</strong> in the roster section so the app knows your
          league&rsquo;s exact lineup (QB/RB/WR/TE, flex, superflex, bench size). You can also set
          these by hand for any league.
        </li>
      </ol>

      <h2>2 · During the draft</h2>
      <ul>
        {isMobile ? (
          <>
            <li>
              <strong>When someone else picks:</strong> tap the <strong>✕</strong> at the right
              edge of their row. By name: tap <strong>🔎 Search</strong> in the dock, type three
              letters, then hit <strong>Go</strong> on the keyboard or <strong>✕ Remove</strong> on
              the confirm bar — both do exactly the same thing to the top match, and the keyboard
              stays up for the next one.
            </li>
            <li>
              <strong>When you pick:</strong> swipe the row right, or tap the row and choose{' '}
              <strong>Mine</strong>. Either way the player leaves the board and joins your roster.
            </li>
          </>
        ) : (
          <>
            <li>
              <strong>When someone else picks:</strong> type a few letters of the player&rsquo;s
              name and press <kbd>Enter</kbd> — the top match is removed from the board. Or click{' '}
              <strong>✕ Remove</strong> on any row.
            </li>
            <li>
              <strong>When you pick:</strong> click <strong>Mine</strong> (or hold Alt/Cmd/Shift
              while clicking ✕ Remove). The player is removed from the board and lands in the My
              Roster panel.
            </li>
          </>
        )}
        <li>
          <strong>Live sync:</strong> with your league connected, flip <strong>Live</strong> on —
          the app polls ESPN every 10 seconds and removes drafted players automatically. Manual
          removal always works too; use whichever is faster in the moment.
        </li>
        <li>
          <strong>Draft-room tap (beta):</strong> for true real-time picks, install the tap
          userscript (Tampermonkey → open <code>/tap/draftdaddy-espn-tap.user.js</code> on this
          server), then click the <strong>IQ</strong> badge in ESPN&rsquo;s draft room and paste
          the key from Settings → Live draft tap. Picks stream in within seconds and a{' '}
          <strong>tap ⚡</strong> chip appears in the top bar. Practice any time in ESPN&rsquo;s
          mock draft lobby — full steps in the userscript&rsquo;s README.
        </li>
        <li>
          <strong>Suggested pick:</strong> the highlighted {isMobile ? 'strip' : 'card'} above the
          board recommends your best next pick given your open roster slots — floor-weighted while
          you still need starters, ceiling-weighted once you&rsquo;re drafting bench upside.
          {isMobile ? ' Tap it for the full recommendation.' : ''}
        </li>
        <li>
          <strong>Watchlist:</strong>{' '}
          {isMobile ? (
            'star players from the player sheet, before or during the draft. The ★ chip in the filter rail counts the starred players still available and filters the board down to them.'
          ) : (
            <>
              star players (☆ on any row, or <kbd>W</kbd>) before or during the draft. Starred
              players still available show in the ★ strip; they disappear automatically when
              drafted.
            </>
          )}
        </li>
        <li>
          <strong>Best available:</strong>{' '}
          {isMobile
            ? 'the MY PICK sheet lists the top undrafted player by VOR at every position, with floor and ceiling — the one place to compare across positions.'
            : 'the tiles above the table always show the top undrafted player by VOR at each position, with floor and ceiling.'}
        </li>
        <li>
          <strong>{isMobile ? 'Player sheet:' : 'Player card on hover:'}</strong>{' '}
          {isMobile ? (
            'tap anywhere on a row except the ✕ and the full picture slides up: '
          ) : (
            <>
              rest your mouse anywhere on a player&rsquo;s row (or <kbd>Tab</kbd> to a name; works
              on the Best-available tiles and Suggested-pick card too). After a quarter second a
              card pops up with{' '}
            </>
          )}
          three quick reads — <strong>Bye
          week</strong> (flagged when it clashes with players you&rsquo;ve already drafted),{' '}
          <strong>Schedule</strong> (Easy / Average / Tough for that player&rsquo;s position), and{' '}
          <strong>Offense style</strong> (how run- or pass-heavy his team is) — plus a{' '}
          <strong>Last season</strong> row: games played, touches or targets per game, and share of
          team targets. Anything unusual is spelled out in a plain-English note at
          the bottom. Rookies say so.{' '}
          {isMobile ? '' : <>
            <kbd>Esc</kbd> closes it.
          </>}
        </li>
        <li>
          <strong>Name badges:</strong> <strong>⚠</strong> means the player scored far more
          touchdowns than their volume predicts — a regression risk the projection may not price
          in. <strong>⚡</strong> marks a Konami quarterback whose rushing carries a big share of
          his fantasy points, i.e. a high weekly floor.{' '}
          {isMobile ? 'Tap the row' : 'Hover the name'} for the numbers behind either badge.
        </li>
        {isMobile ? (
          <MobileGestures />
        ) : (
          <li>
            <strong>Keyboard-only flow:</strong> <kbd>↓</kbd>/<kbd>↑</kbd> move a row cursor,{' '}
            <kbd>Enter</kbd> removes the highlighted player, <kbd>Shift+Enter</kbd> or <kbd>M</kbd>{' '}
            marks them yours, <kbd>W</kbd> stars them, <kbd>Esc</kbd> exits. With no cursor active,{' '}
            <kbd>Enter</kbd> still removes the top search match.
          </li>
        )}
        <li>
          <strong>Misclicked?</strong> Every removal shows {isMobile ? 'an 8' : 'a 5'}-second{' '}
          <strong>Undo</strong> toast at the bottom of the screen
          {isMobile ? ', just above the dock' : ''}.
        </li>
        <li>
          <strong>Light or dark:</strong> the {isMobile ? 'Theme row in the ☰ menu' : '☀/☾ button in the top bar'}{' '}
          switches themes. Until you pick one, the app follows your device&rsquo;s setting
          automatically.
        </li>
        <li>
          <strong>Done with a position?</strong>{' '}
          {isMobile ? (
            <>
              Open the Roster sheet and tap <strong>Hide QB</strong> when it offers, or use Board
              options &rarr; Positions. Restore it any time from the dashed ghost chip in the
              filter rail.
            </>
          ) : (
            <>
              Click the little <strong>×</strong> on a position chip to hide that position entirely
              (the roster panel will suggest this when your slots are full). Restore it any time
              from the &ldquo;hidden&rdquo; chips.
            </>
          )}
        </li>
      </ul>

      <h2>3 · Fixing mistakes</h2>
      <ul>
        <li>
          {isMobile ? (
            <>
              <strong>Removed the wrong player?</strong> Tap the <strong>↩</strong> slot in the
              dock — every hand-removed player, most recent first, with a 44px{' '}
              <strong>↩</strong> to put them back.
            </>
          ) : (
            <>
              <strong>Removed the wrong player?</strong> Open the <strong>Removed</strong> tab —
              every hand-removed player, most recent first, with an <strong>↩ Add back</strong>{' '}
              button.
            </>
          )}
        </li>
        <li>
          <strong>Wrong player on your roster?</strong> In the{' '}
          {isMobile ? 'Roster sheet' : 'My Roster panel'}, <strong>✕</strong>{' '}
          means &ldquo;not my pick&rdquo; (stays off the board) and <strong>↩</strong> puts the
          player back on the board entirely. Players synced from ESPN can&rsquo;t be edited here —
          they really are on your ESPN team.
        </li>
      </ul>

      <h2>Column glossary</h2>
      <ul className="glossary">
        <li><strong>VOR</strong> — value over replacement: projected points above an average starter at the same position. The board&rsquo;s default sort, and the number that matters most.</li>
        <li><strong>Proj Pts</strong> — season projected fantasy points, averaged across ~10 expert sources.</li>
        <li><strong>SD Pts</strong> — how much those sources disagree (standard deviation of projections).</li>
        <li><strong>Floor / Ceiling</strong> — pessimistic and optimistic projections. Floor matters for starters, ceiling for bench upside.</li>
        <li><strong>Tier</strong> — players of similar value grouped together; when a tier is about to run out, that&rsquo;s a reason to act.</li>
        <li><strong>Risk</strong> — how uncertain the projection is (variance across sources and expert disagreement), shown as a percentage — higher means less predictable. PPR only.</li>
        <li><strong>SOS</strong> — strength of schedule for one position, 1&ndash;32 with 1 the easiest: how many fantasy points this team&rsquo;s 2026 opponents allowed to that position last season. Tooltip only.</li>
        <li><strong>Lean</strong> — share of the team&rsquo;s prior-season plays that were passes (or runs, on an RB tooltip), with the league rank. Pass-heavy teams feed WR/TE; run-heavy teams feed RBs.</li>
        <li><strong>⚠ TD regression</strong> — last season&rsquo;s touchdowns ran at least 3 ahead of what the player&rsquo;s volume predicts at league-average scoring rates. Touchdowns are the least repeatable fantasy stat; expect fewer.</li>
        <li><strong>⚡ Konami</strong> — a quarterback who got a quarter or more of his fantasy points from rushing last season, over a real workload (150+ pass attempts plus carries, so backups with two mop-up scrambles do not qualify). The tooltip shows his actual share. Rushing yardage is far steadier week to week than passing, so these QBs have the highest floors.</li>
        <li><strong>ADP Diff</strong> — how far a player&rsquo;s VOR rank differs from where people actually draft them. Positive = potential value pick (PPR only).</li>
        <li><strong>In the hover card only</strong> — the analyst stats live off the table to keep it scannable: position rank (card header), and a &ldquo;Draft market&rdquo; row with raw <strong>ADP</strong> (the pick number he typically goes at), <strong>Expert rank</strong> (consensus), <strong>Auction</strong> (average auction dollars), and <strong>Dropoff</strong> (projected points to the next player at his position — big dropoff means act now).</li>
      </ul>

      <p className="note">
        Scoring (PPR / Half-PPR / Non-PPR) and averaging method (average / robust / weighted)
        toggles are in the {isMobile ? '☰ menu' : 'top bar'}. Projections come from the ffanalytics R package pipeline;
        replace the CSV and rebuild each season to refresh them.
      </p>
    </article>
  );
}

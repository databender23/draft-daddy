import { useMemo } from 'react';
import BestAvailable from './BestAvailable';
import DraftBoard from './DraftBoard';
import FilterBar from './FilterBar';
import RemovedPanel from './RemovedPanel';
import type { RemovedEntry } from './RemovedPanel';
import RosterPanel from './RosterPanel';
import SuggestedPick from './SuggestedPick';
import WatchStrip from './WatchStrip';
import BoardOverlays from './mobile/BoardOverlays';
import MobileStrip from './mobile/MobileStrip';
import type { PosFill } from './mobile/ChipRail';
import { sortLabelFor } from './mobile/SortSheet';
import type { Sheets } from '../hooks/useSheets';
import type { SortKey, SortState } from '../lib/board';
import { matchesSearch, sortPlayers } from '../lib/board';
import type { TeamMap } from '../lib/context';
import { buildRoster } from '../lib/roster';
import type { Suggestion } from '../lib/suggest';
import type {
  BoardView,
  Player,
  Pos,
  PosFilter,
  RosterConfig,
  UnmatchedPick,
} from '../types';

interface Props {
  /* banners */
  loadError: string | null;
  syncError: string | null;
  unmatched: UnmatchedPick[];

  /* filter bar */
  search: string;
  onSearch: (value: string) => void;
  onEnter: () => void;
  view: BoardView;
  onView: (view: BoardView) => void;
  removedCount: number;
  posFilter: PosFilter;
  onPosFilter: (value: PosFilter) => void;
  dismissed: Pos[];
  onDismissPos: (pos: Pos) => void;
  onRestorePos: (pos: Pos) => void;
  showDrafted: boolean;
  onShowDrafted: (value: boolean) => void;
  visibleCount: number;
  draftedCount: number;

  /* main column */
  suggestion: Suggestion | null;
  watching: Player[];
  onFocusPlayer: (player: Player) => void;
  onToggleStar: (player: Player) => void;
  undrafted: Player[];
  livePositions: Pos[];
  loading: boolean;
  removedEntries: RemovedEntry[];
  espnCount: number;
  now: number;
  rows: Player[];
  draftedIds: Set<string>;
  myIds: Set<string>;
  espnIds: Set<string>;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onDraft: (player: Player, mine: boolean) => void;
  onUndo: (player: Player) => void;
  maxVor: number;
  starred: Set<string>;
  cursorId: string | null;

  /* roster panel */
  myPlayers: Player[];
  teamName: string | null;
  rosterConfig: RosterConfig;
  onNotMine: (player: Player) => void;

  /* mobile layer (below 640px) */
  isMobile: boolean;
  sheets: Sheets;
  byId: Map<string, Player>;
  teams: TeamMap;
  byeCounts: Map<number, number>;
  watchOnly: boolean;
  onWatchToggle: () => void;
}

/**
 * Per-position starter fill for the mobile chip rail, from the same
 * `buildRoster()` the roster panel uses. Only dedicated slots count: a FLEX
 * belongs to no single position, so folding it into RB/WR/TE would print a
 * fill state that is not true of either.
 */
function posFill(players: Player[], config: RosterConfig): Partial<Record<Pos, PosFill>> {
  const fill: Partial<Record<Pos, PosFill>> = {};
  for (const slot of buildRoster(players, config).starters) {
    if (slot.accepts.length !== 1) continue;
    const pos = slot.accepts[0];
    const entry = fill[pos] ?? { filled: 0, total: 0 };
    entry.total += 1;
    if (slot.player !== null) entry.filled += 1;
    fill[pos] = entry;
  }
  return fill;
}

/**
 * The draft page itself: sync/load banners, the filter bar and the two-column
 * board + roster layout. Pure composition — every value and callback is a prop,
 * so all draft state stays in App.
 *
 * Below 640px the same props drive a different arrangement: the four always-on
 * components (SuggestedPick, WatchStrip, BestAvailable, RosterPanel) collapse
 * into the suggested strip and the dock's sheets (docs/mobile-design.md §2G,
 * §6), and the desktop banners that were re-homed into sheets stop rendering.
 */
export default function DraftPage({
  loadError,
  syncError,
  unmatched,
  search,
  onSearch,
  onEnter,
  view,
  onView,
  removedCount,
  posFilter,
  onPosFilter,
  dismissed,
  onDismissPos,
  onRestorePos,
  showDrafted,
  onShowDrafted,
  visibleCount,
  draftedCount,
  suggestion,
  watching,
  onFocusPlayer,
  onToggleStar,
  undrafted,
  livePositions,
  loading,
  removedEntries,
  espnCount,
  now,
  rows,
  draftedIds,
  myIds,
  espnIds,
  sort,
  onSort,
  onDraft,
  onUndo,
  maxVor,
  starred,
  cursorId,
  myPlayers,
  teamName,
  rosterConfig,
  onNotMine,
  isMobile,
  sheets,
  byId,
  teams,
  byeCounts,
  watchOnly,
  onWatchToggle,
}: Props) {
  const sortLabel = sortLabelFor(sort.key);
  const fill = useMemo(() => posFill(myPlayers, rosterConfig), [myPlayers, rosterConfig]);

  // The overlay searches the WHOLE undrafted pool, not `rows`. `rows` is App's
  // `visible`, which drops anything failing the rail's position filter or the
  // `★` watch-only chip *before* matchesSearch runs — and the overlay is a
  // full-screen surface pinned over the rail, so that filter is invisible at
  // the moment it would bite ("No players match" for a player who is on the
  // board). §4 calls this the fastest manual-removal path in the app; it may
  // not depend on rail state the user cannot see. `undrafted` also guarantees
  // the confirm bar's `results[0]` is never someone already off the board,
  // which `rows` does not when `showDrafted` is on.
  const searchResults = useMemo(() => {
    const query = search.trim();
    return sortPlayers(
      undrafted.filter((player) => matchesSearch(player, query)),
      sort,
    );
  }, [undrafted, search, sort]);

  return (
    <>
      {loadError && <div className="banner bad">{loadError}</div>}
      {/* Both of these are re-homed into the Sync sheet on mobile (§6): a
          full-width warn banner can be taller than the visible list on a
          phone. The load-error banner above stays inline — losing the
          projections is not something a sheet should bury. */}
      {!isMobile && syncError && <div className="banner bad">ESPN sync: {syncError}</div>}
      {!isMobile && unmatched.length > 0 && (
        <div className="banner warn">
          <strong>{unmatched.length} ESPN picks did not match the projections</strong>
          <span className="banner-list">
            {unmatched.map((pick) => `${pick.name} (${pick.pos}${pick.team ? ` · ${pick.team}` : ''})`).join(', ')}
          </span>
          <span className="banner-note">Mark these drafted by hand.</span>
        </div>
      )}

      <FilterBar
        search={search}
        onSearch={onSearch}
        onEnter={onEnter}
        view={view}
        onView={onView}
        removedCount={removedCount}
        posFilter={posFilter}
        onPosFilter={onPosFilter}
        dismissed={dismissed}
        onDismiss={onDismissPos}
        onRestore={onRestorePos}
        showDrafted={showDrafted}
        onShowDrafted={onShowDrafted}
        visibleCount={visibleCount}
        draftedCount={draftedCount}
        sortLabel={sortLabel}
        fill={fill}
        watchCount={watching.length}
        onOpenOptions={() => sheets.openSheet('options')}
        watchOnly={watchOnly}
        onWatchToggle={onWatchToggle}
      />

      {isMobile && (
        <MobileStrip suggestion={suggestion} onOpen={() => sheets.openSheet('mypick')} />
      )}

      <main className="layout">
        <div className="main-col">
          {!isMobile && (
            <>
              <SuggestedPick suggestion={suggestion} onDraft={onDraft} />
              <WatchStrip players={watching} onFocus={onFocusPlayer} onUnstar={onToggleStar} />
              <BestAvailable players={undrafted} positions={livePositions} onDraft={onDraft} />
            </>
          )}
          {loading ? (
            <p className="empty">Loading projections…</p>
          ) : !isMobile && view === 'removed' ? (
            <RemovedPanel
              entries={removedEntries}
              espnCount={espnCount}
              onRestore={onUndo}
              now={now}
            />
          ) : (
            <DraftBoard
              rows={rows}
              draftedIds={draftedIds}
              myIds={myIds}
              espnIds={espnIds}
              sort={sort}
              onSort={onSort}
              onDraft={onDraft}
              onUndo={onUndo}
              maxVor={maxVor}
              loading={loading}
              starred={starred}
              onToggleStar={onToggleStar}
              cursorId={cursorId}
              showDrafted={showDrafted}
              onOpenPlayer={(player) => sheets.openPlayer(player.id)}
            />
          )}
        </div>
        {!isMobile && (
          <RosterPanel
            players={myPlayers}
            teamName={teamName}
            dismissed={dismissed}
            onDismiss={onDismissPos}
            config={rosterConfig}
            mineIds={myIds}
            onNotMine={onNotMine}
            onRestore={onUndo}
          />
        )}
      </main>

      {isMobile && (
        <BoardOverlays
          sheets={sheets}
          byId={byId}
          teams={teams}
          byeCounts={byeCounts}
          starred={starred}
          draftedIds={draftedIds}
          myIds={myIds}
          onToggleStar={onToggleStar}
          onDraft={onDraft}
          onUndo={onUndo}
          suggestion={suggestion}
          undrafted={undrafted}
          livePositions={livePositions}
          myPlayers={myPlayers}
          rosterConfig={rosterConfig}
          watching={watching}
          search={search}
          onSearch={onSearch}
          searchResults={searchResults}
          sort={sort}
          onSort={onSort}
          showDrafted={showDrafted}
          onShowDrafted={onShowDrafted}
          dismissed={dismissed}
          onDismissPos={onDismissPos}
          onRestorePos={onRestorePos}
          teamName={teamName}
          onNotMine={onNotMine}
          removedEntries={removedEntries}
          removedCount={removedCount}
          espnCount={espnCount}
          unmatched={unmatched}
          now={now}
        />
      )}
    </>
  );
}

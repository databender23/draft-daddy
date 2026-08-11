import BestAvailable from './BestAvailable';
import DraftBoard from './DraftBoard';
import FilterBar from './FilterBar';
import RemovedPanel from './RemovedPanel';
import type { RemovedEntry } from './RemovedPanel';
import RosterPanel from './RosterPanel';
import SuggestedPick from './SuggestedPick';
import WatchStrip from './WatchStrip';
import type { SortKey, SortState } from '../lib/board';
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
}

/**
 * The draft page itself: sync/load banners, the filter bar and the two-column
 * board + roster layout. Pure composition — every value and callback is a prop,
 * so all draft state stays in App.
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
}: Props) {
  return (
    <>
      {loadError && <div className="banner bad">{loadError}</div>}
      {syncError && <div className="banner bad">ESPN sync: {syncError}</div>}
      {unmatched.length > 0 && (
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
      />

      <main className="layout">
        <div className="main-col">
          <SuggestedPick suggestion={suggestion} onDraft={onDraft} />
          <WatchStrip players={watching} onFocus={onFocusPlayer} onUnstar={onToggleStar} />
          <BestAvailable players={undrafted} positions={livePositions} onDraft={onDraft} />
          {loading ? (
            <p className="empty">Loading projections…</p>
          ) : view === 'removed' ? (
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
            />
          )}
        </div>
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
      </main>
    </>
  );
}

import { useMemo } from 'react';
import type { Sheets } from '../../hooks/useSheets';
import type { SortKey, SortState } from '../../lib/board';
import type { TeamMap } from '../../lib/context';
import { buildRoster, filledPositions } from '../../lib/roster';
import type { Suggestion } from '../../lib/suggest';
import type { Player, Pos, RosterConfig, UnmatchedPick } from '../../types';
import type { RemovedEntry } from '../RemovedPanel';
import BottomDock from './BottomDock';
import MyPickSheet from './MyPickSheet';
import PlayerSheet from './PlayerSheet';
import RemovedSheet from './RemovedSheet';
import RosterSheet from './RosterSheet';
import SearchOverlay from './SearchOverlay';
import SortSheet from './SortSheet';

interface Props {
  sheets: Sheets;
  byId: Map<string, Player>;

  /* player sheet */
  teams: TeamMap;
  byeCounts: Map<number, number>;
  starred: Set<string>;
  draftedIds: Set<string>;
  myIds: Set<string>;
  onToggleStar: (player: Player) => void;
  onDraft: (player: Player, mine: boolean) => void;
  onUndo: (player: Player) => void;

  /* my pick sheet */
  suggestion: Suggestion | null;
  undrafted: Player[];
  livePositions: Pos[];
  myPlayers: Player[];
  rosterConfig: RosterConfig;
  watching: Player[];

  /* search overlay */
  search: string;
  onSearch: (value: string) => void;
  searchResults: Player[];

  /* board options sheet */
  sort: SortState;
  onSort: (key: SortKey) => void;
  showDrafted: boolean;
  onShowDrafted: (value: boolean) => void;
  dismissed: Pos[];
  onDismissPos: (pos: Pos) => void;
  onRestorePos: (pos: Pos) => void;

  /* roster + removed sheets */
  teamName: string | null;
  onNotMine: (player: Player) => void;
  removedEntries: RemovedEntry[];
  /** Unfiltered manual-removal count — the dock badge and the sheet summary
   *  are sanity checks against the real draft, so the rail's position filter
   *  must not shrink them. */
  removedCount: number;
  espnCount: number;
  unmatched: UnmatchedPick[];
  now: number;
}

/**
 * The mobile board's overlay layer: the fixed four-slot dock and every sheet it
 * (or a row tap) opens. Split out of DraftPage purely so both files stay well
 * inside the 500-line repo ceiling — it owns no state beyond the `sheets`
 * machine handed to it.
 *
 * Rendered only below 640px, so none of these components mount on desktop and
 * `useSheets`' history entry can never be pushed there.
 */
export default function BoardOverlays({
  sheets,
  byId,
  teams,
  byeCounts,
  starred,
  draftedIds,
  myIds,
  onToggleStar,
  onDraft,
  onUndo,
  suggestion,
  undrafted,
  livePositions,
  myPlayers,
  rosterConfig,
  watching,
  search,
  onSearch,
  searchResults,
  sort,
  onSort,
  showDrafted,
  onShowDrafted,
  dismissed,
  onDismissPos,
  onRestorePos,
  teamName,
  onNotMine,
  removedEntries,
  removedCount,
  espnCount,
  unmatched,
  now,
}: Props) {
  const roster = useMemo(
    () => buildRoster(myPlayers, rosterConfig),
    [myPlayers, rosterConfig],
  );
  const rosterFilled = roster.starters.filter((slot) => slot.player !== null).length;
  const filledPos = useMemo(() => filledPositions(roster), [roster]);

  const active = sheets.sheet === 'player' && sheets.playerId !== null
    ? byId.get(sheets.playerId) ?? null
    : null;

  return (
    <>
      <BottomDock
        rosterFilled={rosterFilled}
        rosterTotal={roster.starters.length}
        removedCount={removedCount}
        onRoster={() => sheets.openSheet('roster')}
        onMyPick={() => sheets.openSheet('mypick')}
        onRemoved={() => sheets.openSheet('removed')}
        onSearch={() => sheets.openSheet('search')}
      />

      <PlayerSheet
        player={active}
        teams={teams}
        byeCounts={byeCounts}
        starred={active !== null && starred.has(active.id)}
        drafted={active !== null && draftedIds.has(active.id)}
        mine={active !== null && myIds.has(active.id)}
        onToggleStar={onToggleStar}
        onDraft={onDraft}
        onUndo={onUndo}
        onClose={sheets.close}
      />

      <MyPickSheet
        open={sheets.sheet === 'mypick'}
        suggestion={suggestion}
        undrafted={undrafted}
        livePositions={livePositions}
        myPlayers={myPlayers}
        rosterConfig={rosterConfig}
        watching={watching}
        onDraft={onDraft}
        onOpenPlayer={(player) => sheets.openPlayer(player.id)}
        onClose={sheets.close}
      />

      <SearchOverlay
        open={sheets.sheet === 'search'}
        search={search}
        onSearch={onSearch}
        results={searchResults}
        onDraft={onDraft}
        onClose={sheets.close}
      />

      <SortSheet
        open={sheets.sheet === 'options'}
        sort={sort}
        onSort={onSort}
        showDrafted={showDrafted}
        onShowDrafted={onShowDrafted}
        dismissed={dismissed}
        onDismissPos={onDismissPos}
        onRestorePos={onRestorePos}
        filledPos={filledPos}
        onClose={sheets.close}
      />

      <RosterSheet
        open={sheets.sheet === 'roster'}
        players={myPlayers}
        teamName={teamName}
        dismissed={dismissed}
        onDismiss={onDismissPos}
        config={rosterConfig}
        mineIds={myIds}
        onNotMine={onNotMine}
        onRestore={onUndo}
        onClose={sheets.close}
      />

      <RemovedSheet
        open={sheets.sheet === 'removed'}
        entries={removedEntries}
        handCount={removedCount}
        espnCount={espnCount}
        totalCount={draftedIds.size}
        unmatched={unmatched}
        now={now}
        onRestore={onUndo}
        onClose={sheets.close}
      />
    </>
  );
}

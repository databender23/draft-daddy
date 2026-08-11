import type { Pos, PosFilter } from '../../types';
import { POSITIONS } from '../../types';

export interface PosFill {
  filled: number;
  total: number;
}

interface Props {
  sortLabel: string;
  onOpenOptions: () => void;
  posFilter: PosFilter;
  onPosFilter: (value: PosFilter) => void;
  fill: Partial<Record<Pos, PosFill>>;
  dismissed: Pos[];
  onRestorePos: (pos: Pos) => void;
  watchCount: number;
  watchOnly: boolean;
  onWatchToggle: () => void;
  availableCount: number;
}

/**
 * Progressive fill state (FINAL DECISION 4): bare `RB` until a starter slot
 * fills, then `RB 1/2`, then `RB ✓` once full. Quiet early, informative late —
 * this is RosterPanel's highest-value output reprinted at zero pixel cost.
 */
function chipLabel(pos: Pos, fill: PosFill | undefined): string {
  if (!fill || fill.total === 0 || fill.filled === 0) return pos;
  if (fill.filled >= fill.total) return `${pos} ✓`;
  return `${pos} ${fill.filled}/${fill.total}`;
}

/**
 * The mobile filter bar (docs/mobile-design.md §3②): one horizontally
 * scrolling 44px band replacing the desktop FilterBar.
 *
 * `.chip-wrap` / `.chip-x` deliberately do NOT render here — a ~14px
 * destructive target welded to a filter chip silently deletes a position from
 * the board. Hiding a position moved to the Board options sheet and the Roster
 * sheet's `Hide K` button.
 */
export default function ChipRail({
  sortLabel,
  onOpenOptions,
  posFilter,
  onPosFilter,
  fill,
  dismissed,
  onRestorePos,
  watchCount,
  watchOnly,
  onWatchToggle,
  availableCount,
}: Props) {
  const active = POSITIONS.filter((pos) => !dismissed.includes(pos));

  return (
    <div className="chiprail" role="group" aria-label="Board filters">
      <button type="button" className="chiprail-sort" onClick={onOpenOptions}>
        Sort: {sortLabel} ▾
      </button>

      <button
        type="button"
        className={posFilter === 'ALL' ? 'chip on' : 'chip'}
        onClick={() => onPosFilter('ALL')}
      >
        ALL {availableCount}
      </button>

      {active.map((pos) => {
        const posFill = fill[pos];
        const full = posFill !== undefined && posFill.total > 0 && posFill.filled >= posFill.total;
        return (
          <button
            key={pos}
            type="button"
            className={`chip pos-${pos}${posFilter === pos ? ' on' : ''}${full ? ' filled' : ''}`}
            onClick={() => onPosFilter(posFilter === pos ? 'ALL' : pos)}
          >
            {chipLabel(pos, posFill)}
          </button>
        );
      })}

      {(watchCount > 0 || watchOnly) && (
        <button
          type="button"
          className={watchOnly ? 'chip watch on' : 'chip watch'}
          aria-pressed={watchOnly}
          onClick={onWatchToggle}
        >
          ★ {watchCount}
        </button>
      )}

      {dismissed.map((pos) => (
        <button
          key={pos}
          type="button"
          className="chip ghost"
          aria-label={`Restore ${pos}`}
          onClick={() => onRestorePos(pos)}
        >
          {pos} +
        </button>
      ))}

      <button
        type="button"
        className="chiprail-more"
        aria-label="Board options"
        onClick={onOpenOptions}
      >
        ⋯
      </button>
    </div>
  );
}

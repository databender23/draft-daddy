import type { Pos } from '../../types';
import { POSITIONS } from '../../types';
import type { SortKey, SortState } from '../../lib/board';
import { COLUMNS } from '../../lib/board';
import Sheet from './Sheet';

/**
 * Sort keys the desktop `<thead>` exposes, plus the three the board deliberately
 * keeps out of its columns (docs/mobile-design.md §6 "Column disposition"):
 * Rank / Pos Rank / ADP live in the hover card on desktop, but the mobile row
 * has no header to sort from, so this sheet is their only home.
 */
const EXTRA_SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'Rank' },
  { key: 'pos_rank', label: 'Pos Rank' },
  { key: 'adp', label: 'ADP' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  ...COLUMNS.map((column) => ({ key: column.key, label: column.label })),
  ...EXTRA_SORTS,
];

/** Label for any sortable key, including the three that are not `COLUMNS`. */
export function sortLabelFor(key: SortKey): string {
  return SORT_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

interface Props {
  open: boolean;
  sort: SortState;
  onSort: (key: SortKey) => void;
  showDrafted: boolean;
  onShowDrafted: (value: boolean) => void;
  dismissed: Pos[];
  onDismissPos: (pos: Pos) => void;
  onRestorePos: (pos: Pos) => void;
  filledPos: Pos[];
  onClose: () => void;
}

/**
 * Board options sheet (docs/mobile-design.md §4), opened from the chip rail's
 * `Sort: VOR ▾` pill or its `⋯` button.
 *
 * Sorting reuses `handleSort` semantics verbatim — one code path with the
 * desktop header: a new key adopts `defaultDirFor(key)`, the active key flips.
 * Picking a NEW key closes the sheet (you are done); flipping the ACTIVE key
 * keeps it open, because direction is a thing you compare, and re-opening the
 * sheet to undo a flip would cost two taps under the pick clock.
 *
 * `.chip-x` does not render on mobile, so this sheet plus the Roster sheet's
 * `Hide K` are the only ways to hide or restore a position.
 */
export default function SortSheet({
  open,
  sort,
  onSort,
  showDrafted,
  onShowDrafted,
  dismissed,
  onDismissPos,
  onRestorePos,
  filledPos,
  onClose,
}: Props) {
  // Positions whose starter slots are all full AND that are still on the board.
  const hideable = filledPos.filter((pos) => !dismissed.includes(pos));

  function selectSort(key: SortKey) {
    onSort(key);
    if (key !== sort.key) onClose();
  }

  function togglePos(pos: Pos, visible: boolean) {
    if (visible) onRestorePos(pos);
    else onDismissPos(pos);
  }

  return (
    <Sheet open={open} title="Board options" onClose={onClose}>
      <div className="sortsheet-group" role="radiogroup" aria-label="Sort by">
        <p className="sortsheet-label">Sort by</p>
        {SORT_OPTIONS.map((option) => {
          const active = option.key === sort.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? 'sortsheet-row on' : 'sortsheet-row'}
              onClick={() => selectSort(option.key)}
            >
              <span className="sortsheet-name">{option.label}</span>
              {active && (
                <span className="sortsheet-dir">
                  {sort.dir === 'asc' ? '▲' : '▼'}
                  <span className="sortsheet-dirtext">
                    {sort.dir === 'asc' ? 'Low to high' : 'High to low'}
                  </span>
                </span>
              )}
            </button>
          );
        })}
        <p className="sortsheet-hint">Tap the active key again to flip direction.</p>
      </div>

      <div className="sortsheet-group">
        <p className="sortsheet-label">Board</p>
        <label className="sortsheet-switch">
          <span className="sortsheet-name">Show drafted</span>
          <input
            type="checkbox"
            checked={showDrafted}
            onChange={(event) => onShowDrafted(event.target.checked)}
          />
        </label>
      </div>

      <div className="sortsheet-group">
        <p className="sortsheet-label">Positions</p>
        {POSITIONS.map((pos) => {
          const visible = !dismissed.includes(pos);
          return (
            <label key={pos} className="sortsheet-switch">
              <span className="sortsheet-name">
                <span className={`badge pos-${pos}`}>{pos}</span>
                {visible ? 'On the board' : 'Hidden'}
              </span>
              <input
                type="checkbox"
                checked={visible}
                onChange={(event) => togglePos(pos, event.target.checked)}
              />
            </label>
          );
        })}
        {hideable.length > 0 && (
          <button
            type="button"
            className="sortsheet-row sortsheet-action"
            onClick={() => hideable.forEach(onDismissPos)}
          >
            <span className="sortsheet-name">Hide filled positions</span>
            <span className="sortsheet-meta">{hideable.join(', ')}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

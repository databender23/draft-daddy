import type { KeyboardEvent } from 'react';
import type { BoardView, Pos, PosFilter } from '../types';
import { POSITIONS } from '../types';

interface Props {
  search: string;
  onSearch: (value: string) => void;
  onEnter: () => void;
  view: BoardView;
  onView: (view: BoardView) => void;
  removedCount: number;
  posFilter: PosFilter;
  onPosFilter: (value: PosFilter) => void;
  dismissed: Pos[];
  onDismiss: (pos: Pos) => void;
  onRestore: (pos: Pos) => void;
  showDrafted: boolean;
  onShowDrafted: (value: boolean) => void;
  visibleCount: number;
  draftedCount: number;
}

export default function FilterBar({
  search,
  onSearch,
  onEnter,
  view,
  onView,
  removedCount,
  posFilter,
  onPosFilter,
  dismissed,
  onDismiss,
  onRestore,
  showDrafted,
  onShowDrafted,
  visibleCount,
  draftedCount,
}: Props) {
  const active = POSITIONS.filter((pos) => !dismissed.includes(pos));

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!search.trim()) return;
    onEnter();
  }

  return (
    <div className="filterbar">
      <div className="view-tabs" role="tablist" aria-label="Board view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'board'}
          className={view === 'board' ? 'view-tab on' : 'view-tab'}
          onClick={() => onView('board')}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'removed'}
          className={view === 'removed' ? 'view-tab on' : 'view-tab'}
          onClick={() => onView('removed')}
        >
          Removed{removedCount > 0 ? ` (${removedCount})` : ''}
        </button>
      </div>

      <input
        className="search"
        type="search"
        value={search}
        placeholder={
          view === 'removed'
            ? 'Search removed players…'
            : 'Search player, team… (Enter drafts the top result)'
        }
        aria-label="Search players"
        autoFocus
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={handleKey}
      />

      <div className="chips" role="group" aria-label="Position filter">
        <button
          type="button"
          className={posFilter === 'ALL' ? 'chip on' : 'chip'}
          onClick={() => onPosFilter('ALL')}
        >
          ALL
        </button>
        {active.map((pos) => (
          <span key={pos} className={posFilter === pos ? 'chip-wrap on' : 'chip-wrap'}>
            <button
              type="button"
              className={`chip pos-${pos} ${posFilter === pos ? 'on' : ''}`}
              onClick={() => onPosFilter(posFilter === pos ? 'ALL' : pos)}
            >
              {pos}
            </button>
            <button
              type="button"
              className="chip-x"
              title={`Hide ${pos} from the board`}
              aria-label={`Hide ${pos}`}
              onClick={() => onDismiss(pos)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {dismissed.length > 0 && (
        <div className="chips dismissed" aria-label="Hidden positions">
          <span className="chips-label">hidden</span>
          {dismissed.map((pos) => (
            <button
              key={pos}
              type="button"
              className="chip ghost"
              title={`Restore ${pos}`}
              onClick={() => onRestore(pos)}
            >
              {pos} +
            </button>
          ))}
        </div>
      )}

      {view === 'board' && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={showDrafted}
            onChange={(e) => onShowDrafted(e.target.checked)}
          />
          <span>Show drafted</span>
        </label>
      )}

      <span className="counts">
        {visibleCount} available · {draftedCount} drafted
      </span>
    </div>
  );
}

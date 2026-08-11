interface Props {
  rosterFilled: number;
  rosterTotal: number;
  removedCount: number;
  onRoster: () => void;
  onMyPick: () => void;
  onRemoved: () => void;
  onSearch: () => void;
}

/**
 * The fixed thumb-zone dock (docs/mobile-design.md §3⑤).
 *
 * FOUR slots, not five (FINAL DECISION 9): the Board slot is cut, because its
 * only jobs — scroll-to-top and clearing the position filter — already belong
 * to the app bar's brand block and the ALL chip. Four ~97px targets beat five
 * 78px ones on a 390px screen.
 *
 * Ordering is deliberate: consequential actions live right, matching the row
 * where ✕ is also right-edge. These are sheet openers, never navigation — the
 * board stays underneath so a pick that lands while a sheet is open is one
 * downward flick away.
 */
export default function BottomDock({
  rosterFilled,
  rosterTotal,
  removedCount,
  onRoster,
  onMyPick,
  onRemoved,
  onSearch,
}: Props) {
  return (
    <nav className="dock" aria-label="Draft actions">
      <button type="button" className="dock-btn" onClick={onRoster}>
        <span className="dock-ico" aria-hidden="true">
          ▦
        </span>
        <span className="dock-label">
          Roster {rosterFilled}/{rosterTotal}
        </span>
      </button>

      <button type="button" className="dock-btn dock-primary" onClick={onMyPick}>
        <span className="dock-ico" aria-hidden="true">
          ⬤
        </span>
        <span className="dock-label">MY PICK</span>
      </button>

      <button type="button" className="dock-btn" onClick={onRemoved} aria-label="Removed players">
        <span className="dock-ico" aria-hidden="true">
          ↩
        </span>
        <span className="dock-label">{removedCount}</span>
      </button>

      <button type="button" className="dock-btn" onClick={onSearch}>
        <span className="dock-ico" aria-hidden="true">
          🔎
        </span>
        <span className="dock-label">Search</span>
      </button>
    </nav>
  );
}

interface Props {
  statusText: string;
  statusTone: string;
  pickCount: number | null;
  availableCount: number;
  onOpenSync: () => void;
  onOpenMenu: () => void;
  onScrollTop: () => void;
}

/**
 * The 48px sticky app bar (docs/mobile-design.md §3①).
 *
 * Only `logo-icon.png` survives from the desktop lockup — it is theme-neutral,
 * so there is no per-theme swap. The brand block doubles as scroll-to-top
 * because the dock has no Board slot (FINAL DECISION 9). The status block
 * absorbs FilterBar's `.counts`: those numbers exist to sanity-check sync
 * against the real draft, so they belong next to sync, not next to filters.
 */
export default function MobileAppBar({
  statusText,
  statusTone,
  pickCount,
  availableCount,
  onOpenSync,
  onOpenMenu,
  onScrollTop,
}: Props) {
  return (
    <header className="mbar">
      <button type="button" className="mbar-brand" onClick={onScrollTop} aria-label="Scroll to top">
        <img className="mbar-logo" src="/images/logo-icon.png" alt="" />
        <span className="mbar-name">Draft IQ</span>
      </button>

      <button type="button" className="mbar-status" onClick={onOpenSync} aria-label="Sync status">
        <span className={`status-chip status-${statusTone}`}>
          <span className="dot" aria-hidden="true" />
          {statusText}
          {pickCount !== null ? ` · ${pickCount}` : ''}
        </span>
        <span className="mbar-counts">{availableCount} available</span>
      </button>

      <button type="button" className="mbar-menu" onClick={onOpenMenu} aria-label="Menu">
        ☰
      </button>
    </header>
  );
}

import { useEffect, useState } from 'react';
import Sheet from './Sheet';
import { timeAgo } from '../../lib/format';
import { statusLabel } from '../../lib/status';
import type { DraftStatus, TapStatus, UnmatchedPick } from '../../types';

interface Props {
  open: boolean;
  status: DraftStatus | null;
  tap: TapStatus | null;
  lastSync: number | null;
  syncing: boolean;
  error: string | null;
  live: boolean;
  credsReady: boolean;
  onLive: (value: boolean) => void;
  onSyncNow: () => void;
  unmatched: UnmatchedPick[];
  onClose: () => void;
}

/**
 * The Sync sheet (docs/mobile-design.md §4), opened from the app bar's status
 * block. It is the mobile home for everything TopBar's sync cluster owned: the
 * status chip, the picks/tap/last-sync meta line, the Live toggle, `Sync now`,
 * and the sync error text.
 *
 * It also owns the unmatched-picks list. On desktop those render as a
 * full-width `.banner warn` above the board; on a phone that banner can exceed
 * the visible list, so on mobile it is REPLACED by the rows below (§6,
 * "Unmatched-picks warn banner → demoted"). Nothing is lost: the same names,
 * positions and teams are here, one tap from the status block that also carries
 * the pick count they disagree with.
 */
export default function SyncSheet({
  open,
  status,
  tap,
  lastSync,
  syncing,
  error,
  live,
  credsReady,
  onLive,
  onSyncNow,
  unmatched,
  onClose,
}: Props) {
  // "synced 12s ago" has to keep counting while the sheet sits open, but a
  // ticking interval behind a closed sheet is pure re-render cost.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [open]);

  const label = statusLabel(status, error);

  const footer = (
    <button
      type="button"
      className="btn primary syncsheet-sync"
      onClick={onSyncNow}
      disabled={syncing || !credsReady}
    >
      {syncing ? 'Syncing…' : 'Sync now'}
    </button>
  );

  return (
    <Sheet open={open} title="Sync" onClose={onClose} footer={footer}>
      <div className="syncsheet-status">
        <span className={`status-chip status-${label.tone}`}>
          <span className="dot" aria-hidden="true" />
          {label.text}
        </span>
        <span className="syncsheet-meta">
          {status ? `${status.pick_count} picks` : 'no picks'}
          {tap?.active ? ` · tap ⚡ ${tap.picks}` : ''} · synced {timeAgo(lastSync, now)}
        </span>
      </div>

      {error && <p className="syncsheet-error">{error}</p>}

      <div className="syncsheet-live">
        <label className="toggle syncsheet-toggle">
          <input
            type="checkbox"
            checked={live}
            disabled={!credsReady}
            onChange={(event) => onLive(event.target.checked)}
          />
          <span>Live sync</span>
        </label>
        {!credsReady && (
          <p className="syncsheet-note">
            Add your league ID and credentials in Settings to sync automatically. Until then,
            remove players by hand — that path is always available.
          </p>
        )}
      </div>

      {unmatched.length > 0 && (
        <div className="syncsheet-sec">
          <h3 className="syncsheet-sec-head">
            {unmatched.length} {unmatched.length === 1 ? 'pick' : 'picks'} did not match the
            projections
          </h3>
          <p className="syncsheet-note">Mark these drafted by hand.</p>
          <ul className="syncsheet-list">
            {unmatched.map((pick, index) => (
              <li className="syncsheet-row" key={`${pick.espn_id ?? 'x'}-${pick.name}-${index}`}>
                <span className={`badge pos-${pick.pos}`}>{pick.pos || '—'}</span>
                <span className="syncsheet-name">{pick.name}</span>
                <span className="syncsheet-team">{pick.team}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

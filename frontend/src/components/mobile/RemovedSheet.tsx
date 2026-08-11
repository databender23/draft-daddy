import RemovedPanel from '../RemovedPanel';
import type { RemovedEntry } from '../RemovedPanel';
import type { Player, UnmatchedPick } from '../../types';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  entries: RemovedEntry[];
  /** Every hand-removed player, before the rail's position filter narrows
   *  `entries` — the summary is a sanity check against the real draft. */
  handCount: number;
  espnCount: number;
  unmatched: UnmatchedPick[];
  now: number;
  onRestore: (player: Player) => void;
  onClose: () => void;
}

/**
 * The Removed sheet (docs/mobile-design.md §4): `RemovedPanel` verbatim, with
 * the two additions the spec asks for around it.
 *
 * 1. A summary line — `38 off the board — 26 by hand, 12 from ESPN` — because
 *    the dock's `↩ n` badge is also the sanity check against the real draft.
 * 2. `sync.unmatched` as a COLLAPSIBLE section rather than the desktop
 *    `.banner warn`, which on a phone can be taller than the visible list (§6).
 *
 * The two-line row restack is CSS only (mobile-panels.css), so RemovedPanel is
 * untouched and the desktop Removed tab is unaffected.
 */
export default function RemovedSheet({
  open,
  entries,
  handCount,
  espnCount,
  unmatched,
  now,
  onRestore,
  onClose,
}: Props) {
  return (
    <Sheet open={open} title="Off the board" onClose={onClose}>
      <p className="removedsheet-summary">
        {handCount + espnCount} off the board — {handCount} by hand, {espnCount} from the draft
      </p>

      <RemovedPanel entries={entries} espnCount={espnCount} onRestore={onRestore} now={now} />

      {unmatched.length > 0 && (
        <details className="removedsheet-unmatched">
          <summary>
            {unmatched.length} {unmatched.length === 1 ? 'pick' : 'picks'} did not match the
            projections
          </summary>
          <ul className="syncsheet-list">
            {unmatched.map((pick, index) => (
              <li className="syncsheet-row" key={`${pick.espn_id ?? 'x'}-${pick.name}-${index}`}>
                <span className={`badge pos-${pick.pos}`}>{pick.pos || '—'}</span>
                <span className="syncsheet-name">{pick.name}</span>
                <span className="syncsheet-team">{pick.team}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Sheet>
  );
}

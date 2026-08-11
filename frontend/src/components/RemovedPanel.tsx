import { fmtNum, timeAgo } from '../lib/format';
import type { Player } from '../types';

export interface RemovedEntry {
  player: Player;
  at: number | null;
  isMine: boolean;
}

interface Props {
  entries: RemovedEntry[];
  espnCount: number;
  onRestore: (player: Player) => void;
  now: number;
}

export default function RemovedPanel({ entries, espnCount, onRestore, now }: Props) {
  return (
    <section className="board removed-panel" aria-label="Removed players">
      {entries.length === 0 ? (
        <p className="empty">
          Nothing removed by hand yet. Players you remove from the board show up here, most recent
          first, so a misclick is a one-click fix.
        </p>
      ) : (
        <ul className="removed-list">
          {entries.map(({ player, at, isMine }) => (
            <li key={player.id} className="removed-row">
              <span className="removed-when">{at === null ? '—' : timeAgo(at, now)}</span>
              <span className={`badge pos-${player.pos}`}>{player.pos}</span>
              <span className="removed-name">
                {player.name}
                {isMine && <span className="tag tag-mine">MINE</span>}
              </span>
              <span className="removed-team">{player.team}</span>
              <span className="removed-vor">VOR {fmtNum(player.vor, 1)}</span>
              <button
                type="button"
                className="btn tiny primary"
                onClick={() => onRestore(player)}
                title="Put this player back on the board"
              >
                ↩ Add back
              </button>
            </li>
          ))}
        </ul>
      )}
      {espnCount > 0 && (
        <p className="note removed-note">
          {espnCount} more player{espnCount === 1 ? ' is' : 's are'} off the board from the ESPN
          draft itself — those can&rsquo;t be added back here (they really are drafted).
        </p>
      )}
    </section>
  );
}

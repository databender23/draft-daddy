import { fmtNum } from '../lib/format';
import type { Player } from '../types';

interface Props {
  players: Player[];
  onFocus: (player: Player) => void;
  onUnstar: (player: Player) => void;
}

/** Starred players still on the board, highest VOR first. */
export default function WatchStrip({ players, onFocus, onUnstar }: Props) {
  if (players.length === 0) return null;
  return (
    <div className="watchstrip" aria-label="Watchlist — still available">
      <span className="watchstrip-label">★ watching</span>
      {players.map((player) => (
        <span key={player.id} className="watch-chip">
          <button
            type="button"
            className="watch-chip-main"
            onClick={() => onFocus(player)}
            title={`Jump to ${player.name}`}
          >
            <span className={`badge pos-${player.pos}`}>{player.pos}</span>
            {player.name} · {fmtNum(player.vor, 1)}
          </button>
          <button
            type="button"
            className="chip-x"
            aria-label={`Unstar ${player.name}`}
            title="Remove from watchlist"
            onClick={() => onUnstar(player)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

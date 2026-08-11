import { fmtNum } from '../lib/format';
import type { Player, Pos } from '../types';
import PlayerName from './PlayerName';

interface Props {
  players: Player[];
  positions: Pos[];
  onDraft: (player: Player, mine: boolean) => void;
}

function bestAt(players: Player[], pos: Pos): Player | null {
  let best: Player | null = null;
  for (const player of players) {
    if (player.pos !== pos) continue;
    if (best === null || (player.vor ?? -999) > (best.vor ?? -999)) best = player;
  }
  return best;
}

export default function BestAvailable({ players, positions, onDraft }: Props) {
  return (
    <section className="best" aria-label="Best available by position">
      {positions.map((pos) => {
        const player = bestAt(players, pos);
        return (
          <div key={pos} className="tile">
            <div className="tile-head">
              <span className={`badge pos-${pos}`}>{pos}</span>
              {player && (
                <button
                  type="button"
                  className="btn tiny"
                  onClick={(e) => onDraft(player, e.altKey || e.metaKey || e.shiftKey)}
                  title="Remove from board — drafted by another team (hold Alt/Cmd/Shift if it was your pick)"
                >
                  ✕ Remove
                </button>
              )}
            </div>
            {player ? (
              <>
                <div className="tile-name">
                  <PlayerName player={player} />
                </div>
                <div className="tile-vor">{fmtNum(player.vor, 1)}</div>
                <div className="tile-meta">
                  <span>floor {fmtNum(player.floor, 0)}</span>
                  <span>ceil {fmtNum(player.ceiling, 0)}</span>
                </div>
              </>
            ) : (
              <div className="tile-empty">none left</div>
            )}
          </div>
        );
      })}
    </section>
  );
}

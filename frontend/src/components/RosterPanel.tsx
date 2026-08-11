import { fmtNum } from '../lib/format';
import { buildRoster, filledPositions } from '../lib/roster';
import type { Player, Pos, RosterConfig } from '../types';

interface Props {
  players: Player[];
  teamName: string | null;
  dismissed: Pos[];
  onDismiss: (pos: Pos) => void;
  config: RosterConfig;
  mineIds: Set<string>;
  onNotMine: (player: Player) => void;
  onRestore: (player: Player) => void;
}

export default function RosterPanel({
  players,
  teamName,
  dismissed,
  onDismiss,
  config,
  mineIds,
  onNotMine,
  onRestore,
}: Props) {
  const roster = buildRoster(players, config);
  const suggestions = filledPositions(roster).filter((pos) => !dismissed.includes(pos));

  function corrections(player: Player) {
    if (!mineIds.has(player.id)) return null;
    return (
      <span className="slot-actions">
        <button
          type="button"
          className="btn icon"
          title="Not my pick — someone else drafted them (stays removed from the board)"
          aria-label={`${player.name}: not my pick`}
          onClick={() => onNotMine(player)}
        >
          ✕
        </button>
        <button
          type="button"
          className="btn icon"
          title="Mistake — put this player back on the board"
          aria-label={`${player.name}: back on the board`}
          onClick={() => onRestore(player)}
        >
          ↩
        </button>
      </span>
    );
  }

  return (
    <aside className="roster" aria-label="My roster">
      <div className="panel-head">
        <h2>My Roster</h2>
        <span className="panel-sub">{teamName ?? 'no team selected'}</span>
      </div>

      {suggestions.length > 0 && (
        <div className="suggest">
          <span>{suggestions.join(', ')} slots are full.</span>
          <span className="suggest-actions">
            {suggestions.map((pos) => (
              <button key={pos} type="button" className="btn tiny" onClick={() => onDismiss(pos)}>
                Hide {pos}
              </button>
            ))}
          </span>
        </div>
      )}

      <ul className="slots">
        {roster.starters.map((slot, index) => (
          <li key={`${slot.label}-${index}`} className={slot.player ? 'slot filled' : 'slot'}>
            <span className="slot-label">{slot.label}</span>
            {slot.player ? (
              <>
                <span className="slot-name">{slot.player.name}</span>
                <span className="slot-vor">{fmtNum(slot.player.vor, 1)}</span>
                {corrections(slot.player)}
              </>
            ) : (
              <span className="slot-empty">open</span>
            )}
          </li>
        ))}
      </ul>

      {(roster.bench.length > 0 || config.bench > 0) && (
        <>
          <div className="panel-head sub">
            <h3>
              Bench{' '}
              <span className="panel-sub">
                {roster.bench.length}/{config.bench}
              </span>
            </h3>
          </div>
          <ul className="slots">
            {roster.bench.map((player: Player) => (
              <li key={player.id} className="slot filled">
                <span className={`badge pos-${player.pos}`}>{player.pos}</span>
                <span className="slot-name">{player.name}</span>
                <span className="slot-vor">{fmtNum(player.vor, 1)}</span>
                {corrections(player)}
              </li>
            ))}
          </ul>
        </>
      )}

      {players.length === 0 && (
        <p className="panel-empty">
          Mark picks as yours with the “Mine” button (or Alt/Cmd-click Draft). ESPN picks for your
          team land here automatically once synced.
        </p>
      )}
    </aside>
  );
}

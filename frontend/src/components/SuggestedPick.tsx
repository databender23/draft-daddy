import { fmtNum } from '../lib/format';
import type { Suggestion } from '../lib/suggest';
import type { Player } from '../types';
import PlayerName, { PlayerBadges } from './PlayerName';

interface Props {
  suggestion: Suggestion | null;
  onDraft: (player: Player, mine: boolean) => void;
}

export default function SuggestedPick({ suggestion, onDraft }: Props) {
  if (!suggestion) return null;
  const { player, slotLabel, forStarter } = suggestion;
  return (
    <div className="suggested" role="note" aria-label="Suggested pick">
      <div className="suggested-label">Suggested pick</div>
      <div className="suggested-body">
        <span className={`badge pos-${player.pos}`}>{player.pos}</span>
        <PlayerName player={player} className="suggested-name" />
        <PlayerBadges player={player} />
        <span className="suggested-reason">
          {forStarter
            ? `fills your ${slotLabel} slot · floor-weighted`
            : 'bench upside · ceiling-weighted'}
        </span>
        <span className="suggested-stats">
          VOR {fmtNum(player.vor, 1)} · floor {fmtNum(player.floor, 0)} · ceil{' '}
          {fmtNum(player.ceiling, 0)}
        </span>
      </div>
      <div className="suggested-actions">
        <button
          type="button"
          className="btn tiny primary"
          onClick={() => onDraft(player, true)}
          title="Draft to my roster"
        >
          Mine
        </button>
        <button
          type="button"
          className="btn tiny"
          onClick={() => onDraft(player, false)}
          title="Someone else took them — remove from board"
        >
          ✕ Remove
        </button>
      </div>
    </div>
  );
}

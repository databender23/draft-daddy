import { fmtNum } from '../../lib/format';
import type { Suggestion } from '../../lib/suggest';

interface Props {
  suggestion: Suggestion | null;
  hidden: boolean;
  onOpen: () => void;
}

/**
 * The 44px suggested strip (docs/mobile-design.md §3③). It earns permanent
 * pixels — rather than being folded into the dock — because `suggestPick()` is
 * roster-aware and floor-weighted, so it routinely disagrees with row 1, and
 * that disagreement is worthless if you have to tap to discover it.
 *
 * `hidden` comes from `useScrollDirection`: down past 80px translates it out of
 * view, any upward scroll brings it back. Degrades to always-visible if the
 * hook misbehaves — nothing about the layout depends on it collapsing.
 */
export default function SuggestedStrip({ suggestion, hidden, onOpen }: Props) {
  if (!suggestion) return null;
  const player = suggestion.player;

  return (
    <button
      type="button"
      className={hidden ? 'sugstrip hidden' : 'sugstrip'}
      onClick={onOpen}
      aria-label={`Next pick suggestion: ${player.name}. Open My Pick.`}
    >
      <span className="sugstrip-tag">NEXT</span>
      <span className={`badge pos-${player.pos}`}>{player.pos}</span>
      <span className="sugstrip-name">{player.name}</span>
      <span className="sugstrip-vor">{fmtNum(player.vor, 1)}</span>
    </button>
  );
}

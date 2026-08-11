import type { FocusEvent, MouseEvent } from 'react';
import { useTooltip } from './TooltipProvider';
import type { Player } from '../types';

interface Props {
  player: Player;
  /** Anchor class; keeps existing board/tile/card typography. */
  className?: string;
}

/**
 * Player name that opens the shared context tooltip on hover (after a delay)
 * and immediately on keyboard focus. Board rows are also hover anchors; this
 * remains the keyboard path and the anchor for tiles and the suggested pick.
 */
export default function PlayerName({ player, className = 'player-name' }: Props) {
  const tip = useTooltip();

  function handleEnter(event: MouseEvent<HTMLSpanElement>) {
    tip.show(player, event.currentTarget.getBoundingClientRect(), event.clientX);
  }

  function handleFocus(event: FocusEvent<HTMLSpanElement>) {
    tip.show(player, event.currentTarget.getBoundingClientRect(), undefined, true);
  }

  return (
    <span
      className={className}
      tabIndex={0}
      aria-describedby="player-tooltip"
      onMouseEnter={handleEnter}
      onMouseLeave={tip.hide}
      onFocus={handleFocus}
      onBlur={tip.hide}
    >
      {player.name}
    </span>
  );
}

/** ⚠ TD-regression and ⚡ Konami markers, shown inline after the name. */
export function PlayerBadges({ player }: { player: Player }) {
  const last = player.last_season ?? null;
  if (!last) return null;
  return (
    <>
      {last.td_regression && (
        <span className="pbadge warn" title="TD regression risk">
          ⚠
        </span>
      )}
      {last.konami && (
        <span className="pbadge konami" title="Konami: rushing floor">
          ⚡
        </span>
      )}
    </>
  );
}

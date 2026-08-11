import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { fmtNum, fmtSigned, tierClass } from '../../lib/format';
import type { Player } from '../../types';
import { PlayerBadges } from '../PlayerName';

/** Travel before the gesture may lock to horizontal. */
const LOCK_TRAVEL = 10;
/** Dead zone for the iOS back-swipe, measured from the left screen edge. */
const EDGE_GUARD = 20;
/** Fraction of row width that commits MINE. */
const COMMIT = 0.3;
/** |adp_diff| below this is noise, not a signal. */
const ADP_PILL_AT = 5;

interface Props {
  player: Player;
  drafted: boolean;
  mine: boolean;
  espn: boolean;
  starred: boolean;
  maxVor: number;
  showDrafted: boolean;
  onRemove: (player: Player) => void;
  onMine: (player: Player) => void;
  onUndo: (player: Player) => void;
  onOpen: (player: Player) => void;
}

function vorWidth(vor: number | null, maxVor: number): string {
  if (vor === null || vor <= 0 || maxVor <= 0) return '0%';
  return `${Math.min(100, (vor / maxVor) * 100).toFixed(1)}%`;
}

/**
 * The 64px mobile row (docs/mobile-design.md §3④). One tap target for the
 * ~176×/draft action (✕ Remove, explicit `mine=false`), the whole rest of the
 * row opens the Player sheet.
 *
 * Swipe RIGHT past ~30% marks the player MINE — the design's ONLY gesture
 * (FINAL DECISION 1). Arbitration rules, all mandatory: `touch-action: pan-y`
 * (mobile.css) so vertical scroll always wins; lock to horizontal only after
 * 10px of travel at >2:1 dx:dy; ignore touches that start in the iOS
 * back-swipe zone; abortable by releasing before the threshold. It is an
 * accelerator only — the Player sheet footer and My Pick sheet are the
 * guaranteed routes, so it can be deleted at zero capability loss.
 */
export default function BoardRow({
  player,
  drafted,
  mine,
  espn,
  starred,
  maxVor,
  showDrafted,
  onRemove,
  onMine,
  onUndo,
  onOpen,
}: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; width: number } | null>(null);
  const locked = useRef(false);
  /** Suppresses the row's click when the pointer was actually a swipe. */
  const swiped = useRef(false);

  const undoMode = drafted && showDrafted;

  function reset() {
    start.current = null;
    locked.current = false;
    setDx(0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    swiped.current = false;
    if (drafted || event.pointerType === 'mouse') return;
    if (event.clientX < EDGE_GUARD) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    locked.current = false;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const from = start.current;
    if (!from || event.pointerId !== from.id) return;
    const moveX = event.clientX - from.x;
    const moveY = event.clientY - from.y;

    if (!locked.current) {
      if (Math.max(Math.abs(moveX), Math.abs(moveY)) < LOCK_TRAVEL) return;
      // Rightward AND better than 2:1 against the vertical, or the browser keeps
      // the scroll. A leftward drag can never satisfy this — by design.
      if (moveX <= 2 * Math.abs(moveY)) {
        start.current = null;
        return;
      }
      locked.current = true;
      swiped.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDx(Math.max(0, moveX));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const from = start.current;
    // Measure travel from the event, not the `dx` state: on a fast flick the
    // threshold-crossing move can be dispatched in the same task as pointerup,
    // and the state read here would still hold the pre-flick value.
    const travel = from === null ? 0 : event.clientX - from.x;
    const committed = from !== null && locked.current && travel >= from.width * COMMIT;
    reset();
    if (committed) onMine(player);
  }

  /**
   * `pointercancel` means the browser INVALIDATED the sequence — a second
   * finger landed, a system gesture took over, or the scroll was reclaimed
   * mid-drag. That is the strongest possible abort signal, so it must reset
   * without committing even when travel is already past the threshold;
   * routing it through `onPointerUp` would draft a player out of a gesture the
   * user experienced as a scroll (FINAL DECISION 1: abortable).
   */
  function onPointerCancel() {
    reset();
  }

  const posRank = player.pos_rank === null ? null : `${player.pos}${Math.round(player.pos_rank)}`;
  const adpDiff = player.adp_diff;
  const showAdp = adpDiff !== null && Math.abs(adpDiff) >= ADP_PILL_AT;

  return (
    <div className={dx > 0 ? 'mrow-wrap swiping' : 'mrow-wrap'}>
      <div className="mrow-under" aria-hidden="true">
        <span className="mrow-under-label">MINE</span>
      </div>
      <div
        className={`mrow${drafted ? ' drafted' : ''}${mine ? ' mine' : ''}`}
        style={dx > 0 ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => {
          if (swiped.current) return;
          onOpen(player);
        }}
      >
        <span className={tierClass(player.tier)}>{player.tier ?? '—'}</span>

        <div className="mrow-main">
          <div className="mrow-l1">
            <span className="mrow-name">{player.name}</span>
            {starred && (
              <span className="mrow-star" aria-label="On your watchlist">
                ★
              </span>
            )}
            <PlayerBadges player={player} />
            {mine && <span className="tag tag-mine">MINE</span>}
            {espn && <span className="tag tag-espn">ESPN</span>}
          </div>
          <div className="mrow-l2">
            <span className={`badge pos-${player.pos}`}>{player.pos}</span>
            <span className="mrow-team">{player.team}</span>
            {posRank && <span className="mrow-prank">{posRank}</span>}
            {showAdp && (
              <span className={adpDiff > 0 ? 'mrow-adp good' : 'mrow-adp bad'}>
                {fmtSigned(adpDiff, 0)}
              </span>
            )}
          </div>
        </div>

        <div className="mrow-vor">
          <span className="mrow-vor-num">{fmtNum(player.vor, 1)}</span>
          <span
            className="vor-bar"
            style={{ width: vorWidth(player.vor, maxVor) }}
            aria-hidden="true"
          />
        </div>

        <button
          type="button"
          className="mrow-x"
          aria-label={undoMode ? `Put ${player.name} back on the board` : `Remove ${player.name}`}
          onClick={(event) => {
            event.stopPropagation();
            if (undoMode) onUndo(player);
            else onRemove(player);
          }}
        >
          {undoMode ? '↩' : '✕'}
        </button>
      </div>
    </div>
  );
}

/**
 * The tier break between two rows. Rendered only under the default VOR sort —
 * meaningless under any other ordering (docs/mobile-design.md §3④).
 */
export function TierDivider({ tier }: { tier: number | null }) {
  return (
    <div className="mtier" role="separator">
      <span className="mtier-label">{tier === null ? 'NO TIER' : `TIER ${tier}`}</span>
    </div>
  );
}

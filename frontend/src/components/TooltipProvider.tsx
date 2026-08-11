import type { CSSProperties, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TooltipContent } from '../lib/context';
import { buildTooltip } from '../lib/context';
import type { Player } from '../types';
import type { TeamMap } from '../lib/context';
import PlayerTooltip from './PlayerTooltip';

/** Long enough that skimming the board never flashes cards, short enough to feel instant. */
const OPEN_DELAY = 250;
/**
 * Touch devices have no hover, and `.ptip` is `pointer-events: none` — so a
 * card opened by a tap can never be dismissed by tapping it. The guard has to
 * live here rather than on the row: `PlayerName` calls show() from onFocus,
 * and tapping a row body focuses that span on iOS.
 */
const NO_HOVER = '(hover: none)';
const TIP_WIDTH = 620;
const TIP_EST_HEIGHT = 230;
const GAP = 8;

export interface TooltipApi {
  /** Show the card for a player near `rect` (delayed unless `immediate`). */
  show: (player: Player, rect: DOMRect, pointerX?: number, immediate?: boolean) => void;
  hide: () => void;
}

const NOOP: TooltipApi = { show: () => undefined, hide: () => undefined };
const Ctx = createContext<TooltipApi>(NOOP);

export function useTooltip(): TooltipApi {
  return useContext(Ctx);
}

interface Props {
  teams: TeamMap;
  byeCounts: Map<number, number>;
  children: ReactNode;
}

/**
 * One tooltip for the whole app. Anchors (board rows, tiles, the suggested-pick
 * card, focusable names) call show/hide; the provider owns delay, placement and
 * dismissal so cards never stack, flicker or intercept clicks.
 */
export default function TooltipProvider({ teams, byeCounts, children }: Props) {
  const [open, setOpen] = useState<{ content: TooltipContent; style: CSSProperties } | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(null);
  }, [clearTimer]);

  const show = useCallback(
    (player: Player, rect: DOMRect, pointerX?: number, immediate = false) => {
      if (window.matchMedia(NO_HOVER).matches) return;
      const content = buildTooltip(player, teams[player.team], byeCounts);
      clearTimer();
      if (!content) {
        setOpen(null);
        return;
      }
      const place = () => {
        const anchorX = pointerX ?? rect.left;
        const left = Math.max(8, Math.min(anchorX + 12, window.innerWidth - TIP_WIDTH - 8));
        const spaceBelow = window.innerHeight - rect.bottom;
        const style: CSSProperties =
          spaceBelow < TIP_EST_HEIGHT && rect.top > spaceBelow
            ? { left, bottom: Math.round(window.innerHeight - rect.top + GAP) }
            : { left, top: Math.round(rect.bottom + GAP) };
        setOpen({ content, style });
      };
      if (immediate) place();
      else {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          place();
        }, OPEN_DELAY);
      }
    },
    [teams, byeCounts, clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  // Fixed positioning detaches on scroll/resize, so dismiss instead of chasing.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {open && <PlayerTooltip content={open.content} style={open.style} id="player-tooltip" />}
    </Ctx.Provider>
  );
}

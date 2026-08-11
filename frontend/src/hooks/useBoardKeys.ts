import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import type { Player } from '../types';
import { MOBILE_QUERY } from './useIsMobile';

export interface BoardKeysOptions {
  /** False while a modal is open or the board is not the visible surface. */
  enabled: boolean;
  rows: Player[];
  cursorIdx: number | null;
  setCursorIdx: Dispatch<SetStateAction<number | null>>;
  onDraft: (player: Player, mine: boolean) => void;
  onToggleStar: (player: Player) => void;
}

/**
 * Board keyboard shortcuts: ↓ ↑ move the cursor, Esc clears it, Enter drafts
 * (Shift = my pick), M marks mine, W stars.
 *
 * Desktop only. There is no cursor concept without a keyboard, and the mobile
 * layout drops the cursor outline entirely (docs/mobile-design.md §6), so the
 * handler no-ops below the mobile breakpoint. The listener is still attached —
 * it reads `media.matches` per event — so crossing the breakpoint by resizing a
 * desktop window restores the shortcuts without a remount.
 */
export function useBoardKeys(options: BoardKeysOptions): void {
  // Latest props without re-binding the listener on every App render (the
  // effect previously had no dependency array and re-subscribed constantly).
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);

    function onKey(event: KeyboardEvent) {
      if (media.matches) return;
      const { enabled, rows, cursorIdx, setCursorIdx, onDraft, onToggleStar } = latest.current;
      if (!enabled) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const inSearch = inInput && target?.classList.contains('search');
      // Arrows/Enter/Esc work from the search box; letter keys never steal typing.
      if (inInput && !inSearch) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursorIdx((prev) =>
          rows.length === 0 ? null : prev === null ? 0 : Math.min(prev + 1, rows.length - 1),
        );
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursorIdx((prev) => (prev === null ? null : Math.max(0, prev - 1)));
      } else if (event.key === 'Escape') {
        setCursorIdx(null);
      } else if (event.key === 'Enter' && cursorIdx !== null && rows[cursorIdx]) {
        event.preventDefault();
        onDraft(rows[cursorIdx], event.shiftKey);
      } else if ((event.key === 'm' || event.key === 'M') && !inInput && cursorIdx !== null) {
        if (rows[cursorIdx]) onDraft(rows[cursorIdx], true);
      } else if ((event.key === 'w' || event.key === 'W') && !inInput && cursorIdx !== null) {
        if (rows[cursorIdx]) onToggleStar(rows[cursorIdx]);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

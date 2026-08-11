import { useCallback, useEffect, useRef, useState } from 'react';

export type SheetId =
  | 'player'
  | 'mypick'
  | 'search'
  | 'options'
  | 'menu'
  | 'sync'
  | 'roster'
  | 'removed';

export interface Sheets {
  sheet: SheetId | null;
  playerId: string | null;
  openSheet: (id: SheetId) => void;
  openPlayer: (playerId: string) => void;
  close: () => void;
}

interface State {
  sheet: SheetId | null;
  playerId: string | null;
}

const CLOSED: State = { sheet: null, playerId: null };

/**
 * The mobile overlay state machine: one discriminated `sheet` value, never a
 * bag of booleans (docs/mobile-design.md §8).
 *
 * Hardware Back is one of the three required exits, so opening a sheet pushes
 * exactly ONE history entry and popstate closes. Swapping sheets while one is
 * already open replaces it and does NOT push again — otherwise Back would walk
 * a stack of sheets the user never perceived as separate screens.
 */
export function useSheets(): Sheets {
  const [state, setState] = useState<State>(CLOSED);
  /** True while our single history entry is on the stack. */
  const pushed = useRef(false);

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      setState(CLOSED);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((next: State) => {
    if (!pushed.current) {
      pushed.current = true;
      window.history.pushState({ draftiqSheet: true }, '');
    }
    setState(next);
  }, []);

  const openSheet = useCallback((id: SheetId) => open({ sheet: id, playerId: null }), [open]);

  const openPlayer = useCallback(
    (playerId: string) => open({ sheet: 'player', playerId }),
    [open],
  );

  const close = useCallback(() => {
    setState(CLOSED);
    if (pushed.current) {
      pushed.current = false;
      // Fires popstate, which is a no-op now that state is already closed.
      window.history.back();
    }
  }, []);

  return { sheet: state.sheet, playerId: state.playerId, openSheet, openPlayer, close };
}

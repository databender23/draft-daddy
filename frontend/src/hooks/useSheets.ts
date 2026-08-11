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
  /** Mirrors `state` for the popstate handler, which binds once. */
  const stateRef = useRef<State>(CLOSED);
  /** True between close()'s history.back() and its popstate landing. */
  const popPending = useRef(false);

  useEffect(() => {
    const onPop = () => {
      if (popPending.current) {
        // Our own programmatic back() landing, not the user's Back press.
        popPending.current = false;
        if (stateRef.current.sheet !== null) {
          // A sheet was reopened before the pop landed (close → open in quick
          // succession); restore the entry it expects and keep it open.
          pushed.current = true;
          window.history.pushState({ draftiqSheet: true }, '');
        } else {
          pushed.current = false;
        }
        return;
      }
      pushed.current = false;
      stateRef.current = CLOSED;
      setState(CLOSED);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((next: State) => {
    // While a programmatic pop is in flight the old entry still exists; claim
    // it instead of pushing a second one (onPop re-pushes when it lands).
    if (!pushed.current && !popPending.current) {
      pushed.current = true;
      window.history.pushState({ draftiqSheet: true }, '');
    } else if (popPending.current) {
      pushed.current = true;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const openSheet = useCallback((id: SheetId) => open({ sheet: id, playerId: null }), [open]);

  const openPlayer = useCallback(
    (playerId: string) => open({ sheet: 'player', playerId }),
    [open],
  );

  const close = useCallback(() => {
    stateRef.current = CLOSED;
    setState(CLOSED);
    if (pushed.current) {
      pushed.current = false;
      if (!popPending.current) {
        popPending.current = true;
        // Fires popstate, which onPop recognizes as ours via popPending.
        window.history.back();
      }
      // If a pop is already pending it will consume our entry when it lands.
    }
  }, []);

  return { sheet: state.sheet, playerId: state.playerId, openSheet, openPlayer, close };
}

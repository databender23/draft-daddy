import { useEffect, useRef } from 'react';
import type { Player } from '../types';

export interface ToastState {
  player: Player;
  mine: boolean;
  key: number;
}

interface Props {
  toast: ToastState | null;
  onUndo: (player: Player) => void;
  onDismiss: () => void;
}

const TOAST_MS = 5000;

export default function Toast({ toast, onUndo, onDismiss }: Props) {
  // App passes a fresh `onDismiss` identity every render, so listing it here
  // cleared and restarted the timer on every App render — sync polls, the
  // `now` interval, any state change. The dismissal window was not 5s, it was
  // "5s after App stops re-rendering". Undo is the safety net for a one-tap
  // destructive action, so the window has to be the one we advertise.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => dismissRef.current(), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>
        {toast.mine ? 'Drafted to your roster:' : 'Removed:'} <strong>{toast.player.name}</strong>
      </span>
      <button
        type="button"
        className="btn tiny primary"
        onClick={() => {
          onUndo(toast.player);
          onDismiss();
        }}
      >
        Undo
      </button>
    </div>
  );
}

import { useEffect } from 'react';
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
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

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

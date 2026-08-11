import { useEffect, useRef } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
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
/**
 * Longer on a phone (FINAL DECISION 3). Undo is the safety net for the one-tap
 * removal that fires ~176× a draft, and on a small screen the user has far less
 * peripheral view of the list to notice a wrong one.
 */
const TOAST_MS_MOBILE = 8000;

export default function Toast({ toast, onUndo, onDismiss }: Props) {
  const isMobile = useIsMobile();
  const inset = useKeyboardInset();
  // App passes a fresh `onDismiss` identity every render, so listing it here
  // cleared and restarted the timer on every App render — sync polls, the
  // `now` interval, any state change. The dismissal window was not 5s, it was
  // "5s after App stops re-rendering". Undo is the safety net for a one-tap
  // destructive action, so the window has to be the one we advertise.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(
      () => dismissRef.current(),
      isMobile ? TOAST_MS_MOBILE : TOAST_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast, isMobile]);

  if (!toast) return null;

  // The search overlay is the fastest removal path and it keeps the keyboard
  // up across the removal by design (§4), but iOS Safari does not shrink the
  // layout viewport for the keyboard — so the CSS `bottom` (dock + safe area)
  // lands the toast *behind* the keys. Lift it by the measured occlusion.
  // Mobile-only and only while a keyboard is actually up, so mobile.css owns
  // the resting position and desktop is untouched.
  const lift =
    isMobile && inset > 0
      ? { bottom: `calc(56px + env(safe-area-inset-bottom) + 12px + ${inset}px)` }
      : undefined;

  return (
    <div className="toast" role="status" style={lift}>
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

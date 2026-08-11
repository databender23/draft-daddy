import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

/** Downward travel (px) from the handle/header that commits a dismiss. */
const DISMISS_AT = 80;

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The one bottom-sheet primitive every mobile overlay is built from
 * (docs/mobile-design.md §4). Three redundant exits, because an accidental
 * sheet during a live pick must cost well under a second: scrim tap, the 44px
 * ✕, and a downward drag. Hardware Back is the fourth and is owned by
 * `useSheets` — this component holds no history state.
 *
 * The drag starts from the handle/header ONLY. Dragging from the body would
 * fight the body's own scroll, which is the classic bottom-sheet failure.
 */
export default function Sheet({ open, title, onClose, footer, children }: Props) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  if (!open) return null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Let the ✕ behave as a button, not a drag handle.
    if ((event.target as HTMLElement).closest('button')) return;
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    setDragY(Math.max(0, event.clientY - startY.current));
  }

  function onPointerUp() {
    const travelled = dragY;
    startY.current = null;
    setDragY(0);
    if (travelled >= DISMISS_AT) onClose();
  }

  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className="sheet"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            <h2 className="sheet-title">{title ?? ''}</h2>
            <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

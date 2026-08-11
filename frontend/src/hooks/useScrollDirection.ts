import { useEffect, useState } from 'react';

export type ScrollDirection = 'up' | 'down';

/** Ignore sub-pixel/rubber-band noise so the strip does not flicker. */
const NOISE = 6;

/**
 * Page scroll direction, for the suggested strip's auto-hide
 * (docs/mobile-design.md §3③). Reports 'down' only once the page is past
 * `threshold`, so the strip is always visible at the top of the list; any
 * upward scroll flips it straight back to 'up'.
 *
 * Degrades to a permanently visible strip if it ever misbehaves: the caller
 * only hides on 'down', never depends on it for layout.
 */
export function useScrollDirection(threshold = 80): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('up');

  useEffect(() => {
    let last = window.scrollY;
    let queued = false;

    const evaluate = () => {
      queued = false;
      const y = Math.max(0, window.scrollY);
      if (y <= threshold) {
        last = y;
        setDirection('up');
        return;
      }
      const delta = y - last;
      if (Math.abs(delta) < NOISE) return;
      last = y;
      setDirection(delta > 0 ? 'down' : 'up');
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(evaluate);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return direction;
}

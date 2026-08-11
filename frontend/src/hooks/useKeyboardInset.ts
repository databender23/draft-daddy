import { useEffect, useState } from 'react';

/**
 * Height in px of the on-screen keyboard's overlap with the layout viewport,
 * 0 when no keyboard is up.
 *
 * iOS Safari does NOT shrink the layout viewport when the keyboard opens, so a
 * `position: fixed; bottom: 0` element sits *behind* the keyboard and there is
 * no pure-CSS fix (docs/mobile-design.md §9 risk 1). `visualViewport` is the
 * only signal that reports the real occluded area; the search overlay
 * translates its input up by this amount.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return undefined;

    const update = () => {
      // innerHeight is the layout viewport; view.height + offsetTop is the part
      // of it the user can actually see. The difference is the keyboard.
      const overlap = window.innerHeight - (view.height + view.offsetTop);
      setInset(overlap > 1 ? Math.round(overlap) : 0);
    };

    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

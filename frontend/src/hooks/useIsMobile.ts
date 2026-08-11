import { useEffect, useState } from 'react';

/**
 * The one mobile breakpoint. `src/mobile.css`'s `@media` block and every JS
 * `matchMedia` check MUST use this exact string — see docs/mobile-design.md §7.
 * Nothing else in the app may hard-code 640px, or CSS and JS will drift.
 */
export const MOBILE_QUERY = '(max-width: 640px)';

/** True below 640px, live-updating on resize / orientation change. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handle = () => setIsMobile(media.matches);
    handle();
    media.addEventListener('change', handle);
    return () => media.removeEventListener('change', handle);
  }, []);

  return isMobile;
}

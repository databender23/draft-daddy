export type Theme = 'light' | 'dark';

/** Same key the index.html pre-paint script reads — do not diverge. */
const STORAGE_KEY = 'ffdraft:v1:theme';
const QUERY = '(prefers-color-scheme: dark)';

/**
 * Status-bar tint, kept in lockstep with the theme so toggling to dark does not
 * leave a white bar above a black page — very visible once the mobile layout
 * goes full-bleed under `viewport-fit=cover`.
 *
 * These are the only raw colors outside styles.css's two theme blocks: a meta
 * tag cannot read a CSS var. They are `--page` in each theme, and the pre-paint
 * script in index.html sets the same two values — change one, change both.
 */
const THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0d0d0d',
};

export function getStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? (window.matchMedia(QUERY).matches ? 'dark' : 'light');
}

/** The single place data-theme is applied — theme-color rides along with it. */
function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode — theme still applies for this page */
  }
  apply(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = resolveTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Follow live OS changes only while the user has not made an explicit choice. */
export function initThemeListener(onChange?: (theme: Theme) => void): () => void {
  const media = window.matchMedia(QUERY);
  function handle() {
    if (getStoredTheme() !== null) return;
    const theme: Theme = media.matches ? 'dark' : 'light';
    apply(theme);
    onChange?.(theme);
  }
  media.addEventListener('change', handle);
  return () => media.removeEventListener('change', handle);
}

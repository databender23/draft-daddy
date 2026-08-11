export type Theme = 'light' | 'dark';

/** Same key the index.html pre-paint script reads — do not diverge. */
const STORAGE_KEY = 'ffdraft:v1:theme';
const QUERY = '(prefers-color-scheme: dark)';

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

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#ffffff');
  }
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

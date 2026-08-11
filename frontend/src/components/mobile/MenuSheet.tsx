import { useEffect, useState } from 'react';
import type { Theme } from '../../lib/theme';
import { initThemeListener, resolveTheme, toggleTheme } from '../../lib/theme';
import type { AppPage, AvgMethod, Scoring } from '../../types';
import { AVG_METHODS, SCORINGS } from '../../types';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  scoring: Scoring;
  avg: AvgMethod;
  onScoring: (value: Scoring) => void;
  onAvg: (value: AvgMethod) => void;
  onPage: (page: AppPage) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const NAV: { id: AppPage; label: string }[] = [
  { id: 'help', label: 'How to use' },
  { id: 'strategy', label: 'Strategy' },
];

/**
 * The `☰` menu sheet (docs/mobile-design.md §4 "Menu sheet") — the new home for
 * everything TopBar owned that is not sync: scoring, averaging, theme and page
 * navigation. All of it is pre-draft or rare, so it pays no permanent pixels.
 *
 * Theme state is read from lib/theme rather than mirrored in App: `resolveTheme`
 * is the single source of truth (localStorage choice, else the OS query) and
 * `toggleTheme` owns applying `data-theme` plus the `theme-color` meta.
 */
export default function MenuSheet({
  open,
  scoring,
  avg,
  onScoring,
  onAvg,
  onPage,
  onOpenSettings,
  onClose,
}: Props) {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  // Follow live OS changes while no explicit choice is stored.
  useEffect(() => initThemeListener(setTheme), []);

  // Re-read on open: the theme can change from anywhere between openings.
  useEffect(() => {
    if (open) setTheme(resolveTheme());
  }, [open]);

  function go(page: AppPage) {
    onPage(page);
    onClose();
  }

  return (
    <Sheet open={open} title="Menu" onClose={onClose}>
      <div className="menusheet-group">
        <span className="menusheet-label">Scoring</span>
        <div className="menusheet-seg" role="group" aria-label="Scoring type">
          {SCORINGS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === scoring ? 'menusheet-seg-btn on' : 'menusheet-seg-btn'}
              aria-pressed={option === scoring}
              onClick={() => onScoring(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {scoring !== 'PPR' && (
          <p className="menusheet-hint">
            ADP / ECR / Risk are PPR-only — the projections file only carries them for the PPR
            slice.
          </p>
        )}
      </div>

      <div className="menusheet-group">
        <span className="menusheet-label">Averaging</span>
        <div className="menusheet-seg" role="group" aria-label="Averaging method">
          {AVG_METHODS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === avg ? 'menusheet-seg-btn on' : 'menusheet-seg-btn'}
              aria-pressed={option === avg}
              onClick={() => onAvg(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <nav className="menusheet-nav" aria-label="Menu">
        <button type="button" className="menusheet-row" onClick={() => setTheme(toggleTheme())}>
          <span>Theme</span>
          <span className="menusheet-value">{theme === 'dark' ? '☀ Light' : '☾ Dark'}</span>
        </button>

        {NAV.map((item) => (
          <button key={item.id} type="button" className="menusheet-row" onClick={() => go(item.id)}>
            <span>{item.label}</span>
            <span className="menusheet-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}

        <button
          type="button"
          className="menusheet-row"
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
        >
          <span>Settings</span>
          <span className="menusheet-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </nav>
    </Sheet>
  );
}

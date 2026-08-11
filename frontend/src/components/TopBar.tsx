import { useEffect, useState } from 'react';
import { timeAgo } from '../lib/format';
import type { Theme } from '../lib/theme';
import { initThemeListener, resolveTheme, toggleTheme } from '../lib/theme';
import type { AppPage, AvgMethod, DraftStatus, Scoring, TapStatus } from '../types';
import { AVG_METHODS, SCORINGS } from '../types';

const PAGES: { id: AppPage; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'help', label: 'How to use' },
  { id: 'strategy', label: 'Strategy' },
];

interface Props {
  page: AppPage;
  onPage: (page: AppPage) => void;
  scoring: Scoring;
  avg: AvgMethod;
  onScoring: (value: Scoring) => void;
  onAvg: (value: AvgMethod) => void;
  live: boolean;
  onLive: (value: boolean) => void;
  credsReady: boolean;
  status: DraftStatus | null;
  tap: TapStatus | null;
  lastSync: number | null;
  syncing: boolean;
  error: string | null;
  onSyncNow: () => void;
  onOpenSettings: () => void;
}

function statusLabel(status: DraftStatus | null): { text: string; tone: string } {
  if (!status) return { text: 'not synced', tone: 'idle' };
  if (status.drafted) return { text: 'draft complete', tone: 'good' };
  if (status.in_progress) return { text: 'draft in progress', tone: 'live' };
  return { text: 'pre-draft', tone: 'idle' };
}

export default function TopBar({
  page,
  onPage,
  scoring,
  avg,
  onScoring,
  onAvg,
  live,
  onLive,
  credsReady,
  status,
  tap,
  lastSync,
  syncing,
  error,
  onSyncNow,
  onOpenSettings,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => initThemeListener(setThemeState), []);

  const label = error ? { text: 'sync error', tone: 'bad' } : statusLabel(status);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img
          className="brand-logo"
          src={theme === 'dark' ? '/images/logo-white.png' : '/images/logo-color.png'}
          alt="Databender"
        />
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-name">Draft IQ</span>
      </div>

      <nav className="topnav" aria-label="Pages">
        {PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={page === item.id ? 'nav-link on' : 'nav-link'}
            onClick={() => onPage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-controls">
        <div className="segmented" role="group" aria-label="Scoring type">
          {SCORINGS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === scoring ? 'seg on' : 'seg'}
              onClick={() => onScoring(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="Averaging method">
          {AVG_METHODS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === avg ? 'seg on' : 'seg'}
              onClick={() => onAvg(option)}
            >
              {option}
            </button>
          ))}
        </div>

        {scoring !== 'PPR' && (
          <span className="hint" title="The projections file only carries these for the PPR slice">
            ADP / ECR / Risk are PPR-only
          </span>
        )}
      </div>

      <div className="topbar-sync">
        <span className={`status-chip status-${label.tone}`}>
          <span className="dot" aria-hidden="true" />
          {label.text}
        </span>
        <span className="sync-meta">
          {status ? `${status.pick_count} picks` : 'no picks'}
          {tap?.active ? ' · tap ⚡' : ''} · {timeAgo(lastSync, now)}
        </span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={live}
            disabled={!credsReady}
            onChange={(e) => onLive(e.target.checked)}
          />
          <span>Live</span>
        </label>
        <button type="button" className="btn" onClick={onSyncNow} disabled={syncing || !credsReady}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" className="btn" onClick={onOpenSettings}>
          Settings
        </button>
        <button
          type="button"
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setThemeState(toggleTheme())}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}

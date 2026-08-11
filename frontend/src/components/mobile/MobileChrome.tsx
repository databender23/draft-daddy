import type { Sheets } from '../../hooks/useSheets';
import { statusLabel } from '../../lib/status';
import type {
  AppPage,
  AvgMethod,
  DraftStatus,
  Scoring,
  TapStatus,
  UnmatchedPick,
} from '../../types';
import MenuSheet from './MenuSheet';
import MobileAppBar from './MobileAppBar';
import SyncSheet from './SyncSheet';

interface Props {
  sheets: Sheets;
  availableCount: number;

  /* menu sheet — everything TopBar owned that is not sync */
  scoring: Scoring;
  avg: AvgMethod;
  onScoring: (value: Scoring) => void;
  onAvg: (value: AvgMethod) => void;
  onPage: (page: AppPage) => void;
  onOpenSettings: () => void;

  /* sync sheet — TopBar's sync cluster, behind one tappable app-bar line */
  status: DraftStatus | null;
  tap: TapStatus | null;
  lastSync: number | null;
  syncing: boolean;
  error: string | null;
  live: boolean;
  credsReady: boolean;
  onLive: (value: boolean) => void;
  onSyncNow: () => void;
  unmatched: UnmatchedPick[];
}

/**
 * TopBar's mobile replacement (docs/mobile-design.md §3① and §6 "Demoted"):
 * the 48px app bar plus the two sheets it opens.
 *
 * It renders on every page, not just the board — the `☰` sheet's nav rows are
 * the only way back from How to use / Strategy once the desktop `.topnav` is
 * gone.
 */
export default function MobileChrome({
  sheets,
  availableCount,
  scoring,
  avg,
  onScoring,
  onAvg,
  onPage,
  onOpenSettings,
  status,
  tap,
  lastSync,
  syncing,
  error,
  live,
  credsReady,
  onLive,
  onSyncNow,
  unmatched,
}: Props) {
  const label = statusLabel(status, error);

  return (
    <>
      <MobileAppBar
        statusText={label.text}
        statusTone={label.tone}
        pickCount={status?.pick_count ?? null}
        availableCount={availableCount}
        onOpenSync={() => sheets.openSheet('sync')}
        onOpenMenu={() => sheets.openSheet('menu')}
        onScrollTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />

      <MenuSheet
        open={sheets.sheet === 'menu'}
        scoring={scoring}
        avg={avg}
        onScoring={onScoring}
        onAvg={onAvg}
        onPage={onPage}
        onOpenSettings={onOpenSettings}
        onClose={sheets.close}
      />

      <SyncSheet
        open={sheets.sheet === 'sync'}
        status={status}
        tap={tap}
        lastSync={lastSync}
        syncing={syncing}
        error={error}
        live={live}
        credsReady={credsReady}
        onLive={onLive}
        onSyncNow={onSyncNow}
        unmatched={unmatched}
        onClose={sheets.close}
      />
    </>
  );
}

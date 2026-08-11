import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, syncDraft, syncTapOnly, syncYahooDraft } from '../api';
import type { AvgMethod, Scoring, Settings, SyncOutcome, SyncResponse } from '../types';

export const POLL_MS = 10000;
/** Faster cadence once a draft-room tap is feeding picks — the poll is then
 * just draining an in-memory buffer, not asking ESPN for fresh data. */
export const TAP_POLL_MS = 3000;

export function hasCreds(settings: Settings): boolean {
  if (!settings.leagueId.trim()) return false;
  // ESPN cookies are only needed for private leagues; Yahoo always needs OAuth;
  // tap-only needs the shared key since that IS the whole data path.
  if (settings.provider === 'yahoo') return Boolean(settings.yahooRefreshToken.trim());
  if (settings.provider === 'tap') return Boolean(settings.tapKey.trim());
  return true;
}

interface Options {
  settings: Settings;
  scoring: Scoring;
  avg: AvgMethod;
  onAuth?: (refreshToken: string) => void;
}

export interface DraftSync {
  data: SyncResponse | null;
  error: string | null;
  lastSync: number | null;
  syncing: boolean;
  runSync: (override?: Settings) => Promise<SyncOutcome>;
}

export function useDraftSync({ settings, scoring, avg, onAuth }: Options): DraftSync {
  const [data, setData] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const settingsRef = useRef(settings);
  const inFlight = useRef(false);
  // Yahoo access tokens last ~1h; keep the live one in memory (never persisted)
  // and let the backend mint a new one from the refresh token when it expires.
  const yahooAccess = useRef('');
  const onAuthRef = useRef(onAuth);

  useEffect(() => {
    settingsRef.current = settings;
    onAuthRef.current = onAuth;
  }, [settings, onAuth]);

  const runSync = useCallback(
    async (override?: Settings): Promise<SyncOutcome> => {
      const active = override ?? settingsRef.current;
      if (!hasCreds(active)) {
        const message =
          active.provider === 'yahoo'
            ? 'Connect Yahoo in Settings, then set your league ID.'
            : active.provider === 'tap'
              ? 'Add your league ID and tap key in Settings, then install the tap userscript.'
              : 'Add your league in Settings first — just paste your ESPN league URL.';
        setError(message);
        return { ok: false, message };
      }
      if (inFlight.current) return { ok: false, message: 'Sync already running.' };
      inFlight.current = true;
      setSyncing(true);
      try {
        let result: SyncResponse;
        if (active.provider === 'yahoo') {
          result = await syncYahooDraft({
            league_id: active.leagueId.trim(),
            season: active.season,
            refresh_token: active.yahooRefreshToken.trim(),
            access_token: yahooAccess.current,
            scoring,
            avg,
            tap_key: active.tapKey.trim(),
          });
          if (result.auth) {
            yahooAccess.current = result.auth.access_token;
            if (result.auth.refresh_token !== active.yahooRefreshToken) {
              onAuthRef.current?.(result.auth.refresh_token);
            }
          }
        } else if (active.provider === 'tap') {
          result = await syncTapOnly(
            active.leagueId.trim(),
            active.season,
            active.tapKey.trim(),
            scoring,
            avg,
          );
        } else {
          result = await syncDraft({
            league_id: active.leagueId.trim(),
            season: active.season,
            espn_s2: active.espnS2.trim(),
            swid: active.swid.trim(),
            scoring,
            avg,
            tap_key: active.tapKey.trim(),
          });
        }
        setData(result);
        setError(null);
        setLastSync(Date.now());
        const { pick_count: picks } = result.status;
        if (active.provider === 'tap') {
          return {
            ok: true,
            message: result.tap?.active
              ? `Tap connected — ${picks} picks relayed.`
              : 'No tap data yet — open your draft room with the userscript running.',
          };
        }
        return { ok: true, message: `Connected — ${result.teams.length} teams, ${picks} picks.` };
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Could not reach the server — is it running?';
        setError(message);
        return { ok: false, message };
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    },
    [scoring, avg],
  );

  const live = settings.live;
  const credsReady = hasCreds(settings);
  const tapActive = data?.tap?.active === true;

  useEffect(() => {
    if (!live || !credsReady) return undefined;
    void runSync();
    const timer = window.setInterval(() => {
      void runSync();
    }, tapActive ? TAP_POLL_MS : POLL_MS);
    return () => window.clearInterval(timer);
  }, [
    live,
    credsReady,
    tapActive,
    settings.provider,
    settings.leagueId,
    settings.season,
    settings.espnS2,
    settings.swid,
    settings.yahooRefreshToken,
    settings.tapKey,
    runSync,
  ]);

  return { data, error, lastSync, syncing, runSync };
}

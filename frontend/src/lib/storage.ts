import type { Persisted, Pos, Provider, RosterConfig, Settings } from '../types';
import { DEFAULT_ROSTER, POSITIONS, PROVIDERS } from '../types';

const PREFIX = 'ffdraft:v1';
const POINTER_KEY = `${PREFIX}:last`;

export const DEFAULT_SEASON = 2026;

export const DEFAULT_SETTINGS: Settings = {
  provider: 'espn',
  leagueId: '',
  season: DEFAULT_SEASON,
  espnS2: '',
  swid: '',
  yahooRefreshToken: '',
  myTeamId: null,
  live: false,
  tapKey: '',
  roster: { ...DEFAULT_ROSTER },
};

/** Random shared secret pairing the draft-room userscript with this board. */
export function generateTapKey(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function coerceRoster(raw: unknown): RosterConfig {
  const source = (raw ?? {}) as Partial<Record<keyof RosterConfig, unknown>>;
  const out = { ...DEFAULT_ROSTER };
  for (const key of Object.keys(DEFAULT_ROSTER) as (keyof RosterConfig)[]) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(30, Math.round(value)));
    }
  }
  return out;
}

export function storageKey(leagueId: string, season: number): string {
  const league = leagueId.trim() || 'default';
  return `${PREFIX}:${league}:${season}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) */
  }
}

function coerceSettings(raw: Partial<Settings> | undefined): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    provider: PROVIDERS.some((p) => p.value === raw.provider)
      ? (raw.provider as Provider)
      : DEFAULT_SETTINGS.provider,
    yahooRefreshToken:
      typeof raw.yahooRefreshToken === 'string' ? raw.yahooRefreshToken : '',
    leagueId: typeof raw.leagueId === 'string' ? raw.leagueId : DEFAULT_SETTINGS.leagueId,
    season: typeof raw.season === 'number' ? raw.season : DEFAULT_SETTINGS.season,
    espnS2: typeof raw.espnS2 === 'string' ? raw.espnS2 : '',
    swid: typeof raw.swid === 'string' ? raw.swid : '',
    myTeamId: typeof raw.myTeamId === 'number' ? raw.myTeamId : null,
    live: raw.live === true,
    tapKey: typeof raw.tapKey === 'string' ? raw.tapKey : '',
    roster: coerceRoster(raw.roster),
  };
}

function coerceIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

function coerceDismissed(raw: unknown): Pos[] {
  return Array.isArray(raw) ? raw.filter((v): v is Pos => POSITIONS.includes(v as Pos)) : [];
}

function coerceRemovedAt(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) {
    if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

export function hasBucket(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function loadBucket(key: string): Persisted {
  const raw = readJson<Partial<Persisted>>(key);
  return {
    settings: coerceSettings(raw?.settings),
    manualDrafted: coerceIds(raw?.manualDrafted),
    myPicks: coerceIds(raw?.myPicks),
    dismissed: coerceDismissed(raw?.dismissed),
    removedAt: coerceRemovedAt(raw?.removedAt),
    starred: coerceIds(raw?.starred),
  };
}

export function saveBucket(key: string, value: Persisted): void {
  writeJson(key, value);
}

export function loadPointer(): { leagueId: string; season: number } {
  const raw = readJson<{ leagueId?: string; season?: number }>(POINTER_KEY);
  return {
    leagueId: typeof raw?.leagueId === 'string' ? raw.leagueId : '',
    season: typeof raw?.season === 'number' ? raw.season : DEFAULT_SEASON,
  };
}

export function savePointer(leagueId: string, season: number): void {
  writeJson(POINTER_KEY, { leagueId, season });
}

export function loadInitial(): Persisted {
  const pointer = loadPointer();
  const bucket = loadBucket(storageKey(pointer.leagueId, pointer.season));
  if (!bucket.settings.leagueId && pointer.leagueId) {
    bucket.settings.leagueId = pointer.leagueId;
    bucket.settings.season = pointer.season;
  }
  return bucket;
}

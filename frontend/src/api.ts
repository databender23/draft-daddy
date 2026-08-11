import type {
  AvgMethod,
  Player,
  Scoring,
  SyncRequest,
  SyncResponse,
  TeamContext,
  YahooSyncRequest,
} from './types';

export interface PlayersResponse {
  players: Player[];
  /** Empty when backend/data/team_context.json is absent. */
  teams: Record<string, TeamContext>;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseError(res: Response): Promise<never> {
  let detail = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') detail = body.detail;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(res.status, detail);
}

export async function fetchPlayers(
  scoring: Scoring,
  avg: AvgMethod,
  signal?: AbortSignal,
): Promise<PlayersResponse> {
  const params = new URLSearchParams({ scoring, avg });
  const res = await fetch(`/api/players?${params.toString()}`, { signal });
  if (!res.ok) await parseError(res);
  const body = (await res.json()) as Partial<PlayersResponse>;
  return { players: body.players ?? [], teams: body.teams ?? {} };
}

export async function syncDraft(req: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
  const res = await fetch('/api/espn/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as SyncResponse;
}

export async function syncYahooDraft(
  req: YahooSyncRequest,
  signal?: AbortSignal,
): Promise<SyncResponse> {
  const res = await fetch('/api/yahoo/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as SyncResponse;
}

/** Tap-only sync: buffered picks matched to the board, no provider API call. */
export async function syncTapOnly(
  leagueId: string,
  season: number,
  key: string,
  scoring: Scoring,
  avg: AvgMethod,
  signal?: AbortSignal,
): Promise<SyncResponse> {
  const params = new URLSearchParams({
    league_id: leagueId,
    season: String(season),
    key,
    scoring,
    avg,
  });
  const res = await fetch(`/api/draft/live?${params.toString()}`, { signal });
  if (!res.ok) await parseError(res);
  const body = (await res.json()) as Partial<SyncResponse>;
  return {
    status: {
      drafted: false,
      in_progress: Boolean(body.tap?.active),
      pick_count: body.picks?.length ?? 0,
    },
    teams: [],
    my_team_id: null,
    roster_slots: null,
    picks: body.picks ?? [],
    unmatched: body.unmatched ?? [],
    tap: body.tap ?? null,
  };
}

export async function yahooConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/yahoo/status');
    if (!res.ok) return false;
    return ((await res.json()) as { configured?: boolean }).configured === true;
  } catch {
    return false;
  }
}

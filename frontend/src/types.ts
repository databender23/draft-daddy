export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
export type PosFilter = Pos | 'ALL';
export type Scoring = 'PPR' | 'Half-PPR' | 'Non-PPR';
export type AvgMethod = 'average' | 'robust' | 'weighted';

export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];
export const SCORINGS: Scoring[] = ['PPR', 'Half-PPR', 'Non-PPR'];
export const AVG_METHODS: AvgMethod[] = ['average', 'robust', 'weighted'];

/** Prior-season NFL context for one team, keyed by ffanalytics abbrev (KCC, GBP…). */
export interface TeamContext {
  bye: number | null;
  /** 0..1 pass attempts / (attempts + carries), prior season. */
  pass_rate: number;
  /** 1..32, 1 = most pass-heavy. */
  pass_rank: number;
  /** 1..32 per position, 1 = easiest schedule. */
  sos: Record<Pos, number>;
}

/** Prior-season production for one player (absent for rookies, K and DST). */
export interface LastSeason {
  games: number;
  ppg: number;
  opportunities_pg: number;
  /** "touches/g" (RB), "targets/g" (WR/TE), "plays/g" (QB). */
  opp_label: string;
  target_share: number | null;
  tds: number;
  expected_tds: number;
  td_regression: boolean;
  konami: boolean;
  /** QB share of fantasy points from rushing (0..1); null for RB/WR/TE. */
  rush_share: number | null;
}

export interface Player {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  team: string;
  pos: Pos;
  points: number | null;
  sd_pts: number | null;
  dropoff: number | null;
  floor: number | null;
  ceiling: number | null;
  vor: number | null;
  floor_vor: number | null;
  ceiling_vor: number | null;
  ecr: number | null;
  adp: number | null;
  adp_diff: number | null;
  aav: number | null;
  uncertainty: number | null;
  rank: number | null;
  pos_rank: number | null;
  tier: number | null;
  age: number | null;
  last_season: LastSeason | null;
}

export interface RosterConfig {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  dst: number;
  k: number;
  bench: number;
}

export const DEFAULT_ROSTER: RosterConfig = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  dst: 1,
  k: 1,
  bench: 7,
};

export interface DraftStatus {
  drafted: boolean;
  in_progress: boolean;
  pick_count: number;
}

export interface EspnTeam {
  id: number;
  name: string;
}

export interface EspnPick {
  /** Provider player id; null for name-only picks from a DOM-scraping tap. */
  espn_id: number | null;
  name: string;
  team: string;
  pos: string;
  overall: number;
  round: number | null;
  espn_team_id: number;
  lineup_slot_id: number;
  csv_id: string | null;
}

export interface UnmatchedPick {
  espn_id: number | null;
  name: string;
  team: string;
  pos: string;
}

/** Live WebSocket-tap buffer state; null when no tap has reported. */
export interface TapStatus {
  active: boolean;
  picks: number;
  last_event_at: number | null;
}

export interface SyncResponse {
  status: DraftStatus;
  teams: EspnTeam[];
  my_team_id: number | null;
  roster_slots: RosterConfig | null;
  picks: EspnPick[];
  unmatched: UnmatchedPick[];
  tap: TapStatus | null;
  /** Yahoo only: rotated tokens the client should adopt; absent/null otherwise. */
  auth?: YahooAuth | null;
}

export interface SyncRequest {
  league_id: string;
  season: number;
  espn_s2: string;
  swid: string;
  scoring: Scoring;
  avg: AvgMethod;
  tap_key: string;
}

/** Where league/draft data comes from. 'tap' = userscript relay only (any
 * platform whose draft room we can tap) — no provider API. */
export type Provider = 'espn' | 'yahoo' | 'tap';
export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'espn', label: 'ESPN' },
  { value: 'yahoo', label: 'Yahoo' },
  { value: 'tap', label: 'Tap only (userscript relay)' },
];

export interface YahooAuth {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface YahooSyncRequest {
  league_id: string;
  season: number;
  refresh_token: string;
  access_token: string;
  scoring: Scoring;
  avg: AvgMethod;
  tap_key: string;
}

export interface Settings {
  provider: Provider;
  leagueId: string;
  season: number;
  espnS2: string;
  swid: string;
  yahooRefreshToken: string;
  myTeamId: number | null;
  live: boolean;
  tapKey: string;
  roster: RosterConfig;
}

export interface Persisted {
  settings: Settings;
  manualDrafted: string[];
  myPicks: string[];
  dismissed: Pos[];
  removedAt: Record<string, number>;
  starred: string[];
}

export type BoardView = 'board' | 'removed';
export type AppPage = 'draft' | 'help' | 'strategy';

export interface SyncOutcome {
  ok: boolean;
  message: string;
}

import type { Player } from '../types';

export type SortKey =
  | 'name'
  | 'pos'
  | 'team'
  | 'rank'
  | 'pos_rank'
  | 'tier'
  | 'vor'
  | 'points'
  | 'sd_pts'
  | 'floor'
  | 'ceiling'
  | 'uncertainty'
  | 'adp'
  | 'adp_diff';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  digits?: number;
  signed?: boolean;
  pprOnly?: boolean;
  /** Render a 0..1 value as a whole percentage. */
  pct?: boolean;
  title?: string;
}

// Deliberately lean for clock-mode reading: Rank/Pos Rank/ADP and the analyst
// stats (Dropoff, ECR, AAV) live in the hover card, not here.
export const COLUMNS: Column[] = [
  { key: 'name', label: 'Player', numeric: false },
  { key: 'pos', label: 'Pos', numeric: false },
  { key: 'team', label: 'Team', numeric: false },
  { key: 'tier', label: 'Tier', numeric: true, digits: 0 },
  { key: 'vor', label: 'VOR', numeric: true, digits: 1 },
  { key: 'points', label: 'Proj Pts', numeric: true, digits: 1 },
  { key: 'sd_pts', label: 'SD Pts', numeric: true, digits: 1 },
  { key: 'floor', label: 'Floor', numeric: true, digits: 1 },
  { key: 'ceiling', label: 'Ceiling', numeric: true, digits: 1 },
  { key: 'uncertainty', label: 'Risk', numeric: true, pct: true, pprOnly: true, title: 'Uncertainty' },
  { key: 'adp_diff', label: 'ADP Diff', numeric: true, digits: 1, signed: true, pprOnly: true },
];

export const DEFAULT_SORT: SortState = { key: 'vor', dir: 'desc' };

const ASCENDING_BY_DEFAULT: SortKey[] = ['name', 'pos', 'team', 'rank', 'pos_rank', 'tier', 'adp'];

export function defaultDirFor(key: SortKey): SortDir {
  return ASCENDING_BY_DEFAULT.includes(key) ? 'asc' : 'desc';
}

function compare(a: Player, b: Player, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  const aNull = av === null || av === undefined;
  const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  let result: number;
  if (typeof av === 'string' && typeof bv === 'string') {
    result = av.localeCompare(bv);
  } else {
    result = (av as number) - (bv as number);
  }
  return dir === 'asc' ? result : -result;
}

export function sortPlayers(rows: Player[], sort: SortState): Player[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const primary = compare(a, b, sort.key, sort.dir);
    if (primary !== 0) return primary;
    return compare(a, b, 'vor', 'desc');
  });
  return sorted;
}

export function matchesSearch(player: Player, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    player.name.toLowerCase().includes(q) ||
    player.last_name.toLowerCase().startsWith(q) ||
    player.team.toLowerCase().startsWith(q)
  );
}

import type { LastSeason, Player, Pos, TeamContext } from '../types';

/** Team context keyed by ffanalytics abbrev, straight from GET /api/players. */
export type TeamMap = Record<string, TeamContext>;

/**
 * Season the `last_season` block describes. The players payload carries no
 * header, so this tracks `player_context.json.season_prior` — bump both together.
 */
export const PRIOR_SEASON = 2025;

/** Positions that ever get a `last_season` block (K and DST are skipped upstream). */
const SKILL_POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE'];

/** 1-10 easy, 11-21 average, 22-32 tough. */
export function sosTone(rank: number): 'easy' | 'average' | 'tough' {
  if (rank <= 10) return 'easy';
  if (rank <= 21) return 'average';
  return 'tough';
}

export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Renders 0..1 shares as whole percents; tolerates a value already in 0..100. */
function pct(value: number): string {
  const share = value <= 1 ? value * 100 : value;
  return `${Math.round(share)}%`;
}

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'warn';
}

export interface Callout {
  icon: string;
  text: string;
  tone: 'warn' | 'good';
}

export interface TooltipContent {
  header: { name: string; pos: Pos; team: string; posRank: string | null };
  /** Top KPI row: bye / schedule / offense style. */
  kpis: Kpi[];
  /** Analyst stats pulled off the table: ADP, expert rank, auction value, dropoff. */
  market: Kpi[];
  /** KPI row with last season's production; empty for rookies and K/DST. */
  season: Kpi[];
  seasonLabel: string | null;
  rookieNote: string | null;
  /** Plain-English flag sentences, worth reading even in a hurry. */
  callouts: Callout[];
}

const SOS_WORDS: Record<'easy' | 'average' | 'tough', string> = {
  easy: 'Easy',
  average: 'Average',
  tough: 'Tough',
};

const OPP_KPI_LABELS: Record<string, string> = {
  'touches/g': 'Touches / game',
  'targets/g': 'Targets / game',
  'plays/g': 'Plays / game',
};

function teamKpis(
  team: TeamContext | undefined,
  pos: Pos,
  byeCounts: Map<number, number>,
): { kpis: Kpi[]; callouts: Callout[] } {
  if (!team) return { kpis: [], callouts: [] };
  const kpis: Kpi[] = [];
  const callouts: Callout[] = [];

  if (typeof team.bye === 'number') {
    const clash = (byeCounts.get(team.bye) ?? 0) >= 2;
    kpis.push({
      label: 'Bye week',
      value: `${team.bye}`,
      sub: clash ? 'roster clash' : undefined,
      tone: clash ? 'warn' : undefined,
    });
    if (clash) {
      callouts.push({
        icon: '⚠',
        tone: 'warn',
        text: `${byeCounts.get(team.bye)} of your picks already sit out week ${team.bye} — that lineup will be thin.`,
      });
    }
  }

  const sosRank = team.sos?.[pos];
  if (typeof sosRank === 'number') {
    const tone = sosTone(sosRank);
    kpis.push({
      label: 'Schedule',
      value: SOS_WORDS[tone],
      sub: `${ordinal(sosRank)} easiest for ${pos}`,
      tone: tone === 'easy' ? 'good' : tone === 'tough' ? 'bad' : undefined,
    });
  }

  // Backs are judged on how much their offense runs, everyone else on throws.
  if (pos === 'RB') {
    kpis.push({
      label: 'Offense style',
      value: `${pct(1 - team.pass_rate)} run`,
      sub: `${ordinal(33 - team.pass_rank)} most run-heavy`,
    });
  } else {
    kpis.push({
      label: 'Offense style',
      value: `${pct(team.pass_rate)} pass`,
      sub: `${ordinal(team.pass_rank)} most pass-heavy`,
    });
  }

  return { kpis, callouts };
}

function marketKpis(player: Player): Kpi[] {
  const kpis: Kpi[] = [];
  if (player.adp !== null && player.adp !== undefined) {
    kpis.push({ label: 'ADP', value: player.adp.toFixed(1), sub: 'typical pick #' });
  }
  if (player.ecr !== null && player.ecr !== undefined) {
    kpis.push({ label: 'Expert rank', value: `${Math.round(player.ecr)}`, sub: 'consensus' });
  }
  if (player.aav !== null && player.aav !== undefined) {
    kpis.push({ label: 'Auction', value: `$${Math.round(player.aav)}`, sub: 'avg value' });
  }
  if (player.dropoff !== null && player.dropoff !== undefined) {
    kpis.push({
      label: 'Dropoff',
      value: player.dropoff.toFixed(1),
      sub: `pts to next ${player.pos}`,
    });
  }
  return kpis;
}

function seasonKpis(last: LastSeason): Kpi[] {
  const kpis: Kpi[] = [
    { label: 'Games', value: `${last.games}` },
    {
      label: OPP_KPI_LABELS[last.opp_label] ?? last.opp_label,
      value: last.opportunities_pg.toFixed(1),
    },
  ];
  if (last.target_share !== null && last.target_share !== undefined) {
    kpis.push({
      label: 'Team targets',
      value: pct(last.target_share),
      sub: 'his share',
    });
  }
  return kpis;
}

function flagCallouts(last: LastSeason): Callout[] {
  const out: Callout[] = [];
  if (last.td_regression) {
    out.push({
      icon: '⚠',
      tone: 'warn',
      text: `Scored ${last.tds} TDs, but his workload predicts ~${Math.round(last.expected_tds)}. Touchdown luck rarely repeats — expect fewer.`,
    });
  }
  if (last.konami) {
    const share = typeof last.rush_share === 'number' ? pct(last.rush_share) : 'over 25%';
    out.push({
      icon: '⚡',
      tone: 'good',
      text: `Runs for ${share} of his fantasy points. Rushing is steadier than passing week to week — a high floor.`,
    });
  }
  return out;
}

/**
 * Builds the tooltip card for a player. Returns null when there is nothing to
 * show (no team context and no prior-season block) so no tooltip is rendered.
 */
export function buildTooltip(
  player: Player,
  team: TeamContext | undefined,
  byeCounts: Map<number, number>,
): TooltipContent | null {
  const last = player.last_season ?? null;
  const { kpis, callouts } = teamKpis(team, player.pos, byeCounts);
  const market = marketKpis(player);
  const isRookie = last === null && SKILL_POSITIONS.includes(player.pos);

  if (kpis.length === 0 && market.length === 0 && !last && !isRookie) return null;

  return {
    header: {
      name: player.name,
      pos: player.pos,
      team: player.team,
      posRank: player.pos_rank !== null ? `#${player.pos_rank} ${player.pos}` : null,
    },
    kpis,
    market,
    season: last ? seasonKpis(last) : [],
    seasonLabel: last ? `Last season (${PRIOR_SEASON})` : null,
    rookieNote: isRookie ? `No NFL stats yet — likely a ${PRIOR_SEASON + 1} rookie.` : null,
    callouts: last ? [...flagCallouts(last), ...callouts] : callouts,
  };
}

/** week -> how many of the user's rostered players are on bye that week. */
export function byeCountsFor(roster: Player[], teams: TeamMap): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of roster) {
    const bye = teams[player.team]?.bye;
    if (typeof bye !== 'number') continue;
    counts.set(bye, (counts.get(bye) ?? 0) + 1);
  }
  return counts;
}

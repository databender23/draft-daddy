import type { Player, Pos, RosterConfig } from '../types';

interface SlotSpec {
  label: string;
  count: number;
  accepts: Pos[];
}

const FLEX_ACCEPTS: Pos[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_ACCEPTS: Pos[] = ['QB', 'RB', 'WR', 'TE'];

export function lineupFor(config: RosterConfig): SlotSpec[] {
  const specs: SlotSpec[] = [
    { label: 'QB', count: config.qb, accepts: ['QB'] },
    { label: 'RB', count: config.rb, accepts: ['RB'] },
    { label: 'WR', count: config.wr, accepts: ['WR'] },
    { label: 'TE', count: config.te, accepts: ['TE'] },
    { label: 'FLEX', count: config.flex, accepts: FLEX_ACCEPTS },
    { label: 'SFLEX', count: config.superflex, accepts: SUPERFLEX_ACCEPTS },
    { label: 'DST', count: config.dst, accepts: ['DST'] },
    { label: 'K', count: config.k, accepts: ['K'] },
  ];
  return specs.filter((spec) => spec.count > 0);
}

export interface RosterSlot {
  label: string;
  accepts: Pos[];
  player: Player | null;
}

export interface Roster {
  starters: RosterSlot[];
  bench: Player[];
}

function emptySlots(config: RosterConfig): RosterSlot[] {
  const slots: RosterSlot[] = [];
  for (const spec of lineupFor(config)) {
    for (let i = 0; i < spec.count; i += 1) {
      slots.push({ label: spec.label, accepts: spec.accepts, player: null });
    }
  }
  return slots;
}

export function buildRoster(players: Player[], config: RosterConfig): Roster {
  const starters = emptySlots(config);
  const bench: Player[] = [];
  for (const player of players) {
    const dedicated = starters.find(
      (slot) => slot.player === null && slot.accepts.length === 1 && slot.accepts[0] === player.pos,
    );
    const target =
      dedicated ??
      starters.find((slot) => slot.player === null && slot.accepts.includes(player.pos));
    if (target) target.player = player;
    else bench.push(player);
  }
  return { starters, bench };
}

export function filledPositions(roster: Roster): Pos[] {
  const open = roster.starters.filter((slot) => slot.player === null);
  const positions: Pos[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];
  return positions.filter((pos) => !open.some((slot) => slot.accepts.includes(pos)));
}

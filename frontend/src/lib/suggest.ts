import type { Player, RosterConfig } from '../types';
import { buildRoster } from './roster';

export interface Suggestion {
  player: Player;
  slotLabel: string | null;
  forStarter: boolean;
  score: number;
}

function starterScore(player: Player): number {
  const vor = player.vor ?? -999;
  const floor = player.floor_vor ?? vor;
  return 0.7 * vor + 0.3 * floor;
}

function benchScore(player: Player): number {
  const vor = player.vor ?? -999;
  const ceiling = player.ceiling_vor ?? vor;
  return 0.7 * vor + 0.3 * ceiling;
}

/**
 * Best next pick given the current roster: fill open starter slots first
 * (floor-weighted — starters need reliability), otherwise best bench upside
 * (ceiling-weighted). Mirrors the strategy page's playbook.
 */
export function suggestPick(
  available: Player[],
  myPlayers: Player[],
  config: RosterConfig,
): Suggestion | null {
  const roster = buildRoster(myPlayers, config);
  const openSlots = roster.starters.filter((slot) => slot.player === null);
  const benchOpen = roster.bench.length < config.bench;

  let best: Suggestion | null = null;
  for (const player of available) {
    const slot = openSlots.find((s) => s.accepts.includes(player.pos));
    let candidate: Suggestion;
    if (slot) {
      candidate = {
        player,
        slotLabel: slot.label,
        forStarter: true,
        score: starterScore(player),
      };
    } else if (benchOpen) {
      candidate = { player, slotLabel: null, forStarter: false, score: benchScore(player) };
    } else {
      continue;
    }
    // Starters outrank bench candidates outright; scores only compare within kind.
    if (
      best === null ||
      (candidate.forStarter && !best.forStarter) ||
      (candidate.forStarter === best.forStarter && candidate.score > best.score)
    ) {
      best = candidate;
    }
  }
  return best;
}

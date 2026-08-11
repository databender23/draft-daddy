import { fmtNum } from '../../lib/format';
import { buildRoster, filledPositions } from '../../lib/roster';
import type { Suggestion } from '../../lib/suggest';
import type { Player, Pos, RosterConfig } from '../../types';
import { PlayerBadges } from '../PlayerName';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  suggestion: Suggestion | null;
  undrafted: Player[];
  livePositions: Pos[];
  myPlayers: Player[];
  rosterConfig: RosterConfig;
  watching: Player[];
  onDraft: (player: Player, mine: boolean) => void;
  onOpenPlayer: (player: Player) => void;
  onClose: () => void;
}

/** `92–171`, or a single em-dash when neither bound exists. */
function range(floor: number | null, ceiling: number | null): string {
  if (floor === null && ceiling === null) return fmtNum(null, 0);
  return `${fmtNum(floor, 0)}–${fmtNum(ceiling, 0)}`;
}

/** Highest-VOR available player at each position, in one pass over the board. */
function bestByPos(players: Player[]): Map<Pos, Player> {
  const best = new Map<Pos, Player>();
  for (const player of players) {
    const held = best.get(player.pos);
    if (held === undefined || (player.vor ?? -999) > (held.vor ?? -999)) {
      best.set(player.pos, player);
    }
  }
  return best;
}

/**
 * The on-the-clock cockpit (docs/mobile-design.md §4 "My Pick sheet") — the
 * design's central trade. Four always-on desktop components and ~700px of
 * permanent chrome (SuggestedPick, BestAvailable, WatchStrip, the roster's
 * needs readout) collapse into one dock button, because every question they
 * answer only matters at your own pick.
 *
 * Four sections, in decreasing order of "answers the question outright":
 * the suggestion in full, the needs line, best available across positions,
 * and the watchlist.
 */
export default function MyPickSheet({
  open,
  suggestion,
  undrafted,
  livePositions,
  myPlayers,
  rosterConfig,
  watching,
  onDraft,
  onOpenPlayer,
  onClose,
}: Props) {
  if (!open) return null;

  const roster = buildRoster(myPlayers, rosterConfig);
  const openLabels: string[] = [];
  for (const slot of roster.starters) {
    if (slot.player === null && !openLabels.includes(slot.label)) openLabels.push(slot.label);
  }
  // FINAL DECISION 6: every live position renders; the ones whose starter slots
  // are all spoken for are dimmed rather than dropped, so the cross-position
  // comparison keeps its desktop shape.
  const filled = filledPositions(roster);
  const best = bestByPos(undrafted);

  return (
    <Sheet open={open} title="My Pick" onClose={onClose}>
      {suggestion ? (
        <section className="mypick-sug" aria-label="Suggested pick">
          <div className="mypick-sug-label">Suggested pick</div>
          <div className="mypick-sug-head">
            <span className={`badge pos-${suggestion.player.pos}`}>{suggestion.player.pos}</span>
            <span className="mypick-sug-name">{suggestion.player.name}</span>
            <PlayerBadges player={suggestion.player} />
          </div>
          <div className="mypick-sug-reason">
            {suggestion.forStarter
              ? `fills your ${suggestion.slotLabel} slot · floor-weighted`
              : 'bench upside · ceiling-weighted'}
          </div>
          <div className="mypick-sug-stats">
            VOR {fmtNum(suggestion.player.vor, 1)} · floor {fmtNum(suggestion.player.floor, 0)} ·
            ceil {fmtNum(suggestion.player.ceiling, 0)}
          </div>
          <div className="mypick-sug-actions">
            <button
              type="button"
              className="btn primary mypick-act"
              onClick={() => onDraft(suggestion.player, true)}
            >
              Mine
            </button>
            <button
              type="button"
              className="btn mypick-act"
              onClick={() => onDraft(suggestion.player, false)}
            >
              ✕ Someone else took them
            </button>
          </div>
        </section>
      ) : (
        <p className="mypick-empty">No suggestion — nothing left that fits your roster.</p>
      )}

      <p className="mypick-needs">
        <span className="mypick-needs-label">Open:</span>{' '}
        {openLabels.length > 0 ? openLabels.join(', ') : 'starters full'}
        <span className="mypick-bench">
          Bench {roster.bench.length}/{rosterConfig.bench}
        </span>
      </p>

      <h3 className="mypick-head">Best available</h3>
      <div className="mypick-ba">
        {livePositions.map((pos) => {
          const player = best.get(pos) ?? null;
          const dim = filled.includes(pos);
          if (!player) {
            return (
              <div key={pos} className="mypick-line mypick-dim">
                <span className={`badge pos-${pos}`}>{pos}</span>
                <span className="mypick-none">none left</span>
              </div>
            );
          }
          return (
            <div key={pos} className={dim ? 'mypick-line mypick-dim' : 'mypick-line'}>
              <button
                type="button"
                className="mypick-line-main"
                onClick={() => onOpenPlayer(player)}
                aria-label={`Open ${player.name}`}
              >
                <span className={`badge pos-${pos}`}>{pos}</span>
                <span className="mypick-name">{player.name}</span>
                <span className="mypick-vor">{fmtNum(player.vor, 1)}</span>
                <span className="mypick-range">{range(player.floor, player.ceiling)}</span>
              </button>
              <button
                type="button"
                className="mypick-mine"
                onClick={() => onDraft(player, true)}
                aria-label={`Draft ${player.name} to my roster`}
              >
                Mine
              </button>
            </div>
          );
        })}
      </div>

      {watching.length > 0 && (
        <>
          <h3 className="mypick-head">Watching</h3>
          <div className="mypick-ba">
            {watching.map((player) => (
              <div key={player.id} className="mypick-line">
                <button
                  type="button"
                  className="mypick-line-main"
                  onClick={() => onOpenPlayer(player)}
                  aria-label={`Open ${player.name}`}
                >
                  <span className={`badge pos-${player.pos}`}>{player.pos}</span>
                  <span className="mypick-name">{player.name}</span>
                  <span className="mypick-vor">{fmtNum(player.vor, 1)}</span>
                </button>
                <button
                  type="button"
                  className="mypick-mine"
                  onClick={() => onDraft(player, true)}
                  aria-label={`Draft ${player.name} to my roster`}
                >
                  Mine
                </button>
                <button
                  type="button"
                  className="mypick-x"
                  onClick={() => onDraft(player, false)}
                  aria-label={`Remove ${player.name} — someone else took them`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

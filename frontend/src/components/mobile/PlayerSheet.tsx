import { buildTooltip } from '../../lib/context';
import type { Kpi, TeamMap } from '../../lib/context';
import { EM_DASH, fmtInt, fmtNum, fmtSigned, tierClass } from '../../lib/format';
import type { Player } from '../../types';
import { PlayerBadges } from '../PlayerName';
import Sheet from './Sheet';

interface Props {
  /** The sheet is open exactly when this is non-null. */
  player: Player | null;
  teams: TeamMap;
  byeCounts: Map<number, number>;
  starred: boolean;
  drafted: boolean;
  mine: boolean;
  onToggleStar: (player: Player) => void;
  onDraft: (player: Player, mine: boolean) => void;
  onUndo: (player: Player) => void;
  onClose: () => void;
}

/** Same tile markup as the desktop card; PlayerTooltip does not export it. */
function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{kpi.label}</span>
      <span className={`kpi-value${kpi.tone ? ` tone-${kpi.tone}` : ''}`}>{kpi.value}</span>
      {kpi.sub && <span className="kpi-sub">{kpi.sub}</span>}
    </div>
  );
}

/** Floor and ceiling are two numbers answering one question — one field (§6). */
function rangeText(floor: number | null, ceiling: number | null): string {
  if (floor === null && ceiling === null) return EM_DASH;
  return `${fmtInt(floor)}–${fmtInt(ceiling)}`;
}

/** `uncertainty` is a 0..1 share, printed as the board's whole percent. */
function pctText(value: number | null): string {
  return value === null ? EM_DASH : `${Math.round(value * 100)}%`;
}

/**
 * Every stat the 64px row had to drop, as a 2-column definition list
 * (docs/mobile-design.md §4, item 3).
 */
function droppedStats(player: Player): [string, string][] {
  return [
    ['Proj pts', fmtNum(player.points, 1)],
    ['SD pts', fmtNum(player.sd_pts, 1)],
    ['Floor–ceiling', rangeText(player.floor, player.ceiling)],
    ['Risk', pctText(player.uncertainty)],
    ['ADP', fmtNum(player.adp, 1)],
    ['ADP diff', fmtSigned(player.adp_diff, 1)],
    ['Dropoff', fmtNum(player.dropoff, 1)],
  ];
}

/**
 * The player context sheet (docs/mobile-design.md §4). Opened by a row-body
 * tap, a Best Available line, or the suggested strip.
 *
 * It renders the SAME `buildTooltip()` content model as the desktop hover card
 * — one context model, not two — through the existing `.ptip` building blocks
 * (`.ptip-sec`, `.ptip-kpis`, `.kpi`, `.ptip-callout`). Only the ORDER changes,
 * because a sheet is an action surface: callouts lead (plain English, no
 * cross-row comparison needed), then the stats the row dropped, then the KPI
 * groups. Actions live in a sticky footer at the bottom, in the thumb zone and
 * far from where a fast tap lands while the sheet animates in.
 */
export default function PlayerSheet({
  player,
  teams,
  byeCounts,
  starred,
  drafted,
  mine,
  onToggleStar,
  onDraft,
  onUndo,
  onClose,
}: Props) {
  if (player === null) return null;

  // Aliased so the null-narrowing survives into the button callbacks.
  const p = player;
  const content = buildTooltip(p, teams[p.team], byeCounts);
  const posRank = p.pos_rank === null ? null : `${p.pos}${Math.round(p.pos_rank)}`;

  // Acting closes the sheet: the action's whole point is the board underneath,
  // and a drafted player is no longer on it.
  function draft(asMine: boolean) {
    onDraft(p, asMine);
    onClose();
  }

  function undo() {
    onUndo(p);
    onClose();
  }

  const footer = drafted ? (
    <button type="button" className="btn psheet-act psheet-undo" onClick={undo}>
      ↩ Put back on the board
    </button>
  ) : (
    <>
      <button
        type="button"
        className="btn primary psheet-act psheet-mine"
        onClick={() => draft(true)}
      >
        Mine
      </button>
      <button type="button" className="btn psheet-act psheet-out" onClick={() => draft(false)}>
        ✕ Someone else took them
      </button>
    </>
  );

  return (
    <Sheet open title={p.name} onClose={onClose} footer={footer}>
      <div className="psheet">
        <div className="psheet-id">
          <span className={`badge pos-${p.pos}`}>{p.pos}</span>
          <span className={tierClass(p.tier)}>{p.tier ?? EM_DASH}</span>
          <span className="psheet-meta">
            {p.team}
            {posRank && ` · ${posRank}`}
          </span>
          <PlayerBadges player={p} />
          {mine && <span className="tag tag-mine">MINE</span>}
          <button
            type="button"
            className={starred ? 'psheet-star on' : 'psheet-star'}
            aria-pressed={starred}
            aria-label={starred ? `Unstar ${p.name}` : `Star ${p.name}`}
            onClick={() => onToggleStar(p)}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>

        {content && content.callouts.length > 0 && (
          <div className="psheet-callouts">
            {content.callouts.map((callout) => (
              <div key={callout.text} className={`ptip-callout tone-${callout.tone}`}>
                <span className="ptip-callout-icon" aria-hidden="true">
                  {callout.icon}
                </span>
                <span>{callout.text}</span>
              </div>
            ))}
          </div>
        )}

        <dl className="psheet-stats">
          {droppedStats(p).map(([label, value]) => (
            <div className="psheet-stat" key={label}>
              <dt className="psheet-dt">{label}</dt>
              <dd className="psheet-dd">{value}</dd>
            </div>
          ))}
        </dl>

        {content && content.kpis.length > 0 && (
          <>
            <div className="ptip-sec">Team</div>
            <div className="ptip-kpis">
              {content.kpis.map((kpi) => (
                <KpiTile key={kpi.label} kpi={kpi} />
              ))}
            </div>
          </>
        )}

        {content?.seasonLabel && <div className="ptip-sec">{content.seasonLabel}</div>}
        {content && content.season.length > 0 && (
          <div className="ptip-kpis season">
            {content.season.map((kpi) => (
              <KpiTile key={kpi.label} kpi={kpi} />
            ))}
          </div>
        )}
        {content?.rookieNote && <div className="ptip-none">{content.rookieNote}</div>}

        {content && content.market.length > 0 && (
          <>
            <div className="ptip-sec">Draft market</div>
            <div className="ptip-kpis market">
              {content.market.map((kpi) => (
                <KpiTile key={kpi.label} kpi={kpi} />
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

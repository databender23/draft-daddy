import type { CSSProperties } from 'react';
import type { Kpi, TooltipContent } from '../lib/context';

interface Props {
  content: TooltipContent;
  /** Fixed-position placement computed by the tooltip provider. */
  style: CSSProperties;
  id: string;
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{kpi.label}</span>
      <span className={`kpi-value${kpi.tone ? ` tone-${kpi.tone}` : ''}`}>{kpi.value}</span>
      {kpi.sub && <span className="kpi-sub">{kpi.sub}</span>}
    </div>
  );
}

/**
 * The shared player card: who it is, three team KPIs, last season's production
 * as KPIs, and plain-English callouts. Rendered once by TooltipProvider in a
 * fixed layer (pointer-events: none), never inside the table DOM.
 */
export default function PlayerTooltip({ content, style, id }: Props) {
  return (
    <div className="ptip" role="tooltip" id={id} style={style}>
      <div className="ptip-head">
        <span className={`badge pos-${content.header.pos}`}>{content.header.pos}</span>
        <span className="ptip-name">{content.header.name}</span>
        <span className="ptip-team">
          {content.header.team}
          {content.header.posRank && ` · ${content.header.posRank}`}
        </span>
      </div>

      <div className="ptip-body">
        <div className="ptip-col">
          {content.kpis.length > 0 && (
            <div className="ptip-kpis">
              {content.kpis.map((kpi) => (
                <KpiTile key={kpi.label} kpi={kpi} />
              ))}
            </div>
          )}
          {content.seasonLabel && <div className="ptip-sec">{content.seasonLabel}</div>}
          {content.season.length > 0 && (
            <div className="ptip-kpis season">
              {content.season.map((kpi) => (
                <KpiTile key={kpi.label} kpi={kpi} />
              ))}
            </div>
          )}
          {content.rookieNote && <div className="ptip-none">{content.rookieNote}</div>}
        </div>

        <div className="ptip-col">
          {content.market.length > 0 && (
            <>
              <div className="ptip-sec market-sec">Draft market</div>
              <div className="ptip-kpis market">
                {content.market.map((kpi) => (
                  <KpiTile key={kpi.label} kpi={kpi} />
                ))}
              </div>
            </>
          )}
          {content.callouts.map((callout) => (
            <div key={callout.text} className={`ptip-callout tone-${callout.tone}`}>
              <span className="ptip-callout-icon" aria-hidden="true">
                {callout.icon}
              </span>
              <span>{callout.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

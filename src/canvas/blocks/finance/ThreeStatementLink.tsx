import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { ThreeStatementLinkProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { useHostWidth } from '../../lib/useBoxSize';
import { linkRoutes } from './linkRoutes';

type Props = ThreeStatementLinkProps & { delay?: number };

const ROW_H = 24;
const HEADER_H = 40;
/** Half the space between two panels — mirrors the panels' inner padding in styles.css. */
const GUTTER = 14;

/** Accountant's convention — a negative in parentheses, no minus sign. */
function money(v: number, currency: string): string {
  const text = formatValue(Math.abs(v), { currency, decimals: 0 });
  return v < 0 ? `(${text})` : text;
}

// Three FinancialStatement-style panels side by side (its indent/bold/parens-negative row
// rendering, rebuilt as CSS here rather than imported — a different prop shape), with connectors
// showing where a line on one statement feeds another. Connectors run ONLY through space that holds
// no figures: the gutters between panels and a lane across the top of the header row. A link to
// the adjacent panel bends inside the gutter; one that skips a panel climbs its gutter, crosses
// above the skipped panel's name, and drops into the target's. A curve drawn straight across a
// panel ran through its rows, and a label pill set mid-curve sat on top of the figures. Each link
// carries a numbered badge on its own path, keyed to a caption list under the panels.
// Row height is fixed rather than measured, so a connector's endpoint is exact from the row's
// index alone; x comes from the measured width, so the drawing is in real pixels.
export function ThreeStatementLink({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  period,
  statements,
  links = [],
  currency = 'USD',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const panels = statements.slice(0, 3);
  const [wrapRef, hostW] = useHostWidth<HTMLDivElement>();

  const model = useMemo(() => {
    const maxRows = Math.max(1, ...panels.map((p) => p.rows.length));
    const totalH = HEADER_H + maxRows * ROW_H;
    const routes = linkRoutes(
      panels.map((p) => p.rows.map((r) => r.label)),
      links,
      { width: hostW || 480, gutter: GUTTER, headerH: HEADER_H, rowH: ROW_H },
    );
    return { totalH, routes };
  }, [panels, links, hostW]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow" style={{ marginBottom: 4 }}>
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="fin-tl-cap faint">{period}</div>

      {/* The scroller wraps the whole model — panels AND the connector overlay, which is positioned
          against .fin-tl-wrap — so the curves stay pinned to the panels they link when it pans. */}
      <div className="fin-tl-scroll">
        <div
          ref={wrapRef}
          className="fin-tl-wrap"
          style={
            {
              height: model.totalH,
              ['--fin-tl-panels' as string]: panels.length,
            } as CSSProperties
          }
        >
          <div className="fin-tl-panels">
            {panels.map((p, pi) => (
              <div className="fin-tl-panel" key={pi}>
                <div className="fin-tl-panel-name">{p.name}</div>
                <div className="fin-tl-rows">
                  {p.rows.map((r, ri) => {
                    const indent = Math.max(0, r.indent || 0);
                    return (
                      <div
                        className={'fin-tl-row' + (r.bold ? ' bold' : '')}
                        key={ri}
                        style={{ height: ROW_H }}
                      >
                        <span
                          className="fin-tl-label"
                          style={{ paddingLeft: 4 + indent * 12 }}
                          title={r.label}
                        >
                          {r.label}
                        </span>
                        <span className={'fin-tl-val tab-num' + (r.value < 0 ? ' neg' : '')}>
                          {money(r.value, currency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {model.routes.length > 0 && (
            <svg
              className="fin-tl-links"
              viewBox={`0 0 ${hostW || 480} ${model.totalH}`}
              aria-hidden="true"
            >
              {model.routes.map((r, i) => (
                <g key={r.key}>
                  <path d={r.d} className="fin-tl-link" />
                  <polygon points={r.arrow} className="fin-tl-arrow" />
                  <circle cx={r.badge.x} cy={r.badge.y} r={7} className="fin-tl-badge" />
                  <text x={r.badge.x} y={r.badge.y} className="fin-tl-badge-n">
                    {i + 1}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      {model.routes.length > 0 && (
        <ol className="fin-tl-key">
          {model.routes.map((r, i) => (
            <li key={r.key}>
              <span className="fin-tl-key-n">{i + 1}</span>
              <span>
                <b>{r.from}</b> → <b>{r.to}</b>
                {r.label && <span className="faint"> · {r.label}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

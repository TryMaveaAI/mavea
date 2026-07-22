import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { ThreeStatementLinkProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ThreeStatementLinkProps & { delay?: number };

const ROW_H = 24;
const HEADER_H = 40;

/** Accountant's convention — a negative in parentheses, no minus sign. */
function money(v: number, currency: string): string {
  const text = formatValue(Math.abs(v), { currency, decimals: 0 });
  return v < 0 ? `(${text})` : text;
}

/** Find the first row matching `label` at or after panel index `from` (inclusive). */
function locate(
  statements: readonly { rows: readonly { label: string }[] }[],
  label: string,
  from = 0,
) {
  for (let p = from; p < statements.length; p++) {
    const idx = statements[p].rows.findIndex((r) => r.label === label);
    if (idx >= 0) return { panel: p, row: idx };
  }
  return null;
}

// Three FinancialStatement-style panels side by side (its indent/bold/parens-negative row
// rendering, rebuilt as CSS here rather than imported — a different prop shape) with a couple
// of curved connectors — Sankey's link-curve technique, scoped down to 2-3 arrows rather than a
// full flow diagram — crossing the gaps to show where a line on one statement feeds another.
// Row height is fixed rather than measured, so a connector's endpoint is exact from the row's
// index alone: X is percentage (responsive, via preserveAspectRatio="none"), Y is real pixels.
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

  const model = useMemo(() => {
    const maxRows = Math.max(1, ...panels.map((p) => p.rows.length));
    const totalH = HEADER_H + maxRows * ROW_H;
    const panelW = 100 / Math.max(1, panels.length);
    const rowY = (row: number) => HEADER_H + (row + 0.5) * ROW_H;

    // The arrowhead is a hand-drawn triangle in this same mixed coordinate space rather than an
    // SVG <marker> — a marker's own geometry doesn't correctly follow a viewBox this lopsided
    // (X in percentage-of-width units, Y in real pixels via preserveAspectRatio="none"), so it
    // would render visibly skewed. A flow always runs left→right into a later panel, so the
    // triangle only ever needs to point in +X — no rotation math to get wrong.
    const ARROW_W = 1.6; // in the same 0..100 X units as the curve
    const ARROW_H = 6; // real px, same space as the curve's Y
    const curves = links
      .map((l) => {
        const a = locate(panels, l.from, 0);
        if (!a) return null;
        const b = locate(panels, l.to, a.panel + 1);
        if (!b) return null;
        const x0 = (a.panel + 1) * panelW;
        const x1 = b.panel * panelW;
        const y0 = rowY(a.row);
        const y1 = rowY(b.row);
        const mx = (x0 + x1) / 2;
        const tipX = x1;
        const baseX = x1 - ARROW_W;
        return {
          key: `${l.from}->${l.to}`,
          label: l.label,
          d: `M${x0} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${baseX} ${y1}`,
          arrow: `${tipX},${y1} ${baseX},${y1 - ARROW_H / 2} ${baseX},${y1 + ARROW_H / 2}`,
          lx: mx,
          ly: (y0 + y1) / 2,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return { totalH, panelW, curves };
  }, [panels, links]);

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

          {model.curves.length > 0 && (
            <svg
              className="fin-tl-links"
              viewBox={`0 0 100 ${model.totalH}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {model.curves.map((c) => (
                <g key={c.key} opacity={0.65}>
                  <path
                    d={c.d}
                    fill="none"
                    stroke="var(--presence)"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <polygon points={c.arrow} fill="var(--presence)" />
                </g>
              ))}
            </svg>
          )}
          <div className="fin-tl-link-labels">
            {model.curves.map((c) => (
              <span
                key={c.key}
                className="fin-tl-link-lbl"
                style={{ left: `${c.lx}%`, top: `${c.ly}px` }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

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

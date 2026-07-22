// Dot plot — each observation in `values` becomes one dot stacked above a number
// line. The canonical way to show small discrete distributions (test scores, ages,
// survey answers) without hiding individual data points behind bins or bars.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, niceStep, ticks, scaleLinear } from '../../lib/scale';
import type { DotPlotProps } from './types';

type Props = DotPlotProps & { delay?: number };

// Radius of each dot in SVG units.
const R = 5;
// Vertical gap between stacked dots (center-to-center = 2R + gap).
const DOT_PITCH = R * 2 + 1;
// Vertical offset from a stack's topmost dot center up to the hover "×N" badge's top edge
// (rect sits 16 above the dot center) plus the badge's own height, so the badge never floats
// above y=0 regardless of how tall the tallest stack grows.
const BADGE_CLEARANCE = 16 + 15;

/** Group raw values into stacks: { value → count } keeping insertion order by value. */
function buildStacks(values: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  // Sort numerically so stacks appear in x order; matching values combine.
  const sorted = [...values].sort((a, b) => a - b);
  for (const v of sorted) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

export function DotPlot({
  title,
  values,
  label,
  color = 'var(--presence)',
  note,
  sub,
  delay,
}: Props) {
  const [hot, setHot] = useState<number | null>(null);

  const stacks = useMemo(() => buildStacks(values), [values]);

  // SVG geometry — computed once; the viewBox drives responsive scaling.
  const geo = useMemo(() => {
    if (values.length === 0) return null;

    const ext = extent(values);
    if (!ext) return null;
    const [rawMin, rawMax] = ext;

    // Nice domain that pads outward so the outermost dots don't clip at the edge.
    const [dMin, dMax] = niceDomain(rawMin, rawMax, 5);

    // Margin layout (SVG units).
    const ml = 28; // left — space for y-axis tick labels
    const mr = 16; // right

    // Find tallest stack to set the height.
    const maxCount = Math.max(...stacks.values());
    const stackHeight = maxCount * DOT_PITCH;
    // Top margin must fit the hover badge above the tallest stack's topmost dot. The badge
    // is positioned BADGE_CLEARANCE above that dot's center regardless of how many dots are
    // stacked beneath it — so a margin sized only for the base case (no badge) always leaves
    // the badge floating above y=0 once any stack reaches 2+ dots, bleeding out of the card
    // on a tall enough stack. Reserve the badge's own headroom whenever one can appear.
    const mt = maxCount >= 2 ? R + BADGE_CLEARANCE + 4 : 12;

    const mb = 32; // bottom — axis line + ticks + label
    const svgH = mt + stackHeight + mb;
    const svgW = 520; // logical width; height/width ratio drives actual render size

    const xScale = scaleLinear([dMin, dMax], [ml, svgW - mr]);
    const axY = mt + stackHeight; // y coordinate of the axis baseline

    // Tick values — prefer ~5 ticks but never more than 8.
    const step = niceStep(dMax - dMin, Math.min(stacks.size, 6));
    const tickVals = ticks(dMin, dMax, step);

    return { svgW, svgH, xScale, axY, tickVals, maxCount, ml, mr, mt, mb };
  }, [values, stacks]);

  if (values.length === 0 || !geo) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Icon.chart className="ic" /> {title}
        </div>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          No data.
        </p>
      </div>
    );
  }

  const { svgW, svgH, xScale, axY, tickVals, ml, mr } = geo;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Icon.chart className="ic" /> {title}
      </div>
      {sub && <p className="ch2-dp-sub">{sub}</p>}

      <div className="ch2-dp-wrap">
        <svg
          role="img"
          className="ch2-dp-svg"
          viewBox={`0 0 ${svgW} ${svgH}`}
          width="100%"
          aria-label={title}
        >
          {/* Axis baseline */}
          <line x1={ml} y1={axY} x2={svgW - mr} y2={axY} className="ch2-dp-axis" />

          {/* X-axis ticks + labels */}
          {tickVals.map((t) => {
            const x = xScale(t);
            return (
              <g key={t}>
                <line x1={x} y1={axY} x2={x} y2={axY + 5} className="ch2-dp-tick-line" />
                <text x={x} y={axY + 16} textAnchor="middle" className="ch2-dp-tick-lbl">
                  {t}
                </text>
              </g>
            );
          })}

          {/* X-axis label */}
          {label && (
            <text
              x={(ml + svgW - mr) / 2}
              y={svgH - 4}
              textAnchor="middle"
              className="ch2-dp-axis-lbl"
            >
              {label}
            </text>
          )}

          {/* Dot stacks — one column per unique value */}
          {Array.from(stacks.entries()).map(([val, count]) => {
            const cx = xScale(val);
            const isHot = hot === val;

            return (
              <g
                key={val}
                onMouseEnter={() => setHot(val)}
                onMouseLeave={() => setHot(null)}
                style={{ cursor: 'default' }}
              >
                {Array.from({ length: count }, (_, i) => {
                  // Stack bottom-up: i=0 is closest to the axis.
                  const cy = axY - R - i * DOT_PITCH;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={R}
                      className="ch2-dp-dot"
                      style={{ fill: color, opacity: isHot ? 1 : 0.82 }}
                    />
                  );
                })}

                {/* Count badge when hovered and stack is tall enough to matter */}
                {isHot && count >= 2 && (
                  <g>
                    <rect
                      x={cx - 14}
                      y={axY - count * DOT_PITCH - R - 16}
                      width={28}
                      height={15}
                      rx={4}
                      className="ch2-dp-badge-bg"
                    />
                    <text
                      x={cx}
                      y={axY - count * DOT_PITCH - R - 5}
                      textAnchor="middle"
                      className="ch2-dp-badge-txt"
                    >
                      ×{count}
                    </text>
                  </g>
                )}

                {/* Value label on hover for single-dot columns too */}
                {isHot && (
                  <text
                    x={cx}
                    y={axY + 28}
                    textAnchor="middle"
                    className="ch2-dp-val-lbl"
                    style={{ fill: color }}
                  >
                    {val}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {note && <p className="ch2-dp-note">{note}</p>}
    </div>
  );
}

// Error-bar chart — group means with their uncertainty. Each group is a point (or bar)
// carrying a whisker for its confidence interval: either symmetric (mean ± ci) or an
// explicit [low, high]. The #1 inferential-statistics graphic — "do these groups differ?" —
// and the standard way to report lab/experiment results. Optional reference line and a
// significance bracket annotating a contrast between two groups.
//
// Geometry is computed from the data: the categorical x-axis is evenly slotted, and the
// continuous y-axis is built with scale.ts (niceDomain → round ticks + gridlines), so a
// given value always lands at the correct height and the diagram is honest in any theme.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, niceStep, ticks, scaleLinear } from '../../lib/scale';
import type { ErrorBarsProps, ErrorGroup } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ErrorBarsProps & { delay?: number };

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

// SVG logical canvas — viewBox only; CSS sizes it responsively and caps the height.
const W = 480;
const H = 270;
const M = { top: 18, right: 18, bottom: 46, left: 52 };

// .erb-xtick is 10px/600 — roughly 5.7px per character. A label wider than its own slot
// collides with its neighbors once a demo-sized fixture (4-6 groups) grows past that, so clip
// it to whatever the slot can actually hold and keep the untruncated string as a native
// <title> tooltip — same idiom as charts2/DualAxis's and charts2/IndifferenceCurve's axis labels.
const XTICK_CHAR_W = 5.7;

function truncateToWidth(label: string, slotW: number): string {
  const max = Math.max(1, Math.floor(slotW / XTICK_CHAR_W));
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…` : label;
}

/** Resolve a group's interval to absolute [low, high] around its mean, from either
 *  an explicit low/high or a symmetric ±ci. Returns null when no uncertainty is given. */
function interval(g: ErrorGroup): [number, number] | null {
  if (typeof g.low === 'number' && typeof g.high === 'number') {
    return [Math.min(g.low, g.high), Math.max(g.low, g.high)];
  }
  if (typeof g.ci === 'number' && g.ci > 0) {
    return [g.mean - g.ci, g.mean + g.ci];
  }
  return null;
}

export function ErrorBars({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  groups,
  unit = '',
  yLabel,
  bars = false,
  reference,
  bracket,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const fmt = (v: number) => {
    const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
    return unit ? `${r}${unit}` : `${r}`;
  };

  const geo = useMemo(() => {
    // Y-domain must span every mean AND every whisker end (and the reference, if any),
    // so no interval clips off the top/bottom of the plot.
    const vals: number[] = [];
    for (const g of groups) {
      vals.push(g.mean);
      const iv = interval(g);
      if (iv) vals.push(iv[0], iv[1]);
    }
    if (typeof reference?.value === 'number') vals.push(reference.value);
    // Bars are read against a baseline, so include 0 in the domain when drawing bars.
    if (bars) vals.push(0);

    const ext = extent(vals) ?? [0, 1];
    const [yMin, yMax] = niceDomain(ext[0], ext[1], 5);

    const sy = scaleLinear([yMin, yMax], [M.top + innerH, M.top]);
    const step = niceStep(yMax - yMin, 5);
    const yTicks = ticks(yMin, yMax, step);

    // Even categorical slots across the band; each group sits at its slot center.
    const n = Math.max(groups.length, 1);
    const slot = innerW / n;
    const cx = (i: number) => M.left + slot * (i + 0.5);

    // Whisker cap half-width and bar half-width scale to the slot but stay bounded.
    const cap = Math.min(14, slot * 0.22);
    const barHalf = Math.min(26, slot * 0.3);
    const yZero = sy(0);

    return { yMin, yMax, sy, yTicks, slot, cx, cap, barHalf, yZero };
  }, [groups, reference, bars, innerW, innerH]);

  const { sy, yTicks, cx, cap, barHalf, yZero } = geo;

  if (groups.length === 0) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          No groups.
        </p>
      </div>
    );
  }

  // Significance bracket geometry — spans the two named groups, drawn above the higher of
  // their whisker tops so it never collides with the data.
  const brk = (() => {
    if (!bracket) return null;
    const a = Math.min(bracket.from, bracket.to);
    const b = Math.max(bracket.from, bracket.to);
    if (a < 0 || b >= groups.length || a === b) return null;
    const x1 = cx(a);
    const x2 = cx(b);
    let topY = M.top + innerH;
    for (let i = a; i <= b; i++) {
      const iv = interval(groups[i]);
      topY = Math.min(topY, sy(iv ? iv[1] : groups[i].mean), sy(groups[i].mean));
    }
    const y = Math.max(M.top + 8, topY - 14);
    return { x1, x2, y, label: bracket.label };
  })();

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="erb-wrap" onMouseLeave={() => setHot(null)}>
        <svg
          role="img"
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="erb-svg"
          aria-label={title}
        >
          {/* Y gridlines + tick labels */}
          {yTicks.map((t) => {
            const y = sy(t);
            return (
              <g key={`y${t}`}>
                <line className="erb-grid" x1={M.left} y1={y} x2={W - M.right} y2={y} />
                <text className="erb-ytick" x={M.left - 8} y={y + 3.5} textAnchor="end">
                  {fmt(t)}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line className="erb-axis" x1={M.left} y1={M.top} x2={M.left} y2={M.top + innerH} />
          <line
            className="erb-axis"
            x1={M.left}
            y1={M.top + innerH}
            x2={W - M.right}
            y2={M.top + innerH}
          />

          {/* Y-axis label, upright via translate+rotate */}
          {yLabel && (
            <text
              className="erb-ylabel"
              x={0}
              y={0}
              transform={`translate(${M.left - 38},${M.top + innerH / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              {yLabel}
            </text>
          )}

          {/* Optional reference line (e.g. a target, baseline, or population mean) */}
          {typeof reference?.value === 'number' && (
            <g>
              <line
                className="erb-ref"
                x1={M.left}
                y1={sy(reference.value)}
                x2={W - M.right}
                y2={sy(reference.value)}
              />
              {reference.label && (
                <text
                  className="erb-ref-lbl"
                  x={W - M.right - 2}
                  y={sy(reference.value) - 4}
                  textAnchor="end"
                >
                  {reference.label}
                </text>
              )}
            </g>
          )}

          {/* Groups: bar or point, each with its CI whisker */}
          {groups.map((g, i) => {
            const x = cx(i);
            const color = g.color || PALETTE[i % PALETTE.length];
            const yMean = sy(g.mean);
            const iv = interval(g);
            const isHot = hot === i;

            return (
              <g key={i} onMouseEnter={() => setHot(i)} style={{ cursor: 'default' }}>
                {/* Wide transparent hit area for hover */}
                <rect
                  x={x - geo.slot / 2}
                  y={M.top}
                  width={geo.slot}
                  height={innerH}
                  fill="transparent"
                />

                {bars && (
                  <rect
                    className="erb-bar"
                    x={x - barHalf}
                    y={Math.min(yMean, yZero)}
                    width={barHalf * 2}
                    height={Math.abs(yZero - yMean)}
                    style={{ fill: color, opacity: isHot ? 0.34 : 0.22 }}
                  />
                )}

                {/* CI whisker: vertical line with end caps */}
                {iv && (
                  <g className="erb-whisk" style={{ stroke: color }}>
                    <line x1={x} y1={sy(iv[0])} x2={x} y2={sy(iv[1])} />
                    <line x1={x - cap} y1={sy(iv[1])} x2={x + cap} y2={sy(iv[1])} />
                    <line x1={x - cap} y1={sy(iv[0])} x2={x + cap} y2={sy(iv[0])} />
                  </g>
                )}

                {/* Mean marker — a filled point sitting on the whisker */}
                <circle
                  className="erb-pt"
                  cx={x}
                  cy={yMean}
                  r={isHot ? 5.5 : 4.5}
                  style={{ fill: color }}
                />

                {/* X-axis category label — truncated to the slot's width so dense groups
                    (6+ items, or long names) never collide into their neighbors; the full
                    label still reads via the native tooltip. */}
                <text className="erb-xtick" x={x} y={M.top + innerH + 16} textAnchor="middle">
                  {g.label.length > Math.floor(geo.slot / XTICK_CHAR_W) && <title>{g.label}</title>}
                  {truncateToWidth(g.label, geo.slot)}
                </text>
              </g>
            );
          })}

          {/* Hover readout: mean and interval for the hot group. Pinned to a fixed spot at
              the top of the plot (not the hot point's own x/y) so it can never collide with a
              neighboring whisker or point once groups sit close together in a narrow slot —
              same "fixed location, not a following tooltip" fix as charts1/TamSam's center
              readout and charts1/Treemap's summary line. */}
          {hot != null &&
            (() => {
              const g = groups[hot];
              const iv = interval(g);
              const color = g.color || PALETTE[hot % PALETTE.length];
              const tipX = M.left + innerW / 2;
              return (
                <g className="erb-tip">
                  <text
                    className="erb-tip-mean"
                    x={tipX}
                    y={M.top + 12}
                    textAnchor="middle"
                    style={{ fill: color }}
                  >
                    {g.label}: {fmt(g.mean)}
                    {iv ? ` (${fmt(iv[0])}–${fmt(iv[1])})` : ''}
                  </text>
                </g>
              );
            })()}

          {/* Significance bracket between two groups */}
          {brk && (
            <g className="erb-brk">
              <path
                d={`M ${brk.x1} ${brk.y + 6} L ${brk.x1} ${brk.y} L ${brk.x2} ${brk.y} L ${brk.x2} ${brk.y + 6}`}
              />
              <text x={(brk.x1 + brk.x2) / 2} y={brk.y - 4} textAnchor="middle">
                {brk.label}
              </text>
            </g>
          )}
        </svg>
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

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { PlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PlotProps & { delay?: number };

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];
const MK_CHAR_W = 5.2; // approx glyph width in viewBox units for the 9px semibold marker label
const MK_LABEL_MAX_CHARS = 26; // longest a marker label can render before it's ellipsised

/** A marker's free-text label, ellipsised once it's long enough to risk crowding the plot. */
function truncateMarkerLabel(text: string): string {
  return text.length > MK_LABEL_MAX_CHARS
    ? `${text.slice(0, MK_LABEL_MAX_CHARS - 1).trimEnd()}…`
    : text;
}

/** Estimated rendered width of a marker's (already-truncated) label. */
function markerLabelWidth(text: string): number {
  return text.length * MK_CHAR_W;
}

// Cartesian plotter for STEM: functions, growth curves, transformations — anything that
// lives on an x/y plane. Curves arrive pre-sampled (the caller turns f(x) into points), so
// nothing here evaluates an expression. Axes pass through the origin when it's in view,
// with round-number gridlines; domains auto-fit the data when not given.
export function Plot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  curves,
  markers = [],
  origin = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const W = 320;
  const H = 220;
  const padL = 30;
  const padR = 40;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const geom = useMemo(() => {
    const xs = curves.flatMap((c) => c.points.map((p) => p.x)).concat(markers.map((m) => m.x));
    const ys = curves.flatMap((c) => c.points.map((p) => p.y)).concat(markers.map((m) => m.y));
    const pad = (lo: number, hi: number) => {
      if (lo === hi) return [lo - 1, hi + 1] as const;
      const m = (hi - lo) * 0.06;
      return [lo - m, hi + m] as const;
    };
    const [xmin, xmax] = xDomain ?? pad(Math.min(...xs, 0), Math.max(...xs, 0));
    const [ymin, ymax] = yDomain ?? pad(Math.min(...ys, 0), Math.max(...ys, 0));
    const sx = (x: number) => padL + ((x - xmin) / (xmax - xmin || 1)) * plotW;
    const sy = (y: number) => padT + (1 - (y - ymin) / (ymax - ymin || 1)) * plotH;
    const axisX = origin && ymin <= 0 && ymax >= 0 ? sy(0) : padT + plotH; // horizontal axis
    const axisY = origin && xmin <= 0 && xmax >= 0 ? sx(0) : padL; // vertical axis
    return {
      xmin,
      xmax,
      ymin,
      ymax,
      sx,
      sy,
      axisX,
      axisY,
      xticks: ticks(xmin, xmax, niceStep(xmax - xmin)),
      yticks: ticks(ymin, ymax, niceStep(ymax - ymin)),
    };
  }, [curves, markers, xDomain, yDomain, origin, plotW, plotH]);

  const { sx, sy, axisX, axisY, xticks, yticks } = geom;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c2-plot" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c2-plot-svg" role="img">
          {/* gridlines + tick labels */}
          {xticks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={padT} x2={sx(t)} y2={padT + plotH} className="c2-plot-grid" />
              <text x={sx(t)} y={padT + plotH + 12} className="c2-plot-tick" textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {yticks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={padL} y1={sy(t)} x2={padL + plotW} y2={sy(t)} className="c2-plot-grid" />
              <text x={padL - 4} y={sy(t) + 3} className="c2-plot-tick" textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {/* axes */}
          <line x1={padL} y1={axisX} x2={padL + plotW} y2={axisX} className="c2-plot-axis" />
          <line x1={axisY} y1={padT} x2={axisY} y2={padT + plotH} className="c2-plot-axis" />

          {/* curves */}
          {curves.map((c, ci) => {
            const col = c.color || PALETTE[ci % PALETTE.length];
            const active = hot === ci;
            const dim = hot !== null && !active;
            const pts = c.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');
            return (
              <polyline
                key={ci}
                points={pts}
                fill="none"
                stroke={col}
                strokeWidth={active ? 3 : 2}
                strokeDasharray={c.dashed ? '5 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ opacity: dim ? 0.2 : 1, transition: 'opacity var(--m-fast)' }}
                onMouseEnter={() => setHot(ci)}
              />
            );
          })}

          {/* markers — the first is the model's own called-out point, so Mavéa's drawn
              gesture (the live annotation layer) arrows at it while talking */}
          {markers.map((m, i) => {
            const mx = sx(m.x);
            const my = sy(m.y);
            // A start-anchored label growing rightward from mx+5 bled past the viewBox once
            // the point sat near the right edge, with no limit on how long the label could be.
            // Ellipsise first so a single pathological label can never outgrow the plot's own
            // width, then pick whichever side of the point has more room and clamp the anchor
            // itself so the rendered text — anchor +/- its estimated width — stays inside the
            // inner padding regardless of which edge the point is near.
            const label = m.label ? truncateMarkerLabel(m.label) : '';
            const labelW = markerLabelWidth(label);
            const roomRight = W - padR - mx;
            const roomLeft = mx - padL;
            const anchor: 'start' | 'end' = roomRight >= roomLeft ? 'start' : 'end';
            const labelX =
              anchor === 'start'
                ? Math.min(mx + 5, W - padR - labelW)
                : Math.max(mx - 5, padL + labelW);
            const labelY = Math.max(padT + 8, my - 5);
            return (
              <g key={`m${i}`}>
                <circle
                  cx={mx}
                  cy={my}
                  r={3.2}
                  fill={m.color || 'var(--text-primary)'}
                  data-mark={i === 0 ? 'point' : undefined}
                />
                {m.label && (
                  <text x={labelX} y={labelY} textAnchor={anchor} className="c2-plot-mk">
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* axis labels */}
          {xLabel && (
            <text x={padL + plotW} y={padT + plotH + 12} className="c2-plot-axlbl" textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={padL + 2} y={padT - 2} className="c2-plot-axlbl" textAnchor="start">
              {yLabel}
            </text>
          )}
        </svg>
      </div>

      {curves.length > 1 && (
        <div className="c2-plot-legend">
          {curves.map((c, ci) => (
            <button
              key={ci}
              className={'c2-plot-leg' + (hot === ci ? ' on' : '')}
              onMouseEnter={() => setHot(ci)}
              onMouseLeave={() => setHot(null)}
            >
              <i style={{ background: c.color || PALETTE[ci % PALETTE.length] }} />
              {c.label}
            </button>
          ))}
        </div>
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

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PolarPlotProps, PolarCurve } from './types';
import { makeEval1 as makeEvaluator } from './mathExpr';
import { richInnerHtml } from '../../../lib/richText';

type Props = PolarPlotProps & { delay?: number };

const W = 300;
const H = 280;
const CX = 150;
const CY = 140;
const MAX_R = 120;

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

// Precomputed grid geometry — constant across all instances.
const RING_FRACTIONS = [0.25, 0.5, 0.75, 1.0];
const RADIAL_ANGLES = Array.from({ length: 12 }, (_, i) => (i * 30 * Math.PI) / 180);

// Angle label positions just outside the outer ring at the 4 compass points.
// textAnchor typed as SVGTextElement['textAnchor'] is a string, so we keep them literal.
const ANGLE_LABELS = [
  { x: CX + MAX_R + 13, y: CY + 4, text: '0', anchor: 'start' },
  { x: CX, y: CY - MAX_R - 7, text: 'π/2', anchor: 'middle' },
  { x: CX - MAX_R - 13, y: CY + 4, text: 'π', anchor: 'end' },
  { x: CX, y: CY + MAX_R + 14, text: '3π/2', anchor: 'middle' },
] as const;

interface CurvePath {
  points: string;
  /** The same points as numbers, for placing the scale label clear of the curves. */
  xy: [number, number][];
  color: string;
  label?: string;
}

interface CurveSet {
  paths: CurvePath[];
  /** The data value the outer ring stands for: every curve is scaled so this reaches MAX_R. */
  extent: number;
}

function buildPolarPaths(crvs: PolarCurve[], tMin: number, tMax: number): CurveSet {
  const N = 300;
  const evaluators = crvs.map((c) => makeEvaluator(c.fn));

  // Two-pass: first scan to find the maximum |r| so all curves share one scale.
  let maxAbsR = 0;
  for (const ev of evaluators) {
    if (!ev) continue;
    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin);
      try {
        const r = ev(t);
        if (Number.isFinite(r) && Math.abs(r) > maxAbsR) maxAbsR = Math.abs(r);
      } catch {
        // non-finite point — skip
      }
    }
  }
  if (maxAbsR === 0) maxAbsR = 1;

  const paths = crvs.map((curve, ci) => {
    const ev = evaluators[ci];
    if (!ev) return { points: '', xy: [], color: PALETTE[ci % PALETTE.length] };

    const pts: string[] = [];
    const xy: [number, number][] = [];

    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin);
      try {
        const r = ev(t);
        if (Number.isFinite(r)) {
          // Negative r is valid in polar coords — it lands on the opposite side.
          const x = CX + (r / maxAbsR) * MAX_R * Math.cos(t);
          const y = CY - (r / maxAbsR) * MAX_R * Math.sin(t);
          pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
          xy.push([x, y]);
        }
      } catch {
        // non-finite point — skip
      }
    }

    return {
      points: pts.join(' '),
      xy,
      color: curve.color ?? PALETTE[ci % PALETTE.length],
      label: curve.label,
    };
  });
  return { paths, extent: maxAbsR };
}

function buildParametricPaths(crvs: PolarCurve[], tMin: number, tMax: number): CurveSet {
  const N = 300;

  // Parse each fn into separate x(t) and y(t) evaluators by splitting on the first comma.
  const parsed = crvs.map((curve) => {
    const commaIdx = curve.fn.indexOf(',');
    if (commaIdx === -1) return null;
    const xEval = makeEvaluator(curve.fn.slice(0, commaIdx).trim());
    const yEval = makeEvaluator(curve.fn.slice(commaIdx + 1).trim());
    if (!xEval || !yEval) return null;

    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= N; i++) {
      const t = tMin + (i / N) * (tMax - tMin);
      try {
        const x = xEval(t);
        const y = yEval(t);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
      } catch {
        // non-finite point — skip
      }
    }
    return pts;
  });

  // Find the largest |coord| across all curves to scale everything into MAX_R.
  let maxExtent = 0;
  for (const pts of parsed) {
    if (!pts) continue;
    for (const p of pts) {
      const v = Math.max(Math.abs(p.x), Math.abs(p.y));
      if (v > maxExtent) maxExtent = v;
    }
  }
  if (maxExtent === 0) maxExtent = 1;
  const scale = MAX_R / maxExtent;

  const paths = crvs.map((curve, ci) => {
    const pts = parsed[ci];
    if (!pts || pts.length === 0) {
      return { points: '', xy: [], color: PALETTE[ci % PALETTE.length] };
    }

    // y is inverted: positive data-y maps upward in SVG
    const xy = pts.map((p): [number, number] => [CX + p.x * scale, CY - p.y * scale]);

    return {
      points: xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
      xy,
      color: curve.color ?? PALETTE[ci % PALETTE.length],
      label: curve.label,
    };
  });
  return { paths, extent: maxExtent };
}

/** Clear of the spokes, so the label sits between two of them. */
const SCALE_LABEL_ANGLES = Array.from({ length: 12 }, (_, i) => 15 + i * 30);
const SCALE_LABEL_R = MAX_R - 9;

/**
 * Where the outer ring's value is written: on the ring, in the direction the curves leave
 * emptiest. A fixed spot at 0° lands on whatever the curve does there — a rose's petal tip, a
 * cardioid's widest point — and those reach the outer ring by construction.
 */
function scaleLabelAngle(paths: readonly CurvePath[]): number {
  const crowding = (deg: number) => {
    let hits = 0;
    for (const path of paths) {
      for (const [x, y] of path.xy) {
        const dx = x - CX;
        const dy = CY - y;
        if (Math.hypot(dx, dy) < MAX_R * 0.6) continue;
        const off = Math.abs((((Math.atan2(dy, dx) * 180) / Math.PI - deg + 540) % 360) - 180);
        if (off < 12) hits++;
      }
    }
    return hits;
  };
  let best = SCALE_LABEL_ANGLES[0];
  let bestHits = Infinity;
  for (const deg of SCALE_LABEL_ANGLES) {
    const hits = crowding(deg);
    if (hits < bestHits) {
      best = deg;
      bestHits = hits;
    }
  }
  return best;
}

/** Three significant figures, without trailing zeros. */
const formatExtent = (v: number) => String(Number(v.toPrecision(3)));

export function PolarPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  type = 'polar',
  fn,
  curves,
  domain,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const { paths: curvePaths, extent } = useMemo((): CurveSet => {
    const crvs = curves ?? (fn ? [{ fn }] : []);
    if (crvs.length === 0) return { paths: [], extent: 1 };
    const [tMin, tMax] = domain ?? [0, 2 * Math.PI];
    return type === 'parametric'
      ? buildParametricPaths(crvs, tMin, tMax)
      : buildPolarPaths(crvs, tMin, tMax);
  }, [type, fn, curves, domain]);
  const scaleAngle = useMemo(() => scaleLabelAngle(curvePaths), [curvePaths]);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="canvas-figure">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={title ?? (type === 'polar' ? 'Polar plot' : 'Parametric curve')}
        >
          {/* Concentric rings at 25% / 50% / 75% / 100% of MAX_R */}
          {RING_FRACTIONS.map((f) => (
            <circle
              key={`ring-${f}`}
              cx={CX}
              cy={CY}
              r={MAX_R * f}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={0.5}
            />
          ))}

          {/* 12 radial spokes at 30° steps */}
          {RADIAL_ANGLES.map((a, i) => (
            <line
              key={`spoke-${i}`}
              x1={CX}
              y1={CY}
              x2={CX + MAX_R * Math.cos(a)}
              y2={CY - MAX_R * Math.sin(a)}
              stroke="var(--grid-line)"
              strokeWidth={0.5}
            />
          ))}

          {/* Angle labels just outside the outer ring */}
          {ANGLE_LABELS.map(({ x, y, text, anchor }) => (
            <text
              key={`albl-${text}`}
              x={x}
              y={y}
              fontSize={9}
              fill="var(--text-muted)"
              textAnchor={anchor}
            >
              {text}
            </text>
          ))}

          {/* The outer ring's value — the curves' own largest reach, not a fixed 1. */}
          <text
            x={CX + SCALE_LABEL_R * Math.cos((scaleAngle * Math.PI) / 180)}
            y={CY - SCALE_LABEL_R * Math.sin((scaleAngle * Math.PI) / 180)}
            fontSize={9}
            fill="var(--text-muted)"
            textAnchor="middle"
            dominantBaseline="central"
            className="pp-scale-lbl"
          >
            {formatExtent(extent)}
          </text>

          {/* Curve polylines, one per entry */}
          {curvePaths.map((path, i) =>
            path.points ? (
              <polyline
                key={`crv-${i}`}
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
        </svg>
      </div>

      {/* Legend for any named curves — an inline label at each curve's last plotted point
          (the old approach) collides whenever curves share a domain, since every curve then
          terminates at the same angle t = tMax and lands on or near the same ray from centre.
          A legend row below the plot never collides regardless of curve count or domain. */}
      {curvePaths.some((p) => p.label) && (
        <div className="vfl-legend">
          {curvePaths
            .filter((p) => p.label)
            .map((p, i) => (
              <span key={`leg-${i}`} className="vfl-leg">
                <i style={{ background: p.color }} />
                {p.label}
              </span>
            ))}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

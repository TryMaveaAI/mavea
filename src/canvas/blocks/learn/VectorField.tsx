import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import type { VectorFieldProps, FieldSample } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VectorFieldProps & { delay?: number };

const W = 320;
const H = 268;
const LEFT = 44; // y-axis tick labels + axis title
const RIGHT = 16;
const TOP = 16;
const BOT = 40; // x-axis tick labels + axis title row

// Diverging-by-magnitude palette: low magnitude reads calm (insight), high reads hot (danger).
const LOW = 'var(--insight)';
const HIGH = 'var(--danger)';
const SLOPE_COLOR = 'var(--text-secondary)';
const CURVE_PALETTE = ['var(--presence)', 'var(--warning)', 'var(--insight)'];

/** Normalised magnitude (0..1) of a sample, used to colour and (optionally) scale a glyph. */
function magnitudeOf(s: FieldSample): number {
  if (typeof s.slope === 'number') return Math.abs(s.slope); // raw; ranked against the lattice below
  const u = s.u ?? 0;
  const v = s.v ?? 0;
  return Math.hypot(u, v);
}

/** Direction angle of a sample in DATA space (radians, CCW from +x, y-up). */
function angleOf(s: FieldSample): number {
  if (typeof s.slope === 'number') return Math.atan(s.slope); // dy/dx → angle of the tangent line
  return Math.atan2(s.v ?? 0, s.u ?? 0);
}

export function VectorField({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  samples = [],
  curves = [],
  xRange,
  yRange,
  xLabel = 'x',
  yLabel = 'y',
  mode,
  normalize = true,
  colorByMagnitude = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  const model = useMemo(() => {
    // A field is a "slope field" (headless tangent dashes) when every sample carries `slope`,
    // or when the caller forces it. Otherwise it's a vector field (arrows for u,v).
    const allSlope = samples.length > 0 && samples.every((s) => typeof s.slope === 'number');
    const isSlope = mode === 'slope' || (mode !== 'vector' && allSlope);

    // Auto-fit the data domain from the lattice points and any overlaid curves, with the origin
    // always inside so the axes read. niceDomain rounds the bounds to tidy tick values.
    const allX = [
      ...samples.map((s) => s.x),
      ...curves.flatMap((c) => c.points.map((p) => p.x)),
      0,
    ];
    const allY = [
      ...samples.map((s) => s.y),
      ...curves.flatMap((c) => c.points.map((p) => p.y)),
      0,
    ];
    const ex = extent(allX);
    const ey = extent(allY);
    const [xMin, xMax] = xRange ?? (ex ? niceDomain(ex[0], ex[1]) : ([-3, 3] as [number, number]));
    const [yMin, yMax] = yRange ?? (ey ? niceDomain(ey[0], ey[1]) : ([-3, 3] as [number, number]));

    const sx = scaleLinear([xMin, xMax], [LEFT, W - RIGHT]);
    const sy = scaleLinear([yMin, yMax], [H - BOT, TOP]); // inverted: larger y is higher on screen

    // Axis lines, clamped to the plot box so a domain not spanning 0 still draws sane axes.
    const axisY = Math.max(TOP, Math.min(H - BOT, sy(0))); // horizontal axis (y = 0)
    const axisX = Math.max(LEFT, Math.min(W - RIGHT, sx(0))); // vertical axis (x = 0)

    // Glyph length: the lattice's tightest neighbour spacing in SVG px sets a uniform glyph size
    // so arrows never overrun into each other. Computed from the data, not eyeballed.
    const pxPts = samples.map((s) => ({ px: sx(s.x), py: sy(s.y) }));
    let minGap = Infinity;
    for (let i = 0; i < pxPts.length; i++) {
      for (let j = i + 1; j < pxPts.length; j++) {
        const d = Math.hypot(pxPts[i].px - pxPts[j].px, pxPts[i].py - pxPts[j].py);
        if (d > 0.5 && d < minGap) minGap = d;
      }
    }
    const glyphLen = Number.isFinite(minGap) ? Math.min(26, Math.max(12, minGap * 0.42)) : 18;

    // Magnitude range across the lattice → a 0..1 rank for colour and (vector mode) length.
    const mags = samples.map(magnitudeOf);
    const mLo = mags.length ? Math.min(...mags) : 0;
    const mHi = mags.length ? Math.max(...mags) : 1;
    const mSpan = mHi - mLo || 1;

    const glyphs = samples.map((s, i) => {
      const cx = sx(s.x);
      const cy = sy(s.y);
      const ang = angleOf(s); // data-space angle, y-up
      // SVG y grows downward, so the on-screen angle negates the data angle's vertical part.
      const svgAng = -ang;
      const rank = (mags[i] - mLo) / mSpan; // 0 (weakest) .. 1 (strongest)
      // Length: in slope mode every dash is the same (direction only); in vector mode either
      // all-equal (normalized) or proportional to magnitude rank.
      const half = (isSlope || normalize ? glyphLen : glyphLen * (0.45 + 0.55 * rank)) / 2;
      const dx = Math.cos(svgAng) * half;
      const dy = Math.sin(svgAng) * half;
      const color = colorByMagnitude
        ? `color-mix(in oklab, ${HIGH} ${Math.round(rank * 100)}%, ${LOW})`
        : isSlope
          ? SLOPE_COLOR
          : 'var(--presence)';
      return {
        x1: cx - dx,
        y1: cy - dy,
        x2: cx + dx,
        y2: cy + dy,
        svgAng,
        color,
        key: `g${i}`,
      };
    });

    // Overlaid solution curves / streamlines as point polylines in data coords.
    const curvePaths = curves.map((c, ci) => ({
      d: c.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' '),
      color: c.color || CURVE_PALETTE[ci % CURVE_PALETTE.length],
      label: c.label,
      // Anchor the legend dot at the last point of the curve (its right-most reach is most visible).
      key: `c${ci}`,
    }));

    return {
      sx,
      sy,
      axisX,
      axisY,
      xTicks: sx.ticks(6),
      yTicks: sy.ticks(5),
      isSlope,
      glyphs,
      curvePaths,
      glyphLen,
    };
  }, [samples, curves, xRange, yRange, mode, normalize, colorByMagnitude]);

  const { sx, sy, axisX, axisY, xTicks, yTicks, isSlope, glyphs, curvePaths } = model;
  const hasData = glyphs.length > 0;
  // Unique id so each instance's curve clip-path is its own (several fields can share a page).
  const clipId = useId();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {hasData ? (
        <div className="vfl-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="vfl-svg" role="img" aria-label={title}>
            <defs>
              {/* One arrowhead per distinct glyph orientation is overkill; a single auto-oriented
                  marker tracks each line's direction. context-stroke inherits the glyph colour. */}
              <marker
                id="vfl-head"
                markerWidth="7"
                markerHeight="7"
                refX="5.4"
                refY="3"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0.5,0.5 L6,3 L0.5,5.5" className="vfl-headshape" />
              </marker>
              {/* Overlaid curves are caller data; an explicit xRange/yRange can crop the view tighter
                  than the curve reaches, so a curve can run past the plot box. Clip the curves to the
                  plot rectangle so they end cleanly at the field edge instead of spilling out. */}
              <clipPath id={clipId}>
                <rect x={LEFT} y={TOP} width={W - RIGHT - LEFT} height={H - BOT - TOP} />
              </clipPath>
            </defs>

            {/* Gridlines at each tick */}
            <g className="vfl-grid">
              {xTicks.map((t) => (
                <line key={`gx${t}`} x1={sx(t)} y1={TOP} x2={sx(t)} y2={H - BOT} />
              ))}
              {yTicks.map((t) => (
                <line key={`gy${t}`} x1={LEFT} y1={sy(t)} x2={W - RIGHT} y2={sy(t)} />
              ))}
            </g>

            {/* Axes */}
            <line x1={LEFT} y1={axisY} x2={W - RIGHT} y2={axisY} className="vfl-axis" />
            <line x1={axisX} y1={TOP} x2={axisX} y2={H - BOT} className="vfl-axis" />

            {/* Tick labels (skip 0 — it sits on the axis crossing) */}
            {xTicks
              .filter((t) => t !== 0)
              .map((t) => (
                <text
                  key={`xt${t}`}
                  x={sx(t)}
                  y={H - BOT + 13}
                  className="vfl-tick"
                  textAnchor="middle"
                >
                  {t}
                </text>
              ))}
            {yTicks
              .filter((t) => t !== 0)
              .map((t) => (
                <text
                  key={`yt${t}`}
                  x={LEFT - 6}
                  y={sy(t) + 3}
                  className="vfl-tick"
                  textAnchor="end"
                >
                  {t}
                </text>
              ))}

            {/* Axis titles on their own rows, clear of the tick baselines */}
            <text x={(LEFT + W - RIGHT) / 2} y={H - 8} className="vfl-axis-lbl" textAnchor="middle">
              {xLabel}
            </text>
            <text
              x={0}
              y={0}
              transform={`translate(13, ${(TOP + H - BOT) / 2}) rotate(-90)`}
              className="vfl-axis-lbl"
              textAnchor="middle"
            >
              {yLabel}
            </text>

            {/* Field glyphs: headless dashes for a slope field, arrows for a vector field */}
            <g className="vfl-glyphs">
              {glyphs.map((g) =>
                isSlope ? (
                  <line
                    key={g.key}
                    x1={g.x1}
                    y1={g.y1}
                    x2={g.x2}
                    y2={g.y2}
                    stroke={g.color}
                    className="vfl-dash"
                  />
                ) : (
                  <line
                    key={g.key}
                    x1={g.x1}
                    y1={g.y1}
                    x2={g.x2}
                    y2={g.y2}
                    stroke={g.color}
                    className="vfl-arrow"
                    markerEnd="url(#vfl-head)"
                  />
                ),
              )}
            </g>

            {/* Overlaid solution curves / streamlines — clipped to the plot box so a curve that
                reaches past an explicit range ends cleanly at the field edge */}
            <g clipPath={`url(#${clipId})`}>
              {curvePaths.map((c) => (
                <polyline
                  key={c.key}
                  points={c.d}
                  fill="none"
                  stroke={c.color}
                  className="vfl-curve"
                />
              ))}
            </g>
          </svg>
        </div>
      ) : (
        <div className="vfl-empty">
          Provide field samples — {'{ x, y, u, v }'} for a vector field or {'{ x, y, slope }'} for a
          slope field.
        </div>
      )}

      {/* Legend for any named curves */}
      {curvePaths.some((c) => c.label) && (
        <div className="vfl-legend">
          {curvePaths
            .filter((c) => c.label)
            .map((c) => (
              <span key={`leg-${c.key}`} className="vfl-leg">
                <i style={{ background: c.color }} />
                {c.label}
              </span>
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

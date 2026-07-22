import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import type { VectorSpaceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VectorSpaceProps & { delay?: number };

const W = 300;
const H = 248;
const PAD = 42;

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

/** Arrow polygon at the tip of a vector. */
function Head({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const len = 9,
    hw = 4.5;
  const bx = x - Math.cos(angle) * len;
  const by = y - Math.sin(angle) * len;
  const pa = angle + Math.PI / 2;
  return (
    <polygon
      points={[
        `${x},${y}`,
        `${bx + Math.cos(pa) * hw},${by + Math.sin(pa) * hw}`,
        `${bx - Math.cos(pa) * hw},${by - Math.sin(pa) * hw}`,
      ].join(' ')}
      fill={color}
    />
  );
}

/** A labeled vector arrow from the origin to (endX, endY) in SVG coords. */
function VecArrow({
  endX,
  endY,
  color,
  label,
  dashed,
}: {
  endX: number;
  endY: number;
  color: string;
  label?: string;
  dashed?: boolean;
}) {
  const angle = Math.atan2(endY, endX);
  const arrowLen = 10;
  const lx2 = endX - Math.cos(angle) * arrowLen * 0.85;
  const ly2 = endY - Math.sin(angle) * arrowLen * 0.85;
  const perpA = angle - Math.PI / 2;
  const midX = endX * 0.55;
  const midY = endY * 0.55;

  return (
    <g>
      <line
        x1={0}
        y1={0}
        x2={lx2}
        y2={ly2}
        stroke={color}
        strokeWidth={dashed ? 1.5 : 2}
        strokeDasharray={dashed ? '5,3' : undefined}
      />
      <Head x={endX} y={endY} angle={angle} color={color} />
      {label && (
        <text
          x={midX + Math.cos(perpA) * 11}
          y={midY + Math.sin(perpA) * 11}
          fill={color}
          className="vs-lbl"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function VectorSpace({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  vectors = [],
  transformed = [],
  showSpan = false,
  xRange,
  yRange,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const { sx, sy, xTicks, yTicks, ox, oy } = useMemo(() => {
    const allVecs = [...vectors, ...transformed];
    const allX = allVecs.map((v) => v.x);
    const allY = allVecs.map((v) => v.y);

    // Always include the origin in the range
    allX.push(0);
    allY.push(0);

    const ex = extent(allX);
    const ey = extent(allY);
    const [xMin, xMax] = xRange ?? (ex ? niceDomain(ex[0], ex[1]) : ([-4, 4] as [number, number]));
    const [yMin, yMax] = yRange ?? (ey ? niceDomain(ey[0], ey[1]) : ([-4, 4] as [number, number]));

    const scX = scaleLinear([xMin, xMax], [PAD, W - PAD]);
    const scY = scaleLinear([yMin, yMax], [H - PAD, PAD]);

    return {
      sx: scX,
      sy: scY,
      xTicks: scX.ticks(6),
      yTicks: scY.ticks(5),
      ox: scX(0), // SVG x of the origin
      oy: scY(0), // SVG y of the origin
    };
  }, [vectors, transformed, xRange, yRange]);

  // Span shading: parallelogram from origin through first two vectors
  const spanPath = useMemo(() => {
    if (!showSpan || vectors.length < 2) return '';
    const a = vectors[0],
      b = vectors[1];
    const ax = sx(a.x) - ox,
      ay = sy(a.y) - oy;
    const bx = sx(b.x) - ox,
      by = sy(b.y) - oy;
    return `M 0,0 L ${ax},${ay} L ${ax + bx},${ay + by} L ${bx},${by} Z`;
  }, [showSpan, vectors, sx, sy, ox, oy]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="vs-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="vs-svg" role="img" aria-label={title}>
          {/* Grid */}
          <g className="vs-grid">
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} y1={PAD} x2={sx(t)} y2={H - PAD} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={PAD} y1={sy(t)} x2={W - PAD} y2={sy(t)} />
            ))}
          </g>

          {/* Axes */}
          <line x1={PAD} y1={oy} x2={W - PAD} y2={oy} className="vs-axis" />
          <line x1={ox} y1={PAD} x2={ox} y2={H - PAD} className="vs-axis" />

          {/* Tick labels */}
          {xTicks
            .filter((t) => t !== 0)
            .map((t) => (
              <text key={`xt${t}`} x={sx(t)} y={oy + 12} className="vs-tick" textAnchor="middle">
                {t}
              </text>
            ))}
          {yTicks
            .filter((t) => t !== 0)
            .map((t) => (
              <text key={`yt${t}`} x={ox - 6} y={sy(t) + 3} className="vs-tick" textAnchor="end">
                {t}
              </text>
            ))}

          {/* Span parallelogram */}
          {spanPath && (
            <path
              d={spanPath}
              transform={`translate(${ox},${oy})`}
              fill="color-mix(in oklab, var(--presence) 14%, transparent)"
              stroke="none"
            />
          )}

          {/* Vectors — translated to origin in SVG coords */}
          <g transform={`translate(${ox},${oy})`}>
            {/* Original vectors */}
            {vectors.map((v, i) => (
              <VecArrow
                key={`v${i}`}
                endX={sx(v.x) - ox}
                endY={sy(v.y) - oy}
                color={v.color || PALETTE[i % PALETTE.length]}
                label={v.label}
              />
            ))}

            {/* Transformed vectors (dashed) */}
            {transformed.map((v, i) => (
              <VecArrow
                key={`t${i}`}
                endX={sx(v.x) - ox}
                endY={sy(v.y) - oy}
                color={v.color || PALETTE[i % PALETTE.length]}
                label={v.label}
                dashed
              />
            ))}
          </g>

          {/* Origin dot */}
          <circle cx={ox} cy={oy} r={3} fill="var(--text-secondary)" />
        </svg>
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

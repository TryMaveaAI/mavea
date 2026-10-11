import { useState, useEffect, useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GridTransformProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';

type Props = GridTransformProps & { delay?: number };

const W = 300;
const H = 260;
const CX = 150; // SVG origin x
const CY = 130; // SVG origin y
const SCALE = 40; // px per unit

/** Map a data-space point to SVG coords (y flipped, origin at CX,CY). */
function toSVG(x: number, y: number): [number, number] {
  return [CX + x * SCALE, CY - y * SCALE];
}

/** Apply the 2×2 matrix [[a,b],[c,d]] to [x,y] → [ax+by, cx+dy]. */
function applyMatrix(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  y: number,
): [number, number] {
  return [a * x + b * y, c * x + d * y];
}

/** Triangle arrowhead at (x2,y2) pointing from direction (x1,y1). */
function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  _color: string,
  size = 7,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const px = (da: number) => x2 - size * Math.cos(angle + da);
  const py = (da: number) => y2 - size * Math.sin(angle + da);
  return `${x2},${y2} ${px(-0.4)},${py(-0.4)} ${px(0.4)},${py(0.4)}`;
}

// Grid range: -3 to 3, 7 values each axis
const RANGE = [-3, -2, -1, 0, 1, 2, 3];

/** Where a label naming a ray from (ox, oy) through (tx, ty) goes: beside the point `at` of the
 *  way along it, pushed off the line along its normal by enough to clear a w×h box — the ray
 *  itself, and for a basis vector the transformed axis it lies on, run straight through the
 *  spot a label would otherwise take at the tip. `away` picks the side: the normal pointing
 *  away from that point (another vector the label must not crowd), else upward. */
function besideRay(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  at: number,
  w: number,
  h: number,
  away?: [number, number],
): [number, number] {
  const len = Math.hypot(tx - ox, ty - oy) || 1;
  let nx = -(ty - oy) / len;
  let ny = (tx - ox) / len;
  const flip = away
    ? nx * (away[0] - ox) + ny * (away[1] - oy) > 0
    : ny > 0 || (ny === 0 && nx > 0);
  if (flip) {
    nx = -nx;
    ny = -ny;
  }
  const dist = 4 + (Math.abs(nx) * w) / 2 + (Math.abs(ny) * h) / 2;
  return [ox + (tx - ox) * at + nx * dist, oy + (ty - oy) * at + ny * dist];
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

export function GridTransform({
  title = 'Linear Transformation',
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  matrix,
  showEigens = true,
  animated = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.sparkle;
  const clipId = `gt-clip-${useId().replace(/:/g, '')}`;

  const [showTransform, setShowTransform] = useState(!animated);

  useEffect(() => {
    if (!animated) return;
    const t = setTimeout(() => setShowTransform(true), 300);
    return () => clearTimeout(t);
  }, [animated]);

  const model = useMemo(() => {
    const [[a, b], [c, d]] = matrix;

    // Transformed grid lines
    const hLines: Array<{ x1: number; y1: number; x2: number; y2: number; isAxis: boolean }> = [];
    const vLines: Array<{ x1: number; y1: number; x2: number; y2: number; isAxis: boolean }> = [];

    for (const y of RANGE) {
      const [sx1, sy1] = toSVG(...applyMatrix(a, b, c, d, -3, y));
      const [sx2, sy2] = toSVG(...applyMatrix(a, b, c, d, 3, y));
      hLines.push({ x1: sx1, y1: sy1, x2: sx2, y2: sy2, isAxis: y === 0 });
    }
    for (const x of RANGE) {
      const [sx1, sy1] = toSVG(...applyMatrix(a, b, c, d, x, -3));
      const [sx2, sy2] = toSVG(...applyMatrix(a, b, c, d, x, 3));
      vLines.push({ x1: sx1, y1: sy1, x2: sx2, y2: sy2, isAxis: x === 0 });
    }

    // Basis vectors after transform
    const [ox, oy] = toSVG(0, 0);
    const [iHatX, iHatY] = toSVG(a, c); // i-hat → column (a,c)
    const [jHatX, jHatY] = toSVG(b, d); // j-hat → column (b,d)

    // Determinant
    const det = a * d - b * c;

    // Eigenvalue computation for real eigenvalues only
    let eigens: Array<{ vx: number; vy: number; lambda: number }> = [];
    if (showEigens) {
      const trace = a + d;
      const det2 = a * d - b * c;
      const discriminant = trace * trace - 4 * det2;

      if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        const lambdas = [(trace + sqrtD) / 2, (trace - sqrtD) / 2];

        for (const lam of lambdas) {
          // Solve (A - λI)v = 0 for a non-zero eigenvector direction
          const isDiag = Math.abs(a - lam) < Math.abs(d - lam);
          const ex = Math.abs(b) > 1e-9 ? b : Math.abs(c) > 1e-9 ? lam - d : isDiag ? 1 : 0;
          const ey = Math.abs(b) > 1e-9 ? lam - a : Math.abs(c) > 1e-9 ? c : isDiag ? 0 : 1;
          const norm = Math.hypot(ex, ey);
          if (norm > 1e-9) {
            eigens.push({ vx: ex / norm, vy: ey / norm, lambda: lam });
          }
        }

        // Deduplicate nearly-parallel eigenvectors (collapse when discriminant ≈ 0)
        if (
          eigens.length === 2 &&
          Math.abs(eigens[0].vx * eigens[1].vy - eigens[0].vy * eigens[1].vx) < 1e-6
        ) {
          eigens = [eigens[0]];
        }
      }
    }

    return { a, b, c, d, det, hLines, vLines, ox, oy, iHatX, iHatY, jHatX, jHatY, eigens };
  }, [matrix, showEigens]);

  const { a, b, c, d, det, hLines, vLines, ox, oy, iHatX, iHatY, jHatX, jHatY, eigens } = model;

  // Eigen ray length — capped so rays stay within the W×H viewport.
  const RAY_LEN = Math.min(CX, W - CX, CY, H - CY) - 4;
  // Each basis label on the side of its vector away from the other one, most of the way out so
  // it clears the arrowhead.
  const BASIS_W = estimateTextWidth('î', 10);
  const iLabel = besideRay(ox, oy, iHatX, iHatY, 0.7, BASIS_W, 10, [jHatX, jHatY]);
  const jLabel = besideRay(ox, oy, jHatX, jHatY, 0.7, BASIS_W, 10, [iHatX, iHatY]);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
      </div>

      <div className="canvas-figure">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block' }}
          role="img"
          aria-label={title}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>

          {/* ── Original grid (faint, before transform) ── */}
          <g clipPath={`url(#${clipId})`}>
            {/* Horizontal lines at each integer y */}
            {RANGE.map((y) => {
              const [x1, y1] = toSVG(-3, y);
              const [x2, y2] = toSVG(3, y);
              const isAxis = y === 0;
              return (
                <line
                  key={`oh${y}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isAxis ? 'var(--text-muted)' : 'var(--surface-border)'}
                  strokeWidth={isAxis ? 1.2 : 0.8}
                  opacity={0.6}
                />
              );
            })}
            {/* Vertical lines at each integer x */}
            {RANGE.map((x) => {
              const [x1, y1] = toSVG(x, -3);
              const [x2, y2] = toSVG(x, 3);
              const isAxis = x === 0;
              return (
                <line
                  key={`ov${x}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isAxis ? 'var(--text-muted)' : 'var(--surface-border)'}
                  strokeWidth={isAxis ? 1.2 : 0.8}
                  opacity={0.6}
                />
              );
            })}
          </g>

          {/* ── Transformed grid + basis vectors (animated in) ── */}
          <g
            clipPath={`url(#${clipId})`}
            style={{ opacity: showTransform ? 1 : 0, transition: 'opacity 0.6s ease' }}
          >
            {/* Transformed horizontal lines */}
            {hLines.map((l, i) => (
              <line
                key={`th${i}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="var(--insight)"
                strokeWidth={l.isAxis ? 2 : 0.9}
                opacity={l.isAxis ? 1 : 0.75}
              />
            ))}
            {/* Transformed vertical lines */}
            {vLines.map((l, i) => (
              <line
                key={`tv${i}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="var(--insight)"
                strokeWidth={l.isAxis ? 2 : 0.9}
                opacity={l.isAxis ? 1 : 0.75}
              />
            ))}

            {/* ── Eigenvectors (dashed rays through the origin) ── */}
            {eigens.map((e, i) => {
              // SVG y is flipped: data +y → screen -y, so eigenvector (vx, vy_data) → (vx, -vy) screen
              const screenVx = e.vx;
              const screenVy = -e.vy;
              const mag = Math.hypot(screenVx, screenVy) || 1;
              const nx = (screenVx / mag) * RAY_LEN;
              const ny = (screenVy / mag) * RAY_LEN;
              const lamStr = fmt(e.lambda);
              // Near the far end of the ray, past the basis vectors that start at the origin.
              const [lx, ly] = besideRay(
                ox,
                oy,
                ox + nx,
                oy + ny,
                0.82,
                estimateTextWidth(`λ=${lamStr}`, 9),
                9,
              );
              return (
                <g key={`eig${i}`}>
                  {/* Positive ray */}
                  <line
                    x1={ox}
                    y1={oy}
                    x2={ox + nx}
                    y2={oy + ny}
                    stroke="var(--danger)"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                  {/* Negative ray */}
                  <line
                    x1={ox}
                    y1={oy}
                    x2={ox - nx}
                    y2={oy - ny}
                    stroke="var(--danger)"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--danger)"
                    fontSize={9}
                    className="gtf-label"
                  >
                    λ={lamStr}
                  </text>
                </g>
              );
            })}

            {/* ── i-hat basis vector (presence) ── */}
            {(iHatX !== ox || iHatY !== oy) && (
              <g>
                <line
                  x1={ox}
                  y1={oy}
                  x2={iHatX}
                  y2={iHatY}
                  stroke="var(--presence)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <polygon
                  points={arrowHead(ox, oy, iHatX, iHatY, 'var(--presence)')}
                  fill="var(--presence)"
                />
                <text
                  x={iLabel[0]}
                  y={iLabel[1]}
                  fill="var(--presence)"
                  fontSize={10}
                  className="gtf-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  î
                </text>
              </g>
            )}

            {/* ── j-hat basis vector (warning) ── */}
            {(jHatX !== ox || jHatY !== oy) && (
              <g>
                <line
                  x1={ox}
                  y1={oy}
                  x2={jHatX}
                  y2={jHatY}
                  stroke="var(--warning)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <polygon
                  points={arrowHead(ox, oy, jHatX, jHatY, 'var(--warning)')}
                  fill="var(--warning)"
                />
                <text
                  x={jLabel[0]}
                  y={jLabel[1]}
                  fill="var(--warning)"
                  fontSize={10}
                  className="gtf-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  ĵ
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>
      {/* The matrix and what it does to area, under the figure rather than in a corner of it:
          the transformed grid can sweep through any corner, depending on the matrix. */}
      <div className="gtf-readout">
        <span
          className="gtf-matrix"
          role="img"
          aria-label={`T = [[${fmt(a)}, ${fmt(b)}], [${fmt(c)}, ${fmt(d)}]]`}
        >
          <span>{fmt(a)}</span>
          <span>{fmt(b)}</span>
          <span>{fmt(c)}</span>
          <span>{fmt(d)}</span>
        </span>
        <span>det = {det.toFixed(2)}</span>
        <span>area ×{Math.abs(det).toFixed(2)}</span>
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

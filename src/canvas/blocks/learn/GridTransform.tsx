import { useState, useEffect, useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GridTransformProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

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

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} />
        {title}
      </div>

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
            // Label placement: offset outward from positive ray end
            const labelDist = RAY_LEN * 0.55;
            const lx = ox + (screenVx / mag) * labelDist;
            const ly = oy + (screenVy / mag) * labelDist - 4;
            const lamStr = Number.isInteger(e.lambda) ? String(e.lambda) : e.lambda.toFixed(2);
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
                  fill="var(--danger)"
                  fontSize={9}
                  fontFamily="inherit"
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
                x={iHatX + (iHatX - ox > 0 ? 6 : -6)}
                y={iHatY + (iHatY - oy > 0 ? 10 : -4)}
                fill="var(--presence)"
                fontSize={10}
                fontFamily="inherit"
                textAnchor={iHatX - ox > 0 ? 'start' : 'end'}
              >
                î→
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
                x={jHatX + (jHatX - ox >= 0 ? 6 : -6)}
                y={jHatY + (jHatY - oy >= 0 ? 10 : -4)}
                fill="var(--warning)"
                fontSize={10}
                fontFamily="inherit"
                textAnchor={jHatX - ox >= 0 ? 'start' : 'end'}
              >
                ĵ→
              </text>
            </g>
          )}

          {/* ── Determinant label (top-right corner) ── */}
          <text
            x={W - 8}
            y={14}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize={10}
            fontFamily="inherit"
          >
            det = {det.toFixed(2)}
          </text>
          <text
            x={W - 8}
            y={26}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize={9}
            fontFamily="inherit"
          >
            area ×{Math.abs(det).toFixed(2)}
          </text>

          {/* ── Matrix display (bottom-left) ── */}
          <text x={8} y={H - 20} fill="var(--text-secondary)" fontSize={9} fontFamily="monospace">
            [{a} {b}]
          </text>
          <text x={8} y={H - 8} fill="var(--text-secondary)" fontSize={9} fontFamily="monospace">
            [{c} {d}]
          </text>
        </g>
      </svg>

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

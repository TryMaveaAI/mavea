import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { PhasePortraitProps } from './types';
import { makeEval2 } from './mathExpr';
import { distinctEquilibria } from './phaseEquilibria';
import { richInnerHtml } from '../../../lib/richText';

type Props = PhasePortraitProps & { delay?: number };

const W = 320;
const H = 268;
const PAD = { l: 40, r: 16, t: 16, b: 36 };

// How many grid columns/rows for the vector field arrows
const ARROW_GRID = 14;
// Dense grid for nullcline sign-change detection
const NULL_GRID = 60;
// Threshold for calling a point "near zero" in equilibrium search
const EQ_THRESHOLD = 0.3;

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mag: number;
}

interface NullSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type EqType =
  'stable-node' | 'unstable-node' | 'stable-spiral' | 'unstable-spiral' | 'saddle' | 'center';

interface Equilibrium {
  px: number;
  py: number;
  type: EqType;
  // Label anchor, offset from (px, py) to dodge nearby equilibria — see resolveLabelCollisions.
  lx: number;
  ly: number;
}

interface TrajPath {
  points: string;
  // SVG coords of the midpoint arrow
  mx: number;
  my: number;
  mdx: number;
  mdy: number;
}

// Each equilibrium label defaults to the same fixed offset from its marker (px+6, py-5). That's
// fine in isolation, but two distinct equilibria that sit close together (a saddle flanked by
// two nearby nodes is ordinary) get labels that land on top of each other and read as garbled overlapping
// text. Greedily push each label away from any earlier label it collides with, trying a small ring
// of alternate offsets before falling back to the shared default.
const LABEL_DEFAULT = { dx: 6, dy: -5 };
const LABEL_ALT_OFFSETS: Array<{ dx: number; dy: number }> = [
  { dx: 6, dy: -5 },
  { dx: 6, dy: 13 },
  { dx: -20, dy: -5 },
  { dx: -20, dy: 13 },
  { dx: 6, dy: -18 },
  { dx: -20, dy: -18 },
];
const LABEL_MIN_DIST = 11; // px between label anchors before they're considered overlapping

function resolveLabelCollisions<T extends { px: number; py: number }>(
  points: T[],
): Array<T & { lx: number; ly: number }> {
  const placed: Array<{ lx: number; ly: number }> = [];
  return points.map((eq) => {
    let choice = LABEL_DEFAULT;
    for (const cand of LABEL_ALT_OFFSETS) {
      const lx = eq.px + cand.dx;
      const ly = eq.py + cand.dy;
      const collides = placed.some((p) => Math.hypot(p.lx - lx, p.ly - ly) < LABEL_MIN_DIST);
      if (!collides) {
        choice = cand;
        break;
      }
    }
    const lx = eq.px + choice.dx;
    const ly = eq.py + choice.dy;
    placed.push({ lx, ly });
    return { ...eq, lx, ly };
  });
}

export function PhasePortrait({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  fx,
  gy,
  xDomain = [-4, 4],
  yDomain = [-4, 4],
  trajectories,
  showNullclines = true,
  xlabel = 'x',
  ylabel = 'y',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const clipId = useId();
  const arrowHeadId = useId();
  const trajHeadId = useId();

  const model = useMemo(() => {
    const fxFn = makeEval2(fx);
    const gyFn = makeEval2(gy);
    if (!fxFn || !gyFn) return null;

    const [xMin, xMax] = xDomain;
    const [yMin, yMax] = yDomain;

    const sx = scaleLinear([xMin, xMax], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yMin, yMax], [H - PAD.b, PAD.t]);

    const plotW = W - PAD.r - PAD.l;
    const plotH = H - PAD.b - PAD.t;

    // ── Vector field arrows ──────────────────────────────────────────────
    const arrowSpacingX = plotW / (ARROW_GRID + 1);
    const arrowSpacingY = plotH / (ARROW_GRID + 1);
    // Max arrow half-length is 70% of the tighter spacing / 2
    const maxHalf = Math.min(arrowSpacingX, arrowSpacingY) * 0.35;

    const rawArrows: Array<{ px: number; py: number; fu: number; fv: number; mag: number }> = [];

    for (let ci = 0; ci < ARROW_GRID; ci++) {
      for (let ri = 0; ri < ARROW_GRID; ri++) {
        const px = PAD.l + arrowSpacingX * (ci + 1);
        const py = PAD.t + arrowSpacingY * (ri + 1);
        const dataX = sx.domain[0] + ((px - PAD.l) / plotW) * (xMax - xMin);
        const dataY = yMax - ((py - PAD.t) / plotH) * (yMax - yMin);
        const fu = fxFn(dataX, dataY);
        const fv = gyFn(dataX, dataY);
        const mag = Math.hypot(fu, fv);
        rawArrows.push({ px, py, fu, fv, mag });
      }
    }

    const maxMag = rawArrows.reduce((m, a) => Math.max(m, a.mag), 0) || 1;

    const arrows: Arrow[] = rawArrows.map(({ px, py, fu, fv, mag }) => {
      const norm = mag > 0 ? mag : 1;
      // SVG y is flipped: positive vy in data-space moves up (negative SVG y)
      const dx = (fu / norm) * maxHalf;
      const dy = -(fv / norm) * maxHalf;
      return {
        x1: px - dx,
        y1: py - dy,
        x2: px + dx,
        y2: py + dy,
        mag,
      };
    });

    // ── Nullclines via sign-change marching ─────────────────────────────
    const xNullSegs: NullSeg[] = [];
    const yNullSegs: NullSeg[] = [];

    if (showNullclines) {
      const cellW = (xMax - xMin) / NULL_GRID;
      const cellH = (yMax - yMin) / NULL_GRID;

      for (let ci = 0; ci < NULL_GRID; ci++) {
        for (let ri = 0; ri < NULL_GRID; ri++) {
          const x0 = xMin + ci * cellW;
          const y0 = yMin + ri * cellH;
          const x1 = x0 + cellW;
          const y1 = y0 + cellH;

          // Check horizontal edge (constant y = y0, x varies)
          const fxBL = fxFn(x0, y0),
            fxBR = fxFn(x1, y0);
          if (fxBL * fxBR < 0) {
            const t = fxBL / (fxBL - fxBR);
            const xi = x0 + t * cellW;
            xNullSegs.push({
              x1: sx(xi) - 3,
              y1: sy(y0),
              x2: sx(xi) + 3,
              y2: sy(y0),
            });
          }
          // Check vertical edge (constant x = x0, y varies)
          const fxBT = fxFn(x0, y0),
            fxTT = fxFn(x0, y1);
          if (fxBT * fxTT < 0) {
            const t = fxBT / (fxBT - fxTT);
            const yi = y0 + t * cellH;
            xNullSegs.push({
              x1: sx(x0),
              y1: sy(yi) - 3,
              x2: sx(x0),
              y2: sy(yi) + 3,
            });
          }

          // y-nullcline
          const gyBL = gyFn(x0, y0),
            gyBR = gyFn(x1, y0);
          if (gyBL * gyBR < 0) {
            const t = gyBL / (gyBL - gyBR);
            const xi = x0 + t * cellW;
            yNullSegs.push({
              x1: sx(xi) - 3,
              y1: sy(y0),
              x2: sx(xi) + 3,
              y2: sy(y0),
            });
          }
          const gyBT = gyFn(x0, y0),
            gyTT = gyFn(x0, y1);
          if (gyBT * gyTT < 0) {
            const t = gyBT / (gyBT - gyTT);
            const yi = y0 + t * cellH;
            yNullSegs.push({
              x1: sx(x0),
              y1: sy(yi) - 3,
              x2: sx(x0),
              y2: sy(yi) + 3,
            });
          }
        }
      }
    }

    // ── Equilibria: find cells where |fx|<threshold && |gy|<threshold ──
    const eqCandidates: Array<{ x: number; y: number }> = [];
    {
      const cellW = (xMax - xMin) / NULL_GRID;
      const cellH = (yMax - yMin) / NULL_GRID;
      for (let ci = 0; ci <= NULL_GRID; ci++) {
        for (let ri = 0; ri <= NULL_GRID; ri++) {
          const xv = xMin + ci * cellW;
          const yv = yMin + ri * cellH;
          const fv = fxFn(xv, yv);
          const gv = gyFn(xv, yv);
          if (Math.abs(fv) < EQ_THRESHOLD && Math.abs(gv) < EQ_THRESHOLD) {
            eqCandidates.push({ x: xv, y: yv });
          }
        }
      }
    }

    // A patch of near-zero cells surrounds every equilibrium, and it is many cells wide where
    // the field is gentle. Polish each cell to its root rather than grouping cells by distance.
    const clusters = distinctEquilibria(
      fxFn,
      gyFn,
      eqCandidates,
      { xMin, xMax, yMin, yMax },
      Math.min((xMax - xMin) / NULL_GRID, (yMax - yMin) / NULL_GRID) / 2,
    );

    const equilibriaRaw: Array<{ px: number; py: number; type: EqType }> = clusters.map(
      ({ x: xe, y: ye }) => {
        const h = 0.001;
        const dfx_dx = (fxFn(xe + h, ye) - fxFn(xe - h, ye)) / (2 * h);
        const dfx_dy = (fxFn(xe, ye + h) - fxFn(xe, ye - h)) / (2 * h);
        const dgy_dx = (gyFn(xe + h, ye) - gyFn(xe - h, ye)) / (2 * h);
        const dgy_dy = (gyFn(xe, ye + h) - gyFn(xe, ye - h)) / (2 * h);
        const tr = dfx_dx + dgy_dy;
        const det = dfx_dx * dgy_dy - dfx_dy * dgy_dx;
        const discr = tr * tr - 4 * det;

        let type: EqType;
        if (det < 0) {
          type = 'saddle';
        } else if (Math.abs(tr) < 1e-4 && det > 0) {
          type = 'center';
        } else if (tr < 0 && discr >= 0) {
          type = 'stable-node';
        } else if (tr < 0 && discr < 0) {
          type = 'stable-spiral';
        } else if (tr > 0 && discr >= 0) {
          type = 'unstable-node';
        } else {
          type = 'unstable-spiral';
        }

        return { px: sx(xe), py: sy(ye), type };
      },
    );

    // Nudge any label that would otherwise land on top of an already-placed one — see
    // resolveLabelCollisions for why fixed offsets alone aren't enough once equilibria cluster.
    const equilibria: Equilibrium[] = resolveLabelCollisions(equilibriaRaw);

    // ── Trajectories: RK4 integration ───────────────────────────────────
    const trajPaths: TrajPath[] = (trajectories ?? []).map(({ x0, y0 }) => {
      const dt = 0.05;
      const pts: Array<[number, number]> = [[sx(x0), sy(y0)]];
      let x = x0,
        y = y0;

      for (let step = 0; step < 400; step++) {
        if (x < xMin || x > xMax || y < yMin || y > yMax) break;
        const k1x = fxFn(x, y),
          k1y = gyFn(x, y);
        if (Math.abs(k1x) < 0.01 && Math.abs(k1y) < 0.01) break;
        const k2x = fxFn(x + (dt * k1x) / 2, y + (dt * k1y) / 2);
        const k2y = gyFn(x + (dt * k1x) / 2, y + (dt * k1y) / 2);
        const k3x = fxFn(x + (dt * k2x) / 2, y + (dt * k2y) / 2);
        const k3y = gyFn(x + (dt * k2x) / 2, y + (dt * k2y) / 2);
        const k4x = fxFn(x + dt * k3x, y + dt * k3y);
        const k4y = gyFn(x + dt * k3x, y + dt * k3y);
        x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
        pts.push([sx(x), sy(y)]);
      }

      // Midpoint arrowhead direction
      const mid = Math.floor(pts.length / 2);
      const p0 = pts[Math.max(0, mid - 1)];
      const p1 = pts[Math.min(pts.length - 1, mid + 1)];
      const ddx = p1[0] - p0[0];
      const ddy = p1[1] - p0[1];
      const dlen = Math.hypot(ddx, ddy) || 1;

      return {
        points: pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '),
        mx: pts[mid][0],
        my: pts[mid][1],
        mdx: ddx / dlen,
        mdy: ddy / dlen,
      };
    });

    // ── Axes ─────────────────────────────────────────────────────────────
    const axisY = Math.max(PAD.t, Math.min(H - PAD.b, sy(0)));
    const axisX = Math.max(PAD.l, Math.min(W - PAD.r, sx(0)));
    const xTicks = sx.ticks(4);
    const yTicks = sy.ticks(4);

    return {
      arrows,
      xNullSegs,
      yNullSegs,
      equilibria,
      trajPaths,
      sx,
      sy,
      axisX,
      axisY,
      xTicks,
      yTicks,
      maxMag,
    };
  }, [fx, gy, xDomain, yDomain, trajectories, showNullclines]);

  if (!model) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 13 }}>
          Could not parse expressions — check fx and gy.
        </div>
      </div>
    );
  }

  const {
    arrows,
    xNullSegs,
    yNullSegs,
    equilibria,
    trajPaths,
    sx,
    sy,
    axisX,
    axisY,
    xTicks,
    yTicks,
    maxMag,
  } = model;

  // Map a magnitude fraction to a color between insight (slow) and danger (fast)
  function magColor(mag: number) {
    const t = Math.round((mag / (maxMag || 1)) * 100);
    return `color-mix(in oklab, var(--danger) ${t}%, var(--insight))`;
  }

  function eqColor(type: EqType) {
    if (type === 'stable-node' || type === 'stable-spiral' || type === 'center')
      return 'var(--insight)';
    if (type === 'saddle') return 'var(--warning)';
    return 'var(--danger)';
  }

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div style={{ position: 'relative', lineHeight: 0 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={title || 'Phase portrait'}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t} width={W - PAD.r - PAD.l} height={H - PAD.b - PAD.t} />
            </clipPath>
            {/* Arrowhead for vector field — context-stroke matches the line color */}
            <marker
              id={arrowHeadId}
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M0,0.5 L4.5,2.5 L0,4.5"
                fill="none"
                stroke="context-stroke"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </marker>
            {/* Arrowhead for trajectories */}
            <marker
              id={trajHeadId}
              markerWidth="7"
              markerHeight="7"
              refX="3.5"
              refY="3.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M0,1 L6,3.5 L0,6"
                fill="none"
                stroke="var(--presence)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {/* Grid lines */}
          <g stroke="var(--grid-line)" strokeWidth="0.5">
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} />
            ))}
          </g>

          {/* Axes */}
          <line
            x1={PAD.l}
            y1={axisY}
            x2={W - PAD.r}
            y2={axisY}
            stroke="var(--surface-border)"
            strokeWidth="1"
          />
          <line
            x1={axisX}
            y1={PAD.t}
            x2={axisX}
            y2={H - PAD.b}
            stroke="var(--surface-border)"
            strokeWidth="1"
          />

          {/* Tick labels */}
          {xTicks
            .filter((t) => t !== 0)
            .map((t) => (
              <text
                key={`xt${t}`}
                x={sx(t)}
                y={H - PAD.b + 12}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {t}
              </text>
            ))}
          {yTicks
            .filter((t) => t !== 0)
            .map((t) => (
              <text
                key={`yt${t}`}
                x={PAD.l - 5}
                y={sy(t) + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {t}
              </text>
            ))}

          {/* Axis labels */}
          <text
            x={(PAD.l + W - PAD.r) / 2}
            y={H - 6}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="10"
          >
            {xlabel}
          </text>
          <text
            x={0}
            y={0}
            transform={`translate(12, ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="10"
          >
            {ylabel}
          </text>

          {/* Nullclines — clipped to the plot box */}
          {showNullclines && (
            <g clipPath={`url(#${clipId})`}>
              {xNullSegs.map((s, i) => (
                <line
                  key={`xn${i}`}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke="var(--danger)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  strokeLinecap="round"
                />
              ))}
              {yNullSegs.map((s, i) => (
                <line
                  key={`yn${i}`}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke="var(--insight)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  strokeLinecap="round"
                />
              ))}
            </g>
          )}

          {/* Vector field arrows */}
          <g clipPath={`url(#${clipId})`}>
            {arrows.map((a, i) => (
              <line
                key={`a${i}`}
                x1={a.x1}
                y1={a.y1}
                x2={a.x2}
                y2={a.y2}
                stroke={magColor(a.mag)}
                strokeWidth="1.2"
                strokeLinecap="round"
                markerEnd={`url(#${arrowHeadId})`}
              />
            ))}
          </g>

          {/* Trajectories */}
          <g clipPath={`url(#${clipId})`}>
            {trajPaths.map((t, i) => (
              <g key={`traj${i}`}>
                <polyline
                  points={t.points}
                  fill="none"
                  stroke="var(--presence)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Direction arrowhead at midpoint: a short invisible line that carries the marker */}
                <line
                  x1={t.mx - t.mdx * 0.1}
                  y1={t.my - t.mdy * 0.1}
                  x2={t.mx + t.mdx * 0.1}
                  y2={t.my + t.mdy * 0.1}
                  stroke="var(--presence)"
                  strokeWidth="1.5"
                  markerEnd={`url(#${trajHeadId})`}
                />
              </g>
            ))}
          </g>

          {/* Equilibria */}
          {equilibria.map((eq, i) => {
            const col = eqColor(eq.type);
            const isSaddle = eq.type === 'saddle';
            const isStable =
              eq.type === 'stable-node' || eq.type === 'stable-spiral' || eq.type === 'center';
            return (
              <g key={`eq${i}`}>
                {isSaddle ? (
                  // × mark for saddle
                  <g stroke={col} strokeWidth="1.8" strokeLinecap="round">
                    <line x1={eq.px - 4} y1={eq.py - 4} x2={eq.px + 4} y2={eq.py + 4} />
                    <line x1={eq.px + 4} y1={eq.py - 4} x2={eq.px - 4} y2={eq.py + 4} />
                  </g>
                ) : isStable ? (
                  // filled circle for stable / center
                  <circle
                    cx={eq.px}
                    cy={eq.py}
                    r={4}
                    fill={col}
                    stroke="var(--surface-elevated)"
                    strokeWidth="1"
                  />
                ) : (
                  // open circle for unstable
                  <circle
                    cx={eq.px}
                    cy={eq.py}
                    r={4}
                    fill="var(--surface-elevated)"
                    stroke={col}
                    strokeWidth="1.5"
                  />
                )}
                <text x={eq.lx} y={eq.ly} fontSize="9" fill="var(--text-muted)">
                  {eq.type === 'stable-node'
                    ? 'SN'
                    : eq.type === 'unstable-node'
                      ? 'UN'
                      : eq.type === 'stable-spiral'
                        ? 'SS'
                        : eq.type === 'unstable-spiral'
                          ? 'US'
                          : eq.type === 'center'
                            ? 'C'
                            : 'Sa'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* The nullcline key sits under the plot: inside it, the field's arrows run through it. */}
      {showNullclines && (
        <ul className="pp-legend">
          <li>
            <span className="pp-legend-sw pp-legend-sw-x" aria-hidden="true" />ẋ = 0
          </li>
          <li>
            <span className="pp-legend-sw pp-legend-sw-y" aria-hidden="true" />ẏ = 0
          </li>
        </ul>
      )}

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

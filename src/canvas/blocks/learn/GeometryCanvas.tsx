import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import type { GeometryCanvasProps, GeoSegment } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GeometryCanvasProps & { delay?: number };

const W = 320;
const H = 256;
const LEFT = 34; // y-axis tick labels
const RIGHT = 10;
const TOP = 14;
const BOT = 22; // x-axis tick labels

// Default accent when a color is not specified.
const DEFAULT_LINE = 'var(--text-secondary)';

// Point/vector labels share this font-size (see .lr-gc-pt-lbl / .lr-gc-vec-lbl); text can't be
// measured pre-render, so a generous per-char width estimate stands in for real metrics.
const LABEL_FONT = 9;
const CHAR_W = LABEL_FONT * 0.62;

/** Estimated on-screen width (SVG units) of a label at the shared point/vector font-size. */
function labelWidth(label: string): number {
  return label.length * CHAR_W;
}

/**
 * Adaptive placement for point labels: the offset from the dot grows with the label's own
 * width (a one-character label and a ten-character label can't share the same fixed 3px gap
 * without the long one either crowding the dot or, once several points cluster, colliding with
 * a neighbour's label). After the base offset, nearby labels are nudged apart along a small
 * ring of candidate directions so two labels never land on top of each other regardless of how
 * many points are plotted. Finally every box is clamped inside `bounds` — a label chased away
 * from a colliding neighbour can otherwise walk straight past the plot's edge.
 */
function layoutPointLabels(
  pts: { x: number; y: number; r: number; label: string }[],
  bounds: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' }[] {
  // Candidate directions (angle from the dot, SVG y-down) tried in order of preference —
  // upper-right first (matches the historical default), then rotating around the dot.
  const DIRS = [-45, -90, 0, 45, 90, -135, 135, 180].map((deg) => (deg * Math.PI) / 180);

  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const H_APPROX = LABEL_FONT * 1.15;

  /** Slide a box fully inside bounds, preferring not to move it at all. */
  function clampBox(box: { x: number; y: number; w: number; h: number }) {
    const maxX = Math.max(bounds.left, bounds.right - box.w);
    const maxY = Math.max(bounds.top, bounds.bottom - box.h);
    return {
      x: Math.min(Math.max(box.x, bounds.left), maxX),
      y: Math.min(Math.max(box.y, bounds.top), maxY),
      w: box.w,
      h: box.h,
    };
  }

  return pts.map((p) => {
    const w = labelWidth(p.label);
    const gap = 3;
    let best: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null = null;
    let bestCollisions = Infinity;

    for (const dir of DIRS) {
      const dist = p.r + gap + Math.max(w, H_APPROX) / 2;
      const cx = p.x + Math.cos(dir) * dist;
      const cy = p.y + Math.sin(dir) * dist;
      // Anchor toward the dot so the label grows away from it, not back over it.
      const anchor: 'start' | 'middle' | 'end' =
        Math.cos(dir) > 0.35 ? 'start' : Math.cos(dir) < -0.35 ? 'end' : 'middle';
      const boxX = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
      const box = clampBox({ x: boxX, y: cy - H_APPROX / 2, w, h: H_APPROX });

      const collisions = placed.reduce(
        (n, o) =>
          n +
          (box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y
            ? 1
            : 0),
        0,
      );
      if (collisions < bestCollisions) {
        bestCollisions = collisions;
        // Recover the anchor-relative point position from the clamped box so the label still
        // renders with the same textAnchor it was scored with.
        const px = anchor === 'start' ? box.x : anchor === 'end' ? box.x + w : box.x + w / 2;
        const py = box.y + H_APPROX / 2;
        best = { x: px, y: py, anchor };
        if (collisions === 0) break;
      }
    }

    const chosen = best ?? { x: p.x + p.r + gap, y: p.y, anchor: 'start' as const };
    const boxX =
      chosen.anchor === 'start'
        ? chosen.x
        : chosen.anchor === 'end'
          ? chosen.x - w
          : chosen.x - w / 2;
    placed.push(clampBox({ x: boxX, y: chosen.y - H_APPROX / 2, w, h: H_APPROX }));
    return chosen;
  });
}

/** Arrowhead polygon at the tip of a vector. Angle is in SVG radians (y-down). */
function Arrowhead({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const len = 9;
  const hw = 4;
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

/** Angle marker — arc or right-angle square — drawn at a vertex between two rays. */
function AngleMark({
  vx,
  vy,
  ax,
  ay,
  bx,
  by,
  label,
  color,
  rightAngle,
}: {
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  label?: string;
  color: string;
  rightAngle?: boolean;
}) {
  const r = 13;
  const la = Math.hypot(ax - vx, ay - vy) || 1;
  const lb = Math.hypot(bx - vx, by - vy) || 1;
  const ux = (ax - vx) / la,
    uy = (ay - vy) / la;
  const wx = (bx - vx) / lb,
    wy = (by - vy) / lb;

  if (rightAngle) {
    const s = r * 0.72;
    const p1x = vx + ux * s,
      p1y = vy + uy * s;
    const p3x = vx + wx * s,
      p3y = vy + wy * s;
    const p2x = p1x + wx * s,
      p2y = p1y + wy * s;
    return (
      <path
        d={`M ${p1x},${p1y} L ${p2x},${p2y} L ${p3x},${p3y}`}
        stroke={color}
        fill="none"
        className="lr-gc-angle-sq"
      />
    );
  }

  const sx = vx + ux * r,
    sy = vy + uy * r;
  const ex = vx + wx * r,
    ey = vy + wy * r;
  // Cross product in SVG coords (y-down); negative = clockwise sweep on screen
  const cross = ux * wy - uy * wx;
  const sweep = cross <= 0 ? 1 : 0;

  // Label placed in the bisector direction, outside the arc
  const mx = ux + wx,
    my = uy + wy;
  const ml = Math.hypot(mx, my) || 1;
  const lx = vx + (mx / ml) * (r + 9);
  const ly = vy + (my / ml) * (r + 9);

  return (
    <>
      <path
        d={`M ${sx},${sy} A ${r},${r} 0 0,${sweep} ${ex},${ey}`}
        stroke={color}
        fill="none"
        className="lr-gc-angle-arc"
      />
      {label && (
        <text x={lx} y={ly} className="lr-gc-lbl" textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
      )}
    </>
  );
}

export function GeometryCanvas({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xRange,
  yRange,
  xLabel,
  yLabel,
  showGrid = true,
  points = [],
  segments = [],
  polygons = [],
  circles = [],
  vectors = [],
  angles = [],
  annotations = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const clipId = useId();

  const { sx, sy, xTicks, yTicks, axisXsvg, axisYsvg } = useMemo(() => {
    // Collect all data-coord values to auto-fit the range.
    const allX = [
      ...points.map((p) => p.x),
      ...segments.flatMap((s) => [s.x1, s.x2]),
      ...polygons.flatMap((p) => p.vertices.map((v) => v.x)),
      ...circles.flatMap((c) => [c.cx - c.r, c.cx + c.r]),
      ...vectors.flatMap((v) => [v.x, v.x + v.dx]),
      ...angles.flatMap((a) => [a.vertex.x, a.from.x, a.to.x]),
      ...annotations.map((a) => a.x),
    ];
    const allY = [
      ...points.map((p) => p.y),
      ...segments.flatMap((s) => [s.y1, s.y2]),
      ...polygons.flatMap((p) => p.vertices.map((v) => v.y)),
      ...circles.flatMap((c) => [c.cy - c.r, c.cy + c.r]),
      ...vectors.flatMap((v) => [v.y, v.y + v.dy]),
      ...angles.flatMap((a) => [a.vertex.y, a.from.y, a.to.y]),
      ...annotations.map((a) => a.y),
    ];

    const ex = extent(allX);
    const ey = extent(allY);
    const [xMin, xMax] = xRange ?? (ex ? niceDomain(ex[0], ex[1]) : ([-5, 5] as [number, number]));
    const [yMin, yMax] = yRange ?? (ey ? niceDomain(ey[0], ey[1]) : ([-5, 5] as [number, number]));

    const scX = scaleLinear([xMin, xMax], [LEFT, W - RIGHT]);
    const scY = scaleLinear([yMin, yMax], [H - BOT, TOP]); // y-inverted for SVG

    // Axis lines clamped to the plot area
    const axY = Math.max(TOP, Math.min(H - BOT, scY(0)));
    const axX = Math.max(LEFT, Math.min(W - RIGHT, scX(0)));

    return {
      sx: scX,
      sy: scY,
      xTicks: scX.ticks(6),
      yTicks: scY.ticks(5),
      axisXsvg: axX,
      axisYsvg: axY,
    };
  }, [xRange, yRange, points, segments, polygons, circles, vectors, angles, annotations]);

  // Screen-space placement for every point label, computed together (not point-by-point) so
  // collision avoidance can see the whole cluster — a label near a crowded pile of points needs
  // to know about its neighbours, not just its own dot. Bounds pad a little past the plot's own
  // clip rect (labels near an edge point legitimately sit just outside it) but stay inside the
  // SVG canvas — every card clips overflow, so this keeps a chased-away label on-canvas instead
  // of collision avoidance walking it past the frame.
  const pointLabelPos = useMemo(
    () =>
      layoutPointLabels(
        points
          .filter((p) => p.label)
          .map((p) => ({ x: sx(p.x), y: sy(p.y), r: p.r ?? 4, label: p.label as string })),
        { left: 2, top: 2, right: W - 2, bottom: H - 2 },
      ),
    [points, sx, sy],
  );

  // SVG path for a segment with optional ray/line extension (clipped by clipPath).
  const segPath = (s: GeoSegment) => {
    const x1s = sx(s.x1),
      y1s = sy(s.y1);
    const x2s = sx(s.x2),
      y2s = sy(s.y2);
    if (s.extend === 'none' || !s.extend) return [x1s, y1s, x2s, y2s] as const;
    const dx = x2s - x1s,
      dy = y2s - y1s;
    const f = 30;
    if (s.extend === 'ray') return [x1s, y1s, x1s + dx * f, y1s + dy * f] as const;
    return [x1s - dx * f, y1s - dy * f, x1s + dx * f, y1s + dy * f] as const;
  };

  const clipRect = `M ${LEFT},${TOP} H ${W - RIGHT} V ${H - BOT} H ${LEFT} Z`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="lr-gc-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="lr-gc-svg" role="img" aria-label={title}>
          <defs>
            <clipPath id={clipId}>
              <path d={clipRect} />
            </clipPath>
          </defs>

          {/* Grid */}
          {showGrid && (
            <g className="lr-gc-grid" clipPath={`url(#${clipId})`}>
              {xTicks.map((t) => (
                <line key={`gx${t}`} x1={sx(t)} y1={TOP} x2={sx(t)} y2={H - BOT} />
              ))}
              {yTicks.map((t) => (
                <line key={`gy${t}`} x1={LEFT} y1={sy(t)} x2={W - RIGHT} y2={sy(t)} />
              ))}
            </g>
          )}

          {/* Axes */}
          <line x1={LEFT} y1={axisYsvg} x2={W - RIGHT} y2={axisYsvg} className="lr-gc-axis" />
          <line x1={axisXsvg} y1={TOP} x2={axisXsvg} y2={H - BOT} className="lr-gc-axis" />

          {/* Axis arrowheads */}
          <polygon
            points={`${W - RIGHT},${axisYsvg} ${W - RIGHT - 7},${axisYsvg - 3.5} ${W - RIGHT - 7},${axisYsvg + 3.5}`}
            className="lr-gc-axis-arrow"
          />
          <polygon
            points={`${axisXsvg},${TOP} ${axisXsvg - 3.5},${TOP + 7} ${axisXsvg + 3.5},${TOP + 7}`}
            className="lr-gc-axis-arrow"
          />

          {/* Tick labels */}
          {xTicks
            .filter((t) => t !== 0)
            .map((t) => (
              <text
                key={`xt${t}`}
                x={sx(t)}
                y={axisYsvg + 12}
                className="lr-gc-tick"
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
                x={axisXsvg - 6}
                y={sy(t) + 3}
                className="lr-gc-tick"
                textAnchor="end"
              >
                {t}
              </text>
            ))}

          {/* Axis labels */}
          {xLabel && (
            <text x={W - RIGHT - 4} y={axisYsvg - 7} className="lr-gc-axis-lbl" textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={axisXsvg + 5} y={TOP + 4} className="lr-gc-axis-lbl" textAnchor="start">
              {yLabel}
            </text>
          )}

          {/* Clipped geometry */}
          <g clipPath={`url(#${clipId})`}>
            {/* Polygons (drawn first, under segments) */}
            {polygons.map((pg, i) => {
              const col = pg.color || 'var(--presence)';
              const pts = pg.vertices.map((v) => `${sx(v.x)},${sy(v.y)}`).join(' ');
              return (
                <polygon
                  key={`pg${i}`}
                  points={pts}
                  stroke={col}
                  fill={pg.fill !== false ? `color-mix(in oklab, ${col} 16%, transparent)` : 'none'}
                  className="lr-gc-poly"
                >
                  {pg.label && <title>{pg.label}</title>}
                </polygon>
              );
            })}

            {/* Circles */}
            {circles.map((c, i) => {
              const col = c.color || 'var(--presence)';
              // Radius in SVG pixels: use the x-scale for consistency
              const rx = Math.abs(sx(c.cx + c.r) - sx(c.cx));
              return (
                <circle
                  key={`ci${i}`}
                  cx={sx(c.cx)}
                  cy={sy(c.cy)}
                  r={rx}
                  stroke={col}
                  fill={c.fill !== false ? `color-mix(in oklab, ${col} 14%, transparent)` : 'none'}
                  className="lr-gc-circle"
                >
                  {c.label && <title>{c.label}</title>}
                </circle>
              );
            })}

            {/* Segments / rays / lines */}
            {segments.map((s, i) => {
              const col = s.color || DEFAULT_LINE;
              const [x1, y1, x2, y2] = segPath(s);
              return (
                <line
                  key={`sg${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={col}
                  className={s.dashed ? 'lr-gc-seg lr-gc-seg--dash' : 'lr-gc-seg'}
                />
              );
            })}

            {/* Angle markers */}
            {angles.map((a, i) => (
              <AngleMark
                key={`ang${i}`}
                vx={sx(a.vertex.x)}
                vy={sy(a.vertex.y)}
                ax={sx(a.from.x)}
                ay={sy(a.from.y)}
                bx={sx(a.to.x)}
                by={sy(a.to.y)}
                label={a.label}
                color={a.color || DEFAULT_LINE}
                rightAngle={a.rightAngle}
              />
            ))}

            {/* Vectors */}
            {vectors.map((v, i) => {
              const col = v.color || 'var(--presence)';
              const x1s = sx(v.x),
                y1s = sy(v.y);
              const x2s = sx(v.x + v.dx),
                y2s = sy(v.y + v.dy);
              const angle = Math.atan2(y2s - y1s, x2s - x1s);
              const arrowLen = 10;
              // Shorten the line so it doesn't overlap the arrowhead tip
              const lx2 = x2s - Math.cos(angle) * arrowLen * 0.85;
              const ly2 = y2s - Math.sin(angle) * arrowLen * 0.85;
              const midX = (x1s + x2s) / 2;
              const midY = (y1s + y2s) / 2;
              const perpA = angle - Math.PI / 2;
              // A fixed 10px push clears a short label off a long vector, but a long label on a
              // short vector still rides the shaft — scale the push by half the label's own
              // width (so wide text clears its own bulk) and never let it collapse below the
              // vector's half-length, which is what made very short vectors collide worst.
              const vecLen = Math.hypot(x2s - x1s, y2s - y1s);
              const vecLblW = v.label ? labelWidth(v.label) : 0;
              const perpOffset = Math.max(10, vecLblW / 2 + 4, Math.min(vecLen / 2, vecLblW));
              return (
                <g key={`vec${i}`}>
                  <line x1={x1s} y1={y1s} x2={lx2} y2={ly2} stroke={col} className="lr-gc-vec" />
                  <Arrowhead x={x2s} y={y2s} angle={angle} color={col} />
                  {v.label && (
                    <text
                      x={midX + Math.cos(perpA) * perpOffset}
                      y={midY + Math.sin(perpA) * perpOffset}
                      fill={col}
                      className="lr-gc-vec-lbl"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {v.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Points (drawn last, on top). Labels are laid out together up front (see
                pointLabelPos) so an adaptive offset + collision nudge can spread them apart
                regardless of label length or how many points are plotted; `labelIdx` walks the
                filtered (label-only) positions in the same order they were built above. */}
            {(() => {
              let labelIdx = 0;
              return points.map((p, i) => {
                const col = p.color || 'var(--insight)';
                const r = p.r ?? 4;
                const lbl = p.label ? pointLabelPos[labelIdx++] : null;
                return (
                  <g key={`pt${i}`}>
                    <circle
                      cx={sx(p.x)}
                      cy={sy(p.y)}
                      r={r}
                      fill={p.open ? 'var(--surface-default)' : col}
                      stroke={col}
                      className="lr-gc-point"
                    />
                    {p.label && lbl && (
                      <text
                        x={lbl.x}
                        y={lbl.y}
                        fill={col}
                        className="lr-gc-pt-lbl"
                        textAnchor={lbl.anchor}
                        dominantBaseline="middle"
                      >
                        {p.label}
                      </text>
                    )}
                  </g>
                );
              });
            })()}

            {/* Annotations */}
            {annotations.map((a, i) => (
              <text
                key={`ann${i}`}
                x={sx(a.x)}
                y={sy(a.y)}
                fill={a.color || 'var(--text-secondary)'}
                className="lr-gc-ann"
                textAnchor={a.anchor ?? 'middle'}
              >
                {a.text}
              </text>
            ))}

            {/* Segment midpoint labels */}
            {segments
              .filter((s) => s.label)
              .map((s, i) => {
                const mx = sx((s.x1 + s.x2) / 2);
                const my = sy((s.y1 + s.y2) / 2);
                return (
                  <text key={`sgl${i}`} x={mx} y={my - 5} className="lr-gc-ann" textAnchor="middle">
                    {s.label}
                  </text>
                );
              })}
          </g>
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

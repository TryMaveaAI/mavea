import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { fitText } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';
import type { TernaryPlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TernaryPlotProps & { delay?: number };

const W = 380;
// Deep enough for the bottom edge (BY) plus the base corner labels: their first baseline sits at
// BASE_LABEL_GAP under it, and `fitText`'s maxLines lets a long axis name wrap onto a second line
// at CORNER_FS. An axis name only the fixture's length fits is the bug this height guards against.
const H = 356;
// Equilateral triangle: apex (component a) top-center, b bottom-left, c bottom-right.
// The side gutters hold the rotated edge ticks; the bottom holds ticks + corner labels.
const BX = 46;
const CX = 334;
const BY = 300;
const SIDE = CX - BX;
const AX = (BX + CX) / 2;
const AY = BY - (SIDE * Math.sqrt(3)) / 2;

// Font sizes here are viewBox USER UNITS, and a 380-unit viewBox renders around 320px wide in a
// canvas card — roughly 0.85 screen px per unit. Type therefore has to be authored ABOVE the 9px
// legibility floor to clear it once scaled down (9 ÷ 0.85 ≈ 10.6). Labels wrap rather than shrink
// past this floor; .ter-tick carries the same number for the edge ticks.
const MIN_FS = 11.5;
const CORNER_FS = 13;
const LABEL_FS = 12;
const TICK_LABEL_GAP = 16; // bottom-edge tick baseline, below the triangle
const EDGE_LABEL_OUT = 15; // rotated edge tick offset, along the outward normal of its edge
// The rotated edge ticks step out along their edge's outward normal, which sits 30° off
// horizontal on an equilateral triangle — split once here so both edges stay symmetric.
const EDGE_NX = EDGE_LABEL_OUT * Math.cos(Math.PI / 6);
const EDGE_NY = EDGE_LABEL_OUT * Math.sin(Math.PI / 6);
const POINT_R = 5.5; // the hover-state marker radius, the larger of the two
const APEX_LABEL_GAP = 12; // apex corner-label baseline, above the top vertex
const BASE_LABEL_GAP = 34; // first base corner-label baseline, below the bottom edge

const ZONE_PALETTE = [
  'var(--insight)',
  'var(--warning)',
  'var(--presence)',
  'var(--danger)',
  'var(--presence-deep)',
];

interface Bary {
  a: number;
  b: number;
  c: number;
}

/** Barycentric → screen. Weights must already be normalized (a+b+c = 1). */
function toXY(p: Bary): { x: number; y: number } {
  return {
    x: p.a * AX + p.b * BX + p.c * CX,
    y: p.a * AY + p.b * BY + p.c * BY,
  };
}

/** Normalize a raw (a,b,c) triple by its own sum; null when the triple can't sit on the
 *  simplex (non-finite, negative, or all-zero — there is no honest place to put it). */
function normalize(o: Record<string, unknown>): Bary | null {
  const a = typeof o.a === 'number' ? o.a : NaN;
  const b = typeof o.b === 'number' ? o.b : NaN;
  const c = typeof o.c === 'number' ? o.c : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  if (a < 0 || b < 0 || c < 0) return null;
  const sum = a + b + c;
  if (!(sum > 0)) return null;
  return { a: a / sum, b: b / sum, c: c / sum };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function TernaryPlot({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  axes,
  points,
  zones,
  unit,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<number | null>(null);

  const ax = axes && typeof axes === 'object' ? axes : { a: 'A', b: 'B', c: 'C' };
  const cornerLabel = (raw: unknown, fall: string) => {
    const base = typeof raw === 'string' && raw.trim() ? raw.trim() : fall;
    return typeof unit === 'string' && unit.trim() ? `${base} (${unit.trim()})` : base;
  };
  const labA = cornerLabel(ax.a, 'A');
  const labB = cornerLabel(ax.b, 'B');
  const labC = cornerLabel(ax.c, 'C');

  const validPoints = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .map((p, i) => {
          const o = p && typeof p === 'object' ? (p as unknown as Record<string, unknown>) : {};
          const bary = normalize(o);
          if (!bary) return null;
          const label =
            typeof o.label === 'string' && o.label.trim() ? o.label.trim() : `Point ${i + 1}`;
          return { label, bary, ...toXY(bary) };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [points],
  );

  const validZones = useMemo(
    () =>
      (Array.isArray(zones) ? zones : [])
        .map((z, i) => {
          const o = z && typeof z === 'object' ? (z as unknown as Record<string, unknown>) : {};
          const verts = (Array.isArray(o.vertices) ? o.vertices : [])
            .map((v) =>
              v && typeof v === 'object'
                ? normalize(v as unknown as Record<string, unknown>)
                : null,
            )
            .filter((v): v is Bary => v !== null)
            .map(toXY);
          if (verts.length < 3) return null;
          const label = typeof o.label === 'string' ? o.label.trim() : '';
          const color =
            typeof o.color === 'string' && o.color.trim()
              ? o.color
              : ZONE_PALETTE[i % ZONE_PALETTE.length];
          const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
          const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
          const xs = verts.map((v) => v.x);
          const width = Math.max(...xs) - Math.min(...xs);
          return { label, color, verts, cx, cy, width };
        })
        .filter((z): z is NonNullable<typeof z> => z !== null),
    [zones],
  );

  // A zone label names a REGION, so it may sit anywhere inside that region — but parked on the
  // centroid it lands exactly where a data point tends to fall, and the marker then sits on the
  // word (the soil fixture buried "Loam", "Sand" and "Silt" that way). Nudge the label clear of
  // any marker covering it, staying inside its own polygon; a label that names the area is free to
  // move within it, whereas the point is a coordinate and must not.
  const zoneLabelY = useMemo(() => {
    const halfH = LABEL_FS * 0.7; // half a line of zone type
    const clear = POINT_R + 4; // hover radius plus breathing room
    return validZones.map((z) => {
      const halfW = Math.max(20, Math.min(z.width * 0.45, 55));
      const covered = (y: number): number =>
        validPoints.filter(
          (pt) => Math.abs(pt.x - z.cx) < halfW + clear && Math.abs(pt.y - y) < halfH + clear,
        ).length;
      if (covered(z.cy) === 0) return z.cy;
      const ys = z.verts.map((v) => v.y);
      const step = halfH + clear + 2;
      const up = Math.max(Math.min(...ys) + halfH + 2, z.cy - step);
      const down = Math.min(Math.max(...ys) - halfH - 2, z.cy + step);
      const upHits = covered(up);
      const downHits = covered(down);
      if (upHits === 0 && downHits === 0)
        return Math.abs(up - z.cy) <= Math.abs(down - z.cy) ? up : down;
      if (upHits === 0) return up;
      if (downHits === 0) return down;
      return upHits <= downHits ? up : down;
    });
  }, [validZones, validPoints]);

  // 20% gridlines parallel to each edge, plus the matching edge tick positions. Each
  // gridline of constant component k joins the two edge points where k equals that fraction.
  const grid = useMemo(() => {
    const lines: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
    const ticksBottom: { x: number; y: number; v: number }[] = [];
    const ticksRight: { x: number; y: number; v: number }[] = [];
    const ticksLeft: { x: number; y: number; v: number }[] = [];
    for (let f = 0.2; f < 0.99; f += 0.2) {
      const g = Math.round(f * 100) / 100;
      lines.push({ p1: toXY({ a: g, b: 1 - g, c: 0 }), p2: toXY({ a: g, b: 0, c: 1 - g }) });
      lines.push({ p1: toXY({ a: 1 - g, b: g, c: 0 }), p2: toXY({ a: 0, b: g, c: 1 - g }) });
      lines.push({ p1: toXY({ a: 1 - g, b: 0, c: g }), p2: toXY({ a: 0, b: 1 - g, c: g }) });
      // Counterclockwise ternary convention: bottom edge reads c, right edge a, left edge b.
      ticksBottom.push({ ...toXY({ a: 0, b: 1 - g, c: g }), v: g });
      ticksRight.push({ ...toXY({ a: g, b: 0, c: 1 - g }), v: g });
      ticksLeft.push({ ...toXY({ a: 1 - g, b: g, c: 0 }), v: g });
    }
    return { lines, ticksBottom, ticksRight, ticksLeft };
  }, []);

  const hasContent = validPoints.length > 0 || validZones.length > 0;
  const active = hover !== null ? validPoints[hover] : null;

  // Corner labels wrap (never truncate): the apex label grows upward, the base labels grow
  // downward, and the base widths keep even a centered two-liner inside the viewBox.
  const fitA = fitText(labA, {
    maxWidth: 150,
    fontSize: CORNER_FS,
    minFontSize: MIN_FS,
    maxLines: 2,
    bold: true,
  });
  const fitB = fitText(labB, {
    maxWidth: 88,
    fontSize: CORNER_FS,
    minFontSize: MIN_FS,
    maxLines: 2,
    bold: true,
  });
  const fitC = fitText(labC, {
    maxWidth: 88,
    fontSize: CORNER_FS,
    minFontSize: MIN_FS,
    maxLines: 2,
    bold: true,
  });

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {hasContent ? (
        <div className="ter-wrap" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="ter-svg" role="img" aria-label={title}>
            {/* gridlines under everything */}
            {grid.lines.map((l, i) => (
              <line key={i} x1={l.p1.x} y1={l.p1.y} x2={l.p2.x} y2={l.p2.y} className="ter-grid" />
            ))}

            {/* zones beneath the points */}
            {validZones.map((z, i) => (
              <g
                key={i}
                className="m-stagger-item"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <polygon
                  points={z.verts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')}
                  fill={`color-mix(in oklab, ${z.color} 16%, transparent)`}
                  stroke={`color-mix(in oklab, ${z.color} 45%, transparent)`}
                  className="ter-zone"
                />
                {z.label &&
                  (() => {
                    // Sized from the component's own floor, not a literal: MIN_FS is what clears
                    // 9px once the 380-unit viewBox is scaled into a card, and a shrink-to-fit
                    // that ignores it just relocates the illegibility into the wrap path.
                    const fit = fitText(z.label, {
                      maxWidth: Math.max(40, Math.min(z.width * 0.9, 110)),
                      fontSize: LABEL_FS,
                      minFontSize: MIN_FS,
                      maxLines: 2,
                    });
                    const y0 =
                      (zoneLabelY[i] ?? z.cy) - ((fit.lines.length - 1) * fit.lineHeightPx) / 2;
                    return (
                      <text
                        textAnchor="middle"
                        fontSize={fit.fontSize}
                        className="ter-zone-lbl"
                        style={{ fill: `color-mix(in oklab, ${z.color} 55%, var(--text-muted))` }}
                      >
                        {fit.lines.map((ln, li) => (
                          <tspan key={li} x={z.cx} y={y0 + li * fit.lineHeightPx}>
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    );
                  })()}
              </g>
            ))}

            {/* triangle frame */}
            <polygon
              points={`${AX},${AY} ${BX},${BY} ${CX},${BY}`}
              className="ter-frame"
              fill="none"
            />

            {/* bottom edge ticks (component c) */}
            {grid.ticksBottom.map((t, i) => (
              <g key={i}>
                <line x1={t.x} y1={t.y} x2={t.x} y2={t.y + 4} className="ter-tick-mark" />
                <text x={t.x} y={t.y + TICK_LABEL_GAP} textAnchor="middle" className="ter-tick">
                  {Math.round(t.v * 100)}
                </text>
              </g>
            ))}
            {/* right edge ticks (component a), rotated to run along the edge */}
            {grid.ticksRight.map((t, i) => (
              <g key={i}>
                <line x1={t.x} y1={t.y} x2={t.x + 3.5} y2={t.y - 2} className="ter-tick-mark" />
                <text
                  transform={`translate(${t.x + EDGE_NX}, ${t.y - EDGE_NY}) rotate(60)`}
                  textAnchor="middle"
                  className="ter-tick"
                >
                  {Math.round(t.v * 100)}
                </text>
              </g>
            ))}
            {/* left edge ticks (component b), rotated the opposite way */}
            {grid.ticksLeft.map((t, i) => (
              <g key={i}>
                <line x1={t.x} y1={t.y} x2={t.x - 3.5} y2={t.y - 2} className="ter-tick-mark" />
                <text
                  transform={`translate(${t.x - EDGE_NX}, ${t.y - EDGE_NY}) rotate(-60)`}
                  textAnchor="middle"
                  className="ter-tick"
                >
                  {Math.round(t.v * 100)}
                </text>
              </g>
            ))}

            {/* corner labels — apex stacks upward, base corners stack downward */}
            <text textAnchor="middle" fontSize={fitA.fontSize} className="ter-corner">
              {fitA.lines.map((ln, li) => (
                <tspan
                  key={li}
                  x={AX}
                  y={AY - APEX_LABEL_GAP - (fitA.lines.length - 1 - li) * fitA.lineHeightPx}
                >
                  {ln}
                </tspan>
              ))}
            </text>
            <text textAnchor="middle" fontSize={fitB.fontSize} className="ter-corner">
              {fitB.lines.map((ln, li) => (
                <tspan key={li} x={BX} y={BY + BASE_LABEL_GAP + li * fitB.lineHeightPx}>
                  {ln}
                </tspan>
              ))}
            </text>
            <text textAnchor="middle" fontSize={fitC.fontSize} className="ter-corner">
              {fitC.lines.map((ln, li) => (
                <tspan key={li} x={CX} y={BY + BASE_LABEL_GAP + li * fitC.lineHeightPx}>
                  {ln}
                </tspan>
              ))}
            </text>

            {/* points + labels */}
            {validPoints.map((p, i) => {
              const left = p.x > CX - 70;
              const nearbyZone = validZones
                .map((z, zi) => ({ z, y: zoneLabelY[zi] ?? z.cy }))
                .find(({ z, y }) => z.label && Math.abs(p.x - z.cx) < 60 && Math.abs(p.y - y) < 28);
              const labelY = nearbyZone ? p.y + (p.y >= nearbyZone.y ? 13 : -14) : p.y - 5;
              const labelOnLeft = left || !!nearbyZone;
              const fit = fitText(p.label, {
                maxWidth: 86,
                fontSize: LABEL_FS,
                minFontSize: MIN_FS,
                maxLines: 2,
              });
              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hover === i ? POINT_R : 4}
                    className="ter-pt"
                    onMouseEnter={() => setHover(i)}
                  >
                    <title>{`${p.label} — ${labA.split(' (')[0]} ${pct(p.bary.a)}, ${labB.split(' (')[0]} ${pct(p.bary.b)}, ${labC.split(' (')[0]} ${pct(p.bary.c)}`}</title>
                  </circle>
                  <text
                    textAnchor={labelOnLeft ? 'end' : 'start'}
                    fontSize={fit.fontSize}
                    className="ter-pt-lbl"
                  >
                    {fit.lines.map((ln, li) => (
                      <tspan
                        key={li}
                        x={p.x + (labelOnLeft ? -7 : 7)}
                        y={labelY + li * fit.lineHeightPx}
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* hover read-out, height reserved so the card never shifts */}
          <div className="ter-read" aria-live="polite">
            {active && (
              <>
                <strong>{active.label}</strong> · {labA.split(' (')[0]} {pct(active.bary.a)} ·{' '}
                {labB.split(' (')[0]} {pct(active.bary.b)} · {labC.split(' (')[0]}{' '}
                {pct(active.bary.c)}
              </>
            )}
          </div>
        </div>
      ) : (
        <BlockEmpty
          message="No plottable compositions"
          hint="Each point needs non-negative a, b, c values that sum above zero"
        />
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

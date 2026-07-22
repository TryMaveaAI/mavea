// GradientDescent — a loss surface (heatmap + contour isolines, the same marching-squares-style
// technique SurfacePlot uses) with the optimizer's real descent path traced over it. The surface
// is a caller-supplied rectilinear mesh (grid[0] is the top row; every row shares the same
// x-samples, every column shares the same y-samples) — nothing here interpolates a fake trend or
// regresses new geometry, it only reads the mesh and the visited path back.
import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { usePathDraw } from '../../lib/motion';
import { formatValue } from '../../lib/format';
import type { GradientDescentProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GradientDescentProps & { delay?: number };

const W = 320;
const H = 260;
const PAD = { l: 42, r: 32, t: 16, b: 34 };
const LEVELS = 6; // iso-line threshold bands, matching SurfacePlot's default

/** Loss-surface colour ramp: cool/blue at the minimum, warm/red at the maximum — the same
 *  convention SurfacePlot uses for a scalar field, so the two read as one visual language. */
function lossColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const h = Math.round(220 - c * 220);
  return `hsl(${h}, 70%, ${Math.round(50 + c * 8)}%)`;
}

function fmtZ(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1000 || abs < 0.001)) return v.toExponential(1);
  return abs >= 10 ? v.toFixed(1) : v.toFixed(2);
}

/** Interior boundaries between adjacent samples (their midpoints), bracketed by the plot's own
 *  edges — turns N sample centres into N Voronoi-style cells that tile the axis with no gaps.
 *
 *  Takes PIXEL positions, not data values. That distinction is the whole point: the midpoints and
 *  the brackets have to live in the same coordinate space, and passing raw data values while
 *  bracketing with pixel edges silently mixed the two — a domain of, say, -2…2 against a left edge
 *  of 42px yields a first cell 43px WIDE IN THE WRONG DIRECTION, which is an SVG rect with a
 *  negative width that Chrome refuses to draw at all.
 *
 *  The scale may also invert (screen y grows downward, so ascending data descends in pixels), so the
 *  edges are attached to whichever end each one actually belongs to rather than assumed in order. */
function cellBounds(pix: number[], edgeA: number, edgeB: number): number[] {
  const lo = Math.min(edgeA, edgeB);
  const hi = Math.max(edgeA, edgeB);
  if (pix.length === 0) return [lo, hi];
  const ascending = pix[0] <= pix[pix.length - 1];
  const out = [ascending ? lo : hi];
  for (let i = 0; i < pix.length - 1; i++) out.push((pix[i] + pix[i + 1]) / 2);
  out.push(ascending ? hi : lo);
  return out;
}

export function GradientDescent({
  title,
  icon,
  iconColor = 'var(--presence)',
  contour,
  path = [],
  learningRate,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon ?? 'chart'] ?? Icon.chart;
  const pathRef = useRef<SVGPathElement>(null);

  const geom = useMemo(() => {
    if (!contour || contour.length === 0 || !contour[0] || contour[0].length === 0) return null;
    const rows = contour.length;
    const cols = contour[0].length;

    const colXs = contour[0].map((p) => p.x);
    const rowYs = contour.map((r) => r[0]?.y ?? 0);
    const zs = contour.flat().map((p) => p.z);
    const exZ = extent(zs);
    if (!exZ) return null;

    const exX = extent([...colXs, ...path.map((p) => p.x)]);
    const exY = extent([...rowYs, ...path.map((p) => p.y)]);
    if (!exX || !exY) return null;
    const [xMin, xMax] = niceDomain(exX[0], exX[1]);
    const [yMin, yMax] = niceDomain(exY[0], exY[1]);
    const [zMin, zMax] = exZ;
    const zSpan = zMax - zMin || 1;

    const plotL = PAD.l;
    const plotR = W - PAD.r;
    const plotT = PAD.t;
    const plotB = H - PAD.b;

    const sx = scaleLinear([xMin, xMax], [plotL, plotR]);
    const sy = scaleLinear([yMin, yMax], [plotB, plotT]);
    const colPix = colXs.map(sx);
    const rowPix = rowYs.map(sy);
    const colBounds = cellBounds(colPix, plotL, plotR);
    const rowBounds = cellBounds(rowPix, plotT, plotB);

    const cells: { x: number; y: number; w: number; h: number; color: string }[] = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const z = contour[i]?.[j]?.z;
        if (z === undefined) continue;
        // Take the span between the two boundaries, whichever way round they run — the y scale is
        // inverted, so rows descend in pixels. An <svg> rect cannot carry a negative size.
        const x0 = colBounds[j];
        const x1 = colBounds[j + 1];
        const y0 = rowBounds[i];
        const y1 = rowBounds[i + 1];
        cells.push({
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          w: Math.abs(x1 - x0) + 0.5,
          h: Math.abs(y1 - y0) + 0.5,
          // sqrt the normalised loss before colouring: a ravine's steep walls occupy most of the
          // plot at high loss, so a linear ramp floods everything one warm colour and buries the
          // valley. sqrt spreads the low-loss detail across the cool end, so the ravine's shape and
          // its gradient toward the walls actually read. (Endpoints are unchanged, so the legend,
          // which only labels min/max, stays exact.)
          color: lossColor(Math.sqrt((z - zMin) / zSpan)),
        });
      }
    }

    // Marching-squares-style iso-lines, same technique as SurfacePlot: for each threshold band,
    // find where a row-adjacent or column-adjacent pair of samples straddles it and draw a short
    // segment spanning that pair's cell at the interpolated crossing position.
    const isoLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let li = 1; li < LEVELS; li++) {
      // Match the sqrt colour scale: squared level spacing puts more iso-lines through the low-loss
      // valley (where the interesting structure is) instead of bunching them up the steep walls.
      const zIso = zMin + (li / LEVELS) ** 2 * zSpan;
      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols; j++) {
          const a = contour[i]?.[j];
          const b = contour[i + 1]?.[j];
          if (!a || !b) continue;
          if ((a.z - zIso) * (b.z - zIso) < 0) {
            const t = (zIso - a.z) / (b.z - a.z);
            const y = rowPix[i] + (rowPix[i + 1] - rowPix[i]) * t;
            isoLines.push({ x1: colBounds[j], y1: y, x2: colBounds[j + 1], y2: y });
          }
        }
      }
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const a = contour[i]?.[j];
          const b = contour[i]?.[j + 1];
          if (!a || !b) continue;
          if ((a.z - zIso) * (b.z - zIso) < 0) {
            const t = (zIso - a.z) / (b.z - a.z);
            const x = colPix[j] + (colPix[j + 1] - colPix[j]) * t;
            isoLines.push({ x1: x, y1: rowBounds[i], x2: x, y2: rowBounds[i + 1] });
          }
        }
      }
    }

    const xTicks = sx.ticks(4);
    const yTicks = sy.ticks(4);

    return { sx, sy, cells, isoLines, zMin, zMax, plotT, plotB, xTicks, yTicks };
  }, [contour, path]);

  const pathGeom = useMemo(() => {
    if (!geom || path.length === 0) return null;
    const sorted = [...path].sort((a, b) => a.step - b.step);
    const pts = sorted.map((p) => ({ x: geom.sx(p.x), y: geom.sy(p.y), step: p.step }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('');
    return { pts, d };
  }, [geom, path]);

  // Path draws in after the loss surface has painted; step dots (the "dotted trail") follow.
  // A dashed stroke pattern can't compose with usePathDraw's own dash-based reveal (both would
  // fight over stroke-dasharray), so the connecting stroke draws on as a plain solid line and
  // the per-step dots carry the dotted character instead.
  usePathDraw(pathRef, { delay: (delay ?? 0) + 260 });

  if (!geom) {
    return (
      <div
        className="card reveal c2"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title || 'Gradient descent'}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
            No data
          </text>
        </svg>
      </div>
    );
  }

  const { cells, isoLines, zMin, zMax, plotT, plotB, xTicks, yTicks } = geom;
  const legendX = W - PAD.r + 6;
  const legendH = plotB - plotT;
  const legendSteps = 14;
  const legendCellH = legendH / legendSteps;
  const maxStagger = 24; // cap so a very long run of steps doesn't push late dots minutes out

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Gradient descent'}
      </div>
      <div className="gd-wrap">
        <svg
          role="img"
          aria-label={title || 'gradient descent on a loss surface'}
          viewBox={`0 0 ${W} ${H}`}
          className="gd-svg"
        >
          {cells.map((c, idx) => (
            <rect key={idx} x={c.x} y={c.y} width={c.w} height={c.h} fill={c.color} />
          ))}
          {isoLines.map((l, idx) => (
            <line
              key={idx}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="white"
              strokeWidth={0.6}
              opacity={0.45}
            />
          ))}

          {xTicks.map((t, i) => (
            <text
              key={`xt${i}`}
              x={geom.sx(t)}
              y={plotB + 13}
              className="gd-tick"
              textAnchor="middle"
            >
              {t}
            </text>
          ))}
          {yTicks.map((t, i) => (
            <text
              key={`yt${i}`}
              x={PAD.l - 5}
              y={geom.sy(t) + 3}
              className="gd-tick"
              textAnchor="end"
            >
              {t}
            </text>
          ))}

          {/* colour legend for the loss scale */}
          {Array.from({ length: legendSteps }, (_, i) => (
            <rect
              key={`leg${i}`}
              x={legendX}
              y={plotT + i * legendCellH}
              width={6}
              height={legendCellH + 0.5}
              fill={lossColor((legendSteps - 1 - i) / (legendSteps - 1))}
            />
          ))}
          <text x={legendX + 3} y={plotT - 3} textAnchor="middle" className="gd-legend-lbl">
            {fmtZ(zMax)}
          </text>
          <text x={legendX + 3} y={plotB + 10} textAnchor="middle" className="gd-legend-lbl">
            {fmtZ(zMin)}
          </text>

          {pathGeom && (
            <>
              <path ref={pathRef} d={pathGeom.d} className="gd-path" fill="none" />
              {pathGeom.pts.map((p, i) => {
                const isStart = i === 0;
                const isEnd = i === pathGeom.pts.length - 1 && pathGeom.pts.length > 1;
                const cls = isEnd
                  ? 'gd-step gd-step-end'
                  : isStart
                    ? 'gd-step gd-step-start'
                    : 'gd-step';
                return (
                  <circle
                    key={`step-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={isEnd || isStart ? 4 : 2.4}
                    className={`${cls} m-scale-in`}
                    style={
                      {
                        ['--delay' as string]: `${(delay ?? 0) + 260 + Math.min(i, maxStagger) * 45}ms`,
                      } as CSSProperties
                    }
                  />
                );
              })}
            </>
          )}
        </svg>
      </div>
      {(learningRate !== undefined || pathGeom) && (
        <p className="gd-caption">
          {learningRate !== undefined && <>Learning rate {formatValue(learningRate)}</>}
          {learningRate !== undefined && pathGeom && ' · '}
          {pathGeom && <>{pathGeom.pts.length} steps</>}
        </p>
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

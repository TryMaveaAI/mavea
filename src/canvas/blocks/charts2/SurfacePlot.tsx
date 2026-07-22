import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SurfacePlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SurfacePlotProps & { delay?: number };

const W = 320;
const H = 248;
const PAD = { l: 44, r: 20, t: 16, b: 38 };

function zToHsl(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const h = Math.round(220 - clamped * 220);
  const s = 72;
  const l = Math.round(50 + clamped * 10);
  return `hsl(${h},${s}%,${l}%)`;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 1000) return v.toExponential(1);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(2);
}

export function SurfacePlot({
  title,
  icon,
  iconColor = 'var(--presence)',
  grid,
  zRange,
  mode = 'contour',
  levels = 6,
  xLabel,
  yLabel,
  zLabel,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon ?? 'chart'] ?? Icon.chart;

  const geom = useMemo(() => {
    if (!grid || grid.length === 0 || !grid[0] || grid[0].length === 0) return null;

    const rows = grid.length;
    const cols = grid[0].length;
    const allVals = grid.flat();
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const zMin = zRange ? zRange[0] : rawMin;
    const zMax = zRange ? zRange[1] : rawMax;
    const zSpan = zMax - zMin || 1;

    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const cellW = plotW / cols;
    const cellH = plotH / rows;

    const norm = (z: number) => (z - zMin) / zSpan;

    // Heatmap cells
    const cells: { x: number; y: number; w: number; h: number; color: string }[] = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        cells.push({
          x: PAD.l + j * cellW,
          y: PAD.t + i * cellH,
          w: cellW + 0.5, // slight overlap to avoid hairlines
          h: cellH + 0.5,
          color: zToHsl(norm(grid[i][j])),
        });
      }
    }

    // Contour iso-lines
    const isoLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (mode === 'contour' && levels > 0) {
      for (let li = 1; li < levels; li++) {
        const zISO = zMin + (li / levels) * zSpan;
        // Horizontal edges: between row i and i+1, along each column j..j+1
        for (let i = 0; i < rows - 1; i++) {
          for (let j = 0; j < cols; j++) {
            const za = grid[i][j];
            const zb = grid[i + 1][j];
            if ((za - zISO) * (zb - zISO) < 0) {
              const t = (zISO - za) / (zb - za);
              const y = PAD.t + (i + t) * cellH;
              const x1 = PAD.l + j * cellW;
              const x2 = x1 + cellW;
              isoLines.push({ x1, y1: y, x2, y2: y });
            }
          }
        }
        // Vertical edges: between col j and j+1, along each row i..i+1
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols - 1; j++) {
            const za = grid[i][j];
            const zb = grid[i][j + 1];
            if ((za - zISO) * (zb - zISO) < 0) {
              const t = (zISO - za) / (zb - za);
              const x = PAD.l + (j + t) * cellW;
              const y1 = PAD.t + i * cellH;
              const y2 = y1 + cellH;
              isoLines.push({ x1: x, y1, x2: x, y2 });
            }
          }
        }
      }
    }

    // Axis tick positions
    const xTicks = [
      { label: '0', x: PAD.l },
      { label: String(Math.round((cols - 1) / 2)), x: PAD.l + plotW / 2 },
      { label: String(cols - 1), x: PAD.l + plotW },
    ];
    const yTicks = [
      { label: String(rows - 1), y: PAD.t },
      { label: String(Math.round((rows - 1) / 2)), y: PAD.t + plotH / 2 },
      { label: '0', y: PAD.t + plotH },
    ];

    return {
      rows,
      cols,
      cells,
      isoLines,
      zMin,
      zMax,
      norm,
      plotW,
      plotH,
      cellW,
      cellH,
      xTicks,
      yTicks,
    };
  }, [grid, zRange, mode, levels]);

  const wireframe = useMemo(() => {
    if (mode !== 'surface3d' || !geom) return null;
    const { rows, cols, zMin, zMax, norm } = geom;
    const zSpan = zMax - zMin || 1;

    const step = Math.max(1, Math.floor(Math.max(rows, cols) / 20));
    const sRows = Math.ceil(rows / step);
    const sCols = Math.ceil(cols / step);

    function project(xi: number, yi: number, zi: number) {
      const xn = xi / Math.max(sCols - 1, 1);
      const yn = yi / Math.max(sRows - 1, 1);
      const zn = (zi - zMin) / zSpan;
      const angle = Math.PI / 6;
      const scaleXY = 0.55 * Math.min(W - PAD.l - PAD.r, H - PAD.t - PAD.b);
      const scaleZ = 0.3 * (H - PAD.t - PAD.b);
      const px = W / 2 + (xn - yn) * Math.cos(angle) * scaleXY;
      const py = H - PAD.b - (xn + yn) * Math.sin(angle) * scaleXY - zn * scaleZ;
      return { px, py };
    }

    // Build subsampled grid
    const sg: number[][] = [];
    for (let si = 0; si < sRows; si++) {
      const row: number[] = [];
      for (let sj = 0; sj < sCols; sj++) {
        row.push(grid[Math.min(si * step, rows - 1)][Math.min(sj * step, cols - 1)]);
      }
      sg.push(row);
    }

    const segments: {
      p1: { px: number; py: number };
      p2: { px: number; py: number };
      color: string;
      depth: number;
    }[] = [];

    // x-direction lines (vary j, fixed i)
    for (let si = 0; si < sRows; si++) {
      for (let sj = 0; sj < sCols - 1; sj++) {
        const avgZ = (sg[si][sj] + sg[si][sj + 1]) / 2;
        segments.push({
          p1: project(sj, si, sg[si][sj]),
          p2: project(sj + 1, si, sg[si][sj + 1]),
          color: zToHsl(norm(avgZ)),
          depth: si + sj,
        });
      }
    }

    // y-direction lines (fixed j, vary i)
    for (let si = 0; si < sRows - 1; si++) {
      for (let sj = 0; sj < sCols; sj++) {
        const avgZ = (sg[si][sj] + sg[si + 1][sj]) / 2;
        segments.push({
          p1: project(sj, si, sg[si][sj]),
          p2: project(sj, si + 1, sg[si + 1][sj]),
          color: zToHsl(norm(avgZ)),
          depth: si + sj,
        });
      }
    }

    segments.sort((a, b) => b.depth - a.depth);

    // z-axis label position
    const topPt = project(0, 0, zMax);
    const botPt = project(0, 0, zMin);

    return { segments, topPt, botPt };
  }, [mode, geom, grid]);

  if (!geom) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title || 'Surface Plot'}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
            No data
          </text>
        </svg>
      </div>
    );
  }

  const { cells, isoLines, zMin, zMax, plotH, xTicks, yTicks } = geom;
  const legendX = W - PAD.r + 4;
  const legendH = plotH;
  const legendSteps = 16;
  const legendCellH = legendH / legendSteps;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Surface Plot'}
      </div>
      <svg
        role="img"
        aria-label={title || 'surface plot'}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {mode !== 'surface3d' ? (
          <>
            {/* Heatmap cells */}
            {cells.map((c, idx) => (
              <rect key={idx} x={c.x} y={c.y} width={c.w} height={c.h} fill={c.color} />
            ))}

            {/* Contour iso-lines */}
            {isoLines.map((l, idx) => (
              <line
                key={idx}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="white"
                strokeWidth={0.6}
                opacity={0.5}
              />
            ))}

            {/* X-axis ticks */}
            {xTicks.map((t, i) => (
              <text
                key={i}
                x={t.x}
                y={H - PAD.b + 12}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {t.label}
              </text>
            ))}

            {/* X-axis label */}
            {xLabel && (
              <text
                x={PAD.l + (W - PAD.l - PAD.r) / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {xLabel}
              </text>
            )}

            {/* Y-axis ticks */}
            {yTicks.map((t, i) => (
              <text
                key={i}
                x={PAD.l - 4}
                y={t.y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {t.label}
              </text>
            ))}

            {/* Y-axis label */}
            {yLabel && (
              <text
                x={0}
                y={0}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
                transform={`translate(10, ${PAD.t + plotH / 2}) rotate(-90)`}
              >
                {yLabel}
              </text>
            )}

            {/* Color legend */}
            {Array.from({ length: legendSteps }, (_, i) => (
              <rect
                key={i}
                x={legendX}
                y={PAD.t + i * legendCellH}
                width={6}
                height={legendCellH + 0.5}
                fill={zToHsl((legendSteps - 1 - i) / (legendSteps - 1))}
              />
            ))}
            <text
              x={legendX + 3}
              y={PAD.t - 2}
              textAnchor="middle"
              fontSize={8}
              fill="var(--text-muted)"
            >
              {fmt(zMax)}
            </text>
            <text
              x={legendX + 3}
              y={PAD.t + legendH + 9}
              textAnchor="middle"
              fontSize={8}
              fill="var(--text-muted)"
            >
              {fmt(zMin)}
            </text>
          </>
        ) : wireframe ? (
          <>
            {wireframe.segments.map((s, idx) => (
              <line
                key={idx}
                x1={s.p1.px}
                y1={s.p1.py}
                x2={s.p2.px}
                y2={s.p2.py}
                stroke={s.color}
                strokeWidth={0.9}
              />
            ))}
            {zLabel && (
              <text
                x={wireframe.topPt.px - 8}
                y={wireframe.topPt.py}
                fontSize={9}
                fill="var(--text-muted)"
                textAnchor="end"
              >
                {zLabel}
              </text>
            )}
          </>
        ) : null}
      </svg>
      {caption && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.3 }}>
          {caption}
        </p>
      )}
      {footer && <div className="card-footer" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}

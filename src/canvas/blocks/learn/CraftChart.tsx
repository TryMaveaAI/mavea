import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CraftCell, CraftChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CraftChartProps & { delay?: number };

// Hard caps so a runaway grid can't balloon the SVG or the cell count. A real craft chart that
// exceeds this is shown clipped to the top-left region (the part a maker starts from).
const MAX_DIM = 40;
// Below this cell size, the per-stitch symbol is dropped — the fill colour still reads as the chart.
const SYMBOL_MIN_PX = 11;
// Number the ruler every Nth stitch/row when the grid is dense, so the margins stay legible.
function rulerStride(n: number): number {
  if (n <= 12) return 1;
  if (n <= 24) return 5;
  return 10;
}

/** A dense [r][c] lookup of the supplied cells — the model sends only the filled ones. The last
 *  write wins on a duplicate coordinate, matching how a maker would read the latest correction. */
function buildGrid(rows: number, cols: number, cells: CraftCell[]): (CraftCell | undefined)[][] {
  const grid: (CraftCell | undefined)[][] = Array.from({ length: rows }, () =>
    new Array<CraftCell | undefined>(cols).fill(undefined),
  );
  for (const cell of cells) {
    if (cell.r < 0 || cell.r >= rows || cell.c < 0 || cell.c >= cols) continue;
    grid[cell.r][cell.c] = cell;
  }
  return grid;
}

export function CraftChart({
  title,
  icon = 'edit',
  iconColor = 'var(--insight)',
  rows,
  cols,
  cells,
  legend,
  craft = 'crossstitch',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;

  // Clamp the chart to a sane, on-screen window — the figure always stays within its card.
  const nRows = Math.max(1, Math.min(MAX_DIM, Math.floor(rows) || 1));
  const nCols = Math.max(1, Math.min(MAX_DIM, Math.floor(cols) || 1));
  const grid = buildGrid(nRows, nCols, cells ?? []);

  // ── Geometry (square cells; the viewBox grows with the grid, the SVG width is 100%) ──────────
  const CELL = 16; // nominal cell size in viewBox units — width:100% + viewBox scales it to fit.
  const RULER = 14; // top gutter for the stitch numbers, and the left offset the grid starts at.
  // Separate left and right gutters: cells begin after the top/left ruler, while the row numbers
  // sit after the final cell. Sharing one gutter made those right-edge numbers paint outside the
  // SVG at the narrowest breakpoint. The right gutter is wider because it holds a whole (up to
  // two-digit) number at .lr-cc-num's size, not just the descender room the top ruler needs.
  const RULER_R = 20;
  const gridW = nCols * CELL;
  const gridH = nRows * CELL;
  const vbW = gridW + RULER + RULER_R;
  const vbH = gridH + RULER;

  const colStride = rulerStride(nCols);
  const rowStride = rulerStride(nRows);

  // The rendered cell size in CSS px (the SVG is capped at gridW px wide) — gates the symbol glyph.
  const renderedCell = (Math.min(gridW, 420) / gridW) * CELL;
  const showSymbols = renderedCell >= SYMBOL_MIN_PX;

  const cardStyle: CSSProperties = { ['--delay' as string]: (delay ?? 0) + 'ms' };
  // Cap the SVG to the grid's natural pixel width so small charts don't stretch edge-to-edge.
  const svgStyle: CSSProperties = { maxWidth: vbW, marginInline: 'auto' };

  return (
    <div className="card reveal" style={cardStyle}>
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="lr-cc-wrap">
        <svg
          className="lr-cc-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          style={svgStyle}
          role="img"
          aria-label={
            title
              ? `${title} — ${nRows}×${nCols} ${craft} chart`
              : `${nRows}×${nCols} ${craft} chart`
          }
        >
          {/* ── Top ruler: stitch numbers (1 = leftmost column) ───────────────────── */}
          {Array.from({ length: nCols }, (_, c) => {
            const num = c + 1;
            if (num !== 1 && num % colStride !== 0 && num !== nCols) return null;
            return (
              <text
                key={`cx-${c}`}
                className="lr-cc-num"
                x={RULER + c * CELL + CELL / 2}
                y={RULER - 4}
                textAnchor="middle"
              >
                {num}
              </text>
            );
          })}

          {/* ── Right ruler: row numbers (1 = top row) ────────────────────────────── */}
          {Array.from({ length: nRows }, (_, r) => {
            const num = r + 1;
            if (num !== 1 && num % rowStride !== 0 && num !== nRows) return null;
            return (
              <text
                key={`ry-${r}`}
                className="lr-cc-num"
                x={RULER + gridW + 3}
                y={RULER + r * CELL + CELL / 2}
                textAnchor="start"
                dominantBaseline="middle"
              >
                {num}
              </text>
            );
          })}

          {/* ── Cells: each filled square shows its colour, then its stitch symbol ─── */}
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const x = RULER + c * CELL;
              const y = RULER + r * CELL;
              const filled = cell !== undefined && (cell.color || cell.symbol);
              return (
                <g key={`${r}-${c}`}>
                  {craft === 'bead' ? (
                    <circle
                      className={filled ? 'lr-cc-cell lr-cc-bead' : 'lr-cc-empty lr-cc-bead'}
                      cx={x + CELL / 2}
                      cy={y + CELL / 2}
                      r={CELL / 2 - 1.4}
                      style={cell?.color ? { fill: cell.color } : undefined}
                    />
                  ) : (
                    <rect
                      className={filled ? 'lr-cc-cell' : 'lr-cc-empty'}
                      x={x}
                      y={y}
                      width={CELL}
                      height={CELL}
                      style={cell?.color ? { fill: cell.color } : undefined}
                    />
                  )}
                  {showSymbols && cell?.symbol && craft !== 'bead' && (
                    <text
                      className="lr-cc-sym"
                      x={x + CELL / 2}
                      y={y + CELL / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {cell.symbol}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {legend && legend.length > 0 && (
        <ul className="lr-cc-legend">
          {legend.map((entry, i) => (
            <li key={i} className="lr-cc-leg-row">
              <span className="lr-cc-leg-key" aria-hidden>
                {entry.color && (
                  <span
                    className={['lr-cc-leg-sw', craft === 'bead' ? 'lr-cc-leg-sw-round' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={{ background: entry.color }}
                  />
                )}
                {entry.symbol && <span className="lr-cc-leg-sym">{entry.symbol}</span>}
              </span>
              <span className="lr-cc-leg-mean">{entry.meaning}</span>
            </li>
          ))}
        </ul>
      )}

      {caption && <p className="lr-cc-cap">{caption}</p>}

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

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { ConfusionMatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ConfusionMatrixProps & { delay?: number };

// viewBox geometry. The grid is square; gutters hold the axis class labels (rotated on the
// left for "Actual", flat under the columns for "Predicted") plus the optional totals strip.
// LEFT/TOP carry an axis TITLE row outside the per-class tick labels so nothing shares a baseline.
const W = 360;
const H = 320;
const LEFT = 96; // y-axis: a title column (rotated) + the per-row class labels
const TOP = 56; // x-axis: a title row + the per-column class labels
const RIGHT = 16;
const BOTTOM = 20;
const TOTAL_BAND = 30; // width/height of the optional row/column totals strip

/** Sum a numeric row, treating missing/non-finite entries as 0 so a ragged matrix never NaNs. */
function rowSum(row: readonly number[]): number {
  let s = 0;
  for (const v of row) if (Number.isFinite(v)) s += v;
  return s;
}

/** Round to at most 1 decimal and drop a trailing ".0" — clean precision/recall/accuracy text. */
function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n * 1000) / 10;
  return (Number.isInteger(r) ? r.toString() : r.toFixed(1)) + '%';
}

// Class labels are author-supplied strings of unbounded length, but the row gutter and column
// cells are fixed/shrinking geometry (LEFT stays 96px regardless of class count; a column's
// share of `side` shrinks as n grows). Unclipped SVG <text> doesn't wrap, so a long label — or
// just more columns — bleeds into the frame or a neighbouring label. Truncate to a per-axis
// character budget derived from the box each label actually gets, at the .cfm-class font-size
// (10px, ~5.6px/char average), and keep the full string as a native <title> tooltip.
const CFM_CHARS_PER_PX = 1 / 5.6;

function truncateLabel(text: string, boxWidth: number): string {
  const max = Math.max(3, Math.floor(boxWidth * CFM_CHARS_PER_PX));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function ConfusionMatrix({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  classes,
  matrix,
  correctColor = 'var(--presence)',
  errorColor = 'var(--danger)',
  showTotals = false,
  readout = 'accuracy',
  actualLabel = 'Actual',
  predictedLabel = 'Predicted',
  countLabel = 'samples',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;

  const model = useMemo(() => {
    const n = classes?.length ?? 0;
    // Need at least a 2×2 and a matrix whose rows line up with the class list.
    if (n < 2 || !matrix || matrix.length < n) return null;

    // Normalise to an n×n grid of finite counts (pad/truncate a ragged row to n).
    const grid: number[][] = classes.map((_, i) => {
      const src = matrix[i] ?? [];
      return classes.map((__, j) => {
        const v = src[j];
        return Number.isFinite(v) ? (v as number) : 0;
      });
    });

    const total = grid.reduce((s, row) => s + rowSum(row), 0);
    const correct = grid.reduce((s, row, i) => s + (Number.isFinite(row[i]) ? row[i] : 0), 0);
    const accuracy = total > 0 ? correct / total : 0;
    const peak = Math.max(1, ...grid.flat()); // heat denominator; never 0

    // Per-class precision (column = predicted) and recall (row = actual).
    const perClass = classes.map((label, k) => {
      const colSum = grid.reduce((s, row) => s + (Number.isFinite(row[k]) ? row[k] : 0), 0);
      const recall = rowSum(grid[k]) > 0 ? grid[k][k] / rowSum(grid[k]) : NaN;
      const precision = colSum > 0 ? grid[k][k] / colSum : NaN;
      return { label, precision, recall };
    });

    // The drawable grid square. Reserve the totals band on the right/bottom only when shown.
    const gridRight = W - RIGHT - (showTotals ? TOTAL_BAND : 0);
    const gridBottom = H - BOTTOM - (showTotals ? TOTAL_BAND : 0);
    // Keep cells square: the side is the smaller of the available width/height.
    const side = Math.min(gridRight - LEFT, gridBottom - TOP);
    const x0 = LEFT;
    const y0 = TOP;

    // Edge positions via the shared linear scale (index → pixel), so cell coords come from
    // the data layout, never hand-placed magic numbers.
    const ex = scaleLinear([0, n], [x0, x0 + side]);
    const ey = scaleLinear([0, n], [y0, y0 + side]);
    const cell = side / n;
    // Heat saturation by count, eased so mid counts stay visible but the diagonal dominates.
    const heat = (v: number) => (peak > 0 ? Math.sqrt(Math.max(0, v) / peak) : 0);

    return {
      n,
      grid,
      total,
      correct,
      accuracy,
      perClass,
      ex,
      ey,
      cell,
      side,
      x0,
      y0,
      heat,
      colTotals: classes.map((_, j) =>
        grid.reduce((s, row) => s + (Number.isFinite(row[j]) ? row[j] : 0), 0),
      ),
      rowTotals: grid.map((row) => rowSum(row)),
    };
  }, [classes, matrix, showTotals]);

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {model && (
        <div className="cfm-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="cfm-svg" role="img" aria-label={title}>
            {/* Cells: a heat-filled square per (actual i, predicted j) with the count centred.
                Diagonal cells (i===j) are "correct" and tinted the correct color; off-diagonal
                cells are misclassifications and tinted the error color. */}
            {model.grid.map((row, i) =>
              row.map((count, j) => {
                const cx = model.ex(j);
                const cy = model.ey(i);
                const diag = i === j;
                const base = diag ? correctColor : errorColor;
                const strength = model.heat(count);
                const fill = `color-mix(in oklab, ${base} ${(8 + strength * 80).toFixed(1)}%, transparent)`;
                // Text turns to the badge ink once a cell is dark enough to swamp body text.
                const dark = strength > 0.55;
                return (
                  <g key={`c${i}-${j}`}>
                    <rect
                      x={cx + 1}
                      y={cy + 1}
                      width={model.cell - 2}
                      height={model.cell - 2}
                      rx={4}
                      fill={fill}
                      className={diag ? 'cfm-cell cfm-cell--diag' : 'cfm-cell'}
                    />
                    <text
                      x={cx + model.cell / 2}
                      y={cy + model.cell / 2}
                      className={dark ? 'cfm-count cfm-count--on' : 'cfm-count'}
                      textAnchor="middle"
                      dominantBaseline="central"
                      data-mark={diag ? 'point' : undefined}
                    >
                      {count.toLocaleString()}
                    </text>
                  </g>
                );
              }),
            )}

            {/* Grid frame */}
            <rect
              x={model.x0}
              y={model.y0}
              width={model.side}
              height={model.side}
              className="cfm-frame"
              fill="none"
            />

            {/* Row (actual) class labels down the left, right-aligned into the LEFT gutter.
                Gutter width is fixed regardless of class count, so long labels are clipped to
                what actually fits and the untruncated string rides along as a <title> tooltip. */}
            {classes.map((label, i) => {
              const rowLabel = truncateLabel(label, LEFT - 12);
              return (
                <text
                  key={`rl${i}`}
                  x={model.x0 - 8}
                  y={model.ey(i) + model.cell / 2}
                  className="cfm-class"
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {rowLabel !== label && <title>{label}</title>}
                  {rowLabel}
                </text>
              );
            })}

            {/* Column (predicted) class labels across the top, centred over each column. Each
                column's share of the grid shrinks as the class count grows, so the budget is
                sized to the live cell width rather than a fixed constant. */}
            {classes.map((label, j) => {
              const colLabel = truncateLabel(label, model.cell - 4);
              return (
                <text
                  key={`cl${j}`}
                  x={model.ex(j) + model.cell / 2}
                  y={model.y0 - 8}
                  className="cfm-class"
                  textAnchor="middle"
                >
                  {colLabel !== label && <title>{label}</title>}
                  {colLabel}
                </text>
              );
            })}

            {/* Axis TITLES on their own rows, away from the per-class tick baseline */}
            <text
              x={0}
              y={0}
              transform={`translate(18, ${model.y0 + model.side / 2}) rotate(-90)`}
              className="cfm-axis-title"
              textAnchor="middle"
            >
              {actualLabel} ↓
            </text>
            <text
              x={model.x0 + model.side / 2}
              y={18}
              className="cfm-axis-title"
              textAnchor="middle"
            >
              {predictedLabel} →
            </text>

            {/* Optional row / column totals strip */}
            {showTotals && (
              <g className="cfm-totals">
                {model.rowTotals.map((t, i) => (
                  <text
                    key={`rt${i}`}
                    x={model.x0 + model.side + TOTAL_BAND / 2}
                    y={model.ey(i) + model.cell / 2}
                    className="cfm-total"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {t.toLocaleString()}
                  </text>
                ))}
                {model.colTotals.map((t, j) => (
                  <text
                    key={`ct${j}`}
                    x={model.ex(j) + model.cell / 2}
                    y={model.y0 + model.side + TOTAL_BAND / 2}
                    className="cfm-total"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {t.toLocaleString()}
                  </text>
                ))}
                <text
                  x={model.x0 + model.side + TOTAL_BAND / 2}
                  y={model.y0 - 8}
                  className="cfm-total-hd"
                  textAnchor="middle"
                >
                  Σ
                </text>
                <text
                  x={model.x0 - 8}
                  y={model.y0 + model.side + TOTAL_BAND / 2}
                  className="cfm-total-hd"
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  Σ
                </text>
              </g>
            )}
          </svg>

          {/* Derived read-out: overall accuracy headline, or a per-class precision/recall table */}
          {readout === 'accuracy' && (
            <div className="cfm-readout">
              <span
                className="cfm-acc tab-num"
                style={{ color: correctColor }}
                data-mark="underline"
              >
                {pct(model.accuracy)}
              </span>
              <span className="cfm-acc-lbl faint">
                accuracy · {model.correct.toLocaleString()} of {model.total.toLocaleString()}{' '}
                {countLabel} correct
              </span>
            </div>
          )}
          {readout === 'perclass' && (
            <div className="cfm-pc">
              <div className="cfm-pc-row cfm-pc-head">
                <span className="cfm-pc-name">Class</span>
                <span className="cfm-pc-val">Precision</span>
                <span className="cfm-pc-val">Recall</span>
              </div>
              {model.perClass.map((c, k) => (
                <div className="cfm-pc-row" key={`pc${k}`}>
                  <span className="cfm-pc-name">{c.label}</span>
                  <span className="cfm-pc-val tab-num">{pct(c.precision)}</span>
                  <span className="cfm-pc-val tab-num">{pct(c.recall)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!model && (
        <div className="cfm-empty faint">
          Provide a class list and a square N×N matrix (matrix[i][j] = actual i predicted j).
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

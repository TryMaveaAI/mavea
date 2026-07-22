import { Fragment, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GridMatrixProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GridMatrixProps & { delay?: number };

// Ten-frame is always 2 rows × 5 cols — a fixed early-math convention.
const TEN_FRAME_ROWS = 2;
const TEN_FRAME_COLS = 5;

// Columns beyond this trigger horizontal scroll instead of stretching the card.
const WIDE_THRESHOLD = 6;

/** Returns true when a cell should receive the presence accent. */
function isHighlighted(
  row: number,
  col: number,
  highlight: [number, number][] | undefined,
): boolean {
  if (!highlight) return false;
  return highlight.some(([r, c]) => r === row && c === col);
}

/** For truth-table variant: color T as presence, F as muted warning. */
function truthClass(value: string | number): string {
  const v = String(value).trim().toUpperCase();
  if (v === 'T' || v === 'TRUE' || v === '1') return 'lr-gm-true';
  if (v === 'F' || v === 'FALSE' || v === '0') return 'lr-gm-false';
  return '';
}

export function GridMatrix({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  variant = 'grid',
  rowHeaders,
  colHeaders,
  cells,
  highlight,
  note,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  // ── Ten-frame: override cells to exactly 2×5 circle counters ──────────────
  // Count filled counters from the raw cells (values are truthy/"1"/"●" or empty/"0"/"○").
  if (variant === 'tenframe') {
    const filled = cells.flat().filter((v) => v !== '' && v !== 0 && v !== '0' && v !== '○').length;
    const tfCells: (string | number)[][] = [];
    let count = 0;
    for (let r = 0; r < TEN_FRAME_ROWS; r++) {
      const row: (string | number)[] = [];
      for (let c = 0; c < TEN_FRAME_COLS; c++) {
        row.push(count < filled ? '●' : '○');
        count++;
      }
      tfCells.push(row);
    }
    cells = tfCells;
    colHeaders = undefined;
    rowHeaders = undefined;
  }

  const numCols =
    (colHeaders ? colHeaders.length : 0) || (cells[0]?.length ?? 0) + (rowHeaders ? 1 : 0);

  // Number of actual data columns (not counting the row-header column).
  const dataCols = cells[0]?.length ?? 0;
  // Total grid columns = data cols + optional row-header column.
  const gridCols = dataCols + (rowHeaders ? 1 : 0);

  const isWide = numCols > WIDE_THRESHOLD;

  const cardStyle: CSSProperties = { ['--delay' as string]: (delay || 0) + 'ms' };

  return (
    <div className="card reveal" style={cardStyle}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={['lr-gm-wrap', `lr-gm-v-${variant}`, isWide ? 'lr-gm-scroll' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className="lr-gm-grid"
          style={{
            // Each column is equal width; row-header col uses the same width.
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          }}
          role="grid"
          aria-label={title}
        >
          {/* ── Top-left corner + column headers ──────────────────────── */}
          {colHeaders && (
            <>
              {/* Corner cell sits above the row-header column when both exist */}
              {rowHeaders && (
                <div className="lr-gm-cell lr-gm-corner" role="columnheader" aria-label="" />
              )}
              {colHeaders.map((h, ci) => (
                <div key={ci} className="lr-gm-cell lr-gm-col-hdr" role="columnheader">
                  {h}
                </div>
              ))}
            </>
          )}

          {/* ── Data rows (each optionally prefixed by a row header) ───── */}
          {cells.map((row, ri) => (
            <Fragment key={ri}>
              {rowHeaders && (
                <div className="lr-gm-cell lr-gm-row-hdr" role="rowheader">
                  {rowHeaders[ri] ?? ''}
                </div>
              )}
              {row.map((val, ci) => {
                const accented = isHighlighted(ri, ci, highlight);
                const isFilled = variant === 'tenframe' && val === '●';
                const cls = [
                  'lr-gm-cell',
                  'lr-gm-data',
                  accented ? 'lr-gm-accent' : '',
                  variant === 'truth' ? truthClass(val) : '',
                  variant === 'tenframe' ? 'lr-gm-circle' : '',
                  variant === 'tenframe' && isFilled ? 'lr-gm-filled' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div
                    key={`${ri}-${ci}`}
                    className={cls}
                    role="gridcell"
                    // Screen-reader: distinguish filled/empty ten-frame counters.
                    aria-label={
                      variant === 'tenframe' ? (isFilled ? 'filled' : 'empty') : undefined
                    }
                  >
                    {variant === 'tenframe' ? null : val}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {note && <p className="lr-gm-note">{note}</p>}

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

import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { QuadrantProps, QuadrantItem } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = QuadrantProps & { delay?: number };

// Bucket items by which quadrant they belong in.
type Q = 'topRight' | 'topLeft' | 'bottomLeft' | 'bottomRight';

// Background tints: warmer upper-right (high-high), cooler lower-left (low-low), neutral elsewhere.
// Values are colour-mix percentages applied inside each cell so the grid never over-saturates.
const CELL_TINT: Record<Q, string> = {
  topRight: 'color-mix(in oklab, var(--warning) 5%, transparent)',
  topLeft: 'color-mix(in oklab, var(--insight) 5%, transparent)',
  bottomLeft: 'color-mix(in oklab, var(--presence-soft) 5%, transparent)',
  bottomRight: 'color-mix(in oklab, var(--presence) 5%, transparent)',
};

// Where the faint quadrant name label sits inside each cell (CSS corner alignment).
const LABEL_CLASS: Record<Q, string> = {
  topRight: 'qd-qlabel qd-qlabel--tr',
  topLeft: 'qd-qlabel qd-qlabel--tl',
  bottomLeft: 'qd-qlabel qd-qlabel--bl',
  bottomRight: 'qd-qlabel qd-qlabel--br',
};

// Grid placement for each quadrant (1-indexed CSS grid rows/cols).
// Grid is structured: col 1 = left, col 2 = right; row 1 = top, row 2 = bottom.
const GRID_PLACEMENT: Record<Q, { row: number; col: number }> = {
  topLeft: { row: 1, col: 1 },
  topRight: { row: 1, col: 2 },
  bottomLeft: { row: 2, col: 1 },
  bottomRight: { row: 2, col: 2 },
};

const QUADRANT_ORDER: Q[] = ['topRight', 'topLeft', 'bottomLeft', 'bottomRight'];

function groupItems(items: QuadrantItem[]): Record<Q, QuadrantItem[]> {
  const g: Record<Q, QuadrantItem[]> = {
    topRight: [],
    topLeft: [],
    bottomLeft: [],
    bottomRight: [],
  };
  for (const item of items) g[item.quadrant].push(item);
  return g;
}

// 2×2 quadrant matrix — plots labelled items in four cells divided by crossing axis lines.
// Each cell shows a faint corner label for the quadrant name and a compact item list with
// coloured dot + label text and an optional muted sub-note. Axis titles run below (x) and
// rotated on the left (y). Background tints are very subtle — just enough to read the "good
// vs bad" semantics without turning the card into a colour chart.
export function Quadrant({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  topRight,
  topLeft,
  bottomLeft,
  bottomRight,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const groups = groupItems(items);

  const quadrantLabel: Record<Q, string | undefined> = {
    topRight,
    topLeft,
    bottomLeft,
    bottomRight,
  };

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Outer layout: optional y-axis label on the left + the grid+x-axis column on the right */}
      <div className="qd-outer">
        {/* Y-axis label — rotated 90° counter-clockwise, centred vertically beside the grid */}
        {yLabel && (
          <div className="qd-ylabel-wrap" aria-label={`Y axis: ${yLabel}`}>
            <span className="qd-ylabel">{yLabel}</span>
          </div>
        )}

        <div className="qd-col">
          {/* 2×2 grid */}
          <div className="qd-grid" role="img" aria-label={title}>
            {QUADRANT_ORDER.map((q) => {
              const { row, col } = GRID_PLACEMENT[q];
              const qlabel = quadrantLabel[q];
              const cellItems = groups[q];
              return (
                <div
                  key={q}
                  className="qd-cell"
                  style={{
                    gridRow: row,
                    gridColumn: col,
                    background: CELL_TINT[q],
                  }}
                >
                  {/* faint quadrant name in the appropriate corner */}
                  {qlabel && <span className={LABEL_CLASS[q]}>{qlabel}</span>}

                  {/* item list */}
                  <ul className="qd-items">
                    {cellItems.map((item, idx) => (
                      <li key={idx} className="qd-item">
                        <span className="qd-dot" aria-hidden />
                        <span className="qd-item-body">
                          <span className="qd-item-label">{item.label}</span>
                          {item.note && <span className="qd-item-note">{item.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* X-axis label — centred below the grid */}
          {xLabel && (
            <div className="qd-xlabel" aria-label={`X axis: ${xLabel}`}>
              {xLabel}
            </div>
          )}
        </div>
      </div>

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

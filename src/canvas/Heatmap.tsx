// Calendar-style intensity grid: labelled rows of cells shaded by level,
// with optional column headers, per-cell marks/notes, and a legend.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { HeatmapProps, HeatCell } from '../data/conversation';
import { BlockEmpty } from './lib/BlockEmpty';
import { heatLevel, resolvesHeatLevels } from './lib/empty';

type Props = HeatmapProps & { delay?: number };

export function Heatmap({
  title,
  icon = 'clock',
  iconColor = 'var(--insight)',
  cols,
  rows,
  levelColor,
  footer,
  legend,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const eyebrow = (
    <div className="card-eyebrow">
      <Ic className="ic" style={{ color: iconColor }} /> {title}
    </div>
  );
  // A grid is its levels. Restored and baked frames never meet the validator again, so the
  // renderer asks the same question it does: no cell to tint and no mark to print is nothing to
  // draw, not a field of empty tiles under the row labels.
  if (!resolvesHeatLevels('heat', { rows })) {
    return (
      <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
        {eyebrow}
        <BlockEmpty message="No levels to show" />
      </div>
    );
  }
  // The hottest cell (highest level) is the extreme value — Mavéa gestures at it first.
  let salientRow = 0,
    salientCol = 0,
    salientLvl = -1;
  rows.forEach((row, ri) => {
    row.cells.forEach((cell: HeatCell, ci) => {
      const lvl = heatLevel(cell);
      if (lvl !== null && lvl > salientLvl) {
        salientLvl = lvl;
        salientRow = ri;
        salientCol = ci;
      }
    });
  });
  const colorFor = (lvl: number | null) => {
    if (lvl === null) return 'var(--cell-empty)';
    const base = levelColor || 'var(--presence)';
    const op = [0.14, 0.34, 0.6, 0.92][Math.max(0, Math.min(3, Math.round(lvl)))];
    return `color-mix(in oklab, ${base} ${op * 100}%, transparent)`;
  };
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      {eyebrow}
      <div className="heat-wrap">
        {cols && (
          <div className="heat-cols">
            <span className="heat-rowhead"></span>
            {cols.map((c, i) => (
              <span key={i} className="heat-col-label">
                {c}
              </span>
            ))}
          </div>
        )}
        {rows.map((row, ri) => (
          <div className="heat-row" key={ri}>
            <span className="heat-rowhead">{row.label}</span>
            {row.cells.map((cell: HeatCell, ci) => (
              <span
                key={ci}
                className="heat-cell"
                title={cell && typeof cell === 'object' && cell.note ? cell.note : ''}
                data-mark={ri === salientRow && ci === salientCol ? 'circle' : undefined}
                style={{ background: colorFor(heatLevel(cell)) }}
              >
                {typeof cell === 'object' && cell && cell.mark ? (
                  <span className="heat-mark">{cell.mark}</span>
                ) : null}
              </span>
            ))}
          </div>
        ))}
        {/* inside the grid's own column, so the key ends where the last column does */}
        {legend && (
          <div className="heat-legend">
            <span className="faint">{legend[0]}</span>
            {[0, 1, 2, 3].map((l) => (
              <span key={l} className="heat-cell sm" style={{ background: colorFor(l) }}></span>
            ))}
            <span className="faint">{legend[1]}</span>
          </div>
        )}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// Calendar-style intensity grid: labelled rows of cells shaded by level,
// with optional column headers, per-cell marks/notes, and a legend.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { HeatmapProps, HeatCell } from '../data/conversation';

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
  // The hottest cell (highest level) is the extreme value — Mavéa gestures at it first.
  let salientRow = 0,
    salientCol = 0,
    salientLvl = -1;
  rows.forEach((row, ri) => {
    row.cells.forEach((cell: HeatCell, ci) => {
      const lvl =
        typeof cell === 'object' && cell ? (cell.lvl ?? 0) : ((cell as number | null) ?? 0);
      if (lvl != null && lvl > salientLvl) {
        salientLvl = lvl;
        salientRow = ri;
        salientCol = ci;
      }
    });
  });
  const colorFor = (lvl: number | null | undefined) => {
    if (lvl == null) return 'var(--cell-empty)';
    const base = levelColor || 'var(--presence)';
    const op = [0.14, 0.34, 0.6, 0.92][Math.max(0, Math.min(3, lvl))];
    return `color-mix(in oklab, ${base} ${op * 100}%, transparent)`;
  };
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
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
                style={{
                  background: colorFor(typeof cell === 'object' && cell ? cell.lvl : cell),
                }}
              >
                {typeof cell === 'object' && cell && cell.mark ? (
                  <span className="heat-mark">{cell.mark}</span>
                ) : null}
              </span>
            ))}
          </div>
        ))}
      </div>
      {legend && (
        <div className="heat-legend">
          <span className="faint">{legend[0]}</span>
          {[0, 1, 2, 3].map((l) => (
            <span key={l} className="heat-cell sm" style={{ background: colorFor(l) }}></span>
          ))}
          <span className="faint">{legend[1]}</span>
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

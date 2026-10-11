import { type CSSProperties, Fragment } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlanGridProps, PlanCell } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { BlockEmpty } from '../../lib/BlockEmpty';
import { nameKey, resolvesNamedCells } from '../../lib/empty';

type Props = PlanGridProps & { delay?: number };

// A forward-looking days×slots matrix (meal plan, study schedule, habit tracker, weekly routine).
// Cells name their column, so alignment survives loose model output. Empty slots stay visually quiet;
// the grid scrolls horizontally when columns are many, so the card never overflows.
export function PlanGrid({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  columns,
  rows,
  summary,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const cols = columns ?? [];
  const safeRows = rows ?? [];
  const template = `minmax(60px, 0.55fr) repeat(${Math.max(cols.length, 1)}, minmax(78px, 1fr))`;
  const cardStyle = { ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties;
  const eyebrow = (
    <div className="card-eyebrow">
      <Ic className="ic" style={{ color: iconColor }} /> {title}
    </div>
  );

  // A board of nothing but free slots is not a plan: cells that named no column on the grid, or
  // named one and carried no entry. The shared guard decides, so the validator, the demo loader
  // and this card refuse the same thing — this is the one that covers a restored or baked frame.
  if (!resolvesNamedCells('plangrid', { columns: cols, rows: safeRows })) {
    return (
      <div className="card reveal" style={cardStyle}>
        {eyebrow}
        <BlockEmpty message="No entries to show" />
      </div>
    );
  }

  return (
    <div className="card reveal" style={cardStyle}>
      {eyebrow}
      {caption && <div className="pg-caption">{caption}</div>}

      <div className="pg-scroll">
        <div className="pg-grid" style={{ gridTemplateColumns: template } as CSSProperties}>
          <div className="pg-corner" aria-hidden="true" />
          {cols.map((c, i) => (
            <div key={`h${i}`} className="pg-colhead">
              {c}
            </div>
          ))}

          {safeRows.map((row, ri) => {
            const byCol = new Map<string, PlanCell>();
            (row.cells ?? []).forEach((cell) => {
              if (cell?.col) byCol.set(nameKey(cell.col), cell);
            });
            return (
              <Fragment key={`r${ri}`}>
                <div className="pg-slot">{row.slot}</div>
                {cols.map((c, ci) => {
                  const cell = byCol.get(nameKey(c));
                  if (!cell || !cell.label) {
                    return (
                      <div
                        key={`c${ri}-${ci}`}
                        className="pg-cell pg-cell--free"
                        aria-label="No activity planned"
                      />
                    );
                  }
                  const accentStyle = cell.accent
                    ? ({
                        borderInlineStartColor: cell.accent,
                        borderInlineStartWidth: 3,
                      } as CSSProperties)
                    : undefined;
                  return (
                    <div
                      key={`c${ri}-${ci}`}
                      className={`pg-cell${cell.done ? ' done' : ''}`}
                      style={accentStyle}
                    >
                      <span
                        className="pg-cell-label"
                        style={cell.accent ? { color: cell.accent } : undefined}
                      >
                        {cell.label}
                      </span>
                      {cell.sub && <span className="pg-cell-sub">{cell.sub}</span>}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}

          {summary && summary.length > 0 && (
            <>
              <div className="pg-slot pg-slot--sum">Total</div>
              {cols.map((_, ci) => (
                <div key={`s${ci}`} className="pg-cell--sum">
                  {summary[ci] ?? ''}
                </div>
              ))}
            </>
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

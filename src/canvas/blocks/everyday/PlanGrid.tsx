import { type CSSProperties, Fragment } from 'react';
import { Icon } from '../../../icons/icons';
import type { PlanGridProps, PlanCell } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PlanGridProps & { delay?: number };

const norm = (s: string) => s.trim().toLowerCase();

// A forward-looking days×slots matrix (meal plan, study schedule, habit tracker, weekly routine).
// Cells name their column, so alignment survives loose model output and an unfilled column reads as a
// free slot. The grid scrolls horizontally when columns are many, so the card never overflows.
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

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
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
              if (cell?.col) byCol.set(norm(cell.col), cell);
            });
            return (
              <Fragment key={`r${ri}`}>
                <div className="pg-slot">{row.slot}</div>
                {cols.map((c, ci) => {
                  const cell = byCol.get(norm(c));
                  if (!cell || !cell.label) {
                    return (
                      <div key={`c${ri}-${ci}`} className="pg-cell pg-cell--free">
                        <span className="pg-cell-free">free</span>
                      </div>
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

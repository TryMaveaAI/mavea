import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { RaciProps, RaciRating } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RaciProps & { delay?: number };

// Per-rating presentation: accent + the standing word a badge expands to on hover/legend.
// Accountable reads warning (there's exactly one, and it's the row that must not go unowned);
// Informed reads muted — it's the lightest touch of the four.
const RATING: Record<RaciRating, { color: string; label: string }> = {
  R: { color: 'var(--presence)', label: 'Responsible' },
  A: { color: 'var(--warning)', label: 'Accountable' },
  C: { color: 'var(--insight)', label: 'Consulted' },
  I: { color: 'var(--text-muted)', label: 'Informed' },
};

const ORDER: RaciRating[] = ['R', 'A', 'C', 'I'];

// A task × role responsibility matrix — each pairing rated Responsible / Accountable /
// Consulted / Informed. Cells name their own task and role, so a pairing lands in the right
// square even if the model emits them out of order; a pair no one rated simply stays blank
// (a task can legitimately not touch every role). Project management, ops, program planning —
// "who owns what, who signs off, who just needs to know".
export function Raci({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  tasks,
  roles,
  cells,
  legend = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const items = tasks ?? [];
  const people = roles ?? [];

  if (items.length === 0 || people.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No tasks or roles to map" />
      </div>
    );
  }

  // Index by task+role (case/space-insensitive) so a pairing resolves regardless of emit order.
  const key = (t: string, r: string) => `${t.trim().toLowerCase()} ${r.trim().toLowerCase()}`;
  const byPair = new Map<string, RaciRating>();
  for (const cell of cells ?? []) {
    if (!cell?.task || !cell?.role || !RATING[cell.rating]) continue;
    byPair.set(key(cell.task, cell.role), cell.rating);
  }
  const present = ORDER.filter((r) => [...byPair.values()].includes(r));

  const gridCols = `minmax(120px, 1.2fr) repeat(${people.length}, minmax(88px, 1fr))`;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="raci-scroll">
        <div className="raci-grid" style={{ gridTemplateColumns: gridCols }} role="grid">
          <div className="raci-corner" role="columnheader" />
          {people.map((r, ri) => (
            <div key={ri} className="raci-colh" role="columnheader" title={r}>
              {r}
            </div>
          ))}

          {items.map((task, ti) => (
            <div
              key={ti}
              className="raci-row m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: ti } as CSSProperties}
              role="row"
            >
              <div className="raci-rowh" role="rowheader" title={task}>
                {task}
              </div>
              {people.map((role, ri) => {
                const rating = byPair.get(key(task, role));
                if (!rating) {
                  return (
                    <div key={ri} className="raci-cell raci-empty" role="gridcell">
                      <span className="raci-dash">–</span>
                    </div>
                  );
                }
                const R = RATING[rating];
                return (
                  <div
                    key={ri}
                    className="raci-cell"
                    style={{ ['--raci-c' as string]: R.color } as CSSProperties}
                    role="gridcell"
                    title={R.label}
                  >
                    <span className="raci-badge">{rating}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {legend && present.length > 0 && (
        <div className="raci-legend">
          {present.map((r) => (
            <span
              key={r}
              className="raci-leg-item"
              style={{ ['--raci-c' as string]: RATING[r].color } as CSSProperties}
            >
              <span className="raci-leg-badge">{r}</span>
              {RATING[r].label}
            </span>
          ))}
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

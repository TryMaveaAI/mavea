import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CalHeatProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CalHeatProps & { delay?: number };

// % of the accent that tints a cell at each intensity level (0 = empty).
const LEVEL_MIX = [0, 28, 50, 74, 100];

function cellColor(level: number, accent: string): string {
  const lv = Math.max(0, Math.min(4, Math.round(level)));
  if (lv === 0) return 'var(--cell-empty)';
  return `color-mix(in oklab, ${accent} ${LEVEL_MIX[lv]}%, transparent)`;
}

// A contribution-style calendar: days flow column-major into 7-row weeks, each cell shaded
// by its intensity. Reads instantly as "consistency over time" — streaks, gaps, and seasonal
// rhythm — which a line chart of the same data buries. Tint is mixed from a single accent so
// it stays on-palette in light and dark.
export function CalendarHeatmap({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  color = 'var(--insight)',
  days,
  weekdays,
  legend = ['Less', 'More'],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hot, setHot] = useState<number | null>(null);
  const list = Array.isArray(days) ? days : [];
  const weeks = Math.max(1, Math.ceil(list.length / 7));
  const labelled = Array.isArray(weekdays) && weekdays.length === 7;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Cells share the card's width as one grid (weekday names in its first column, so they
          stay on their rows at any cell size), capped so a short span does not balloon. The
          legend sits under the grid's own right edge rather than the card's. */}
      <div className="c2-cal-body" style={{ ['--weeks' as string]: weeks } as CSSProperties}>
        <div className="c2-cal-wrap">
          <div
            className={'c2-cal-grid' + (labelled ? ' has-days' : '')}
            onMouseLeave={() => setHot(null)}
          >
            {labelled &&
              weekdays.map((d, i) => (
                <span key={`d${i}`} className="c2-cal-day" style={{ gridRow: i + 1 }}>
                  {d}
                </span>
              ))}
            {list.map((d, i) => (
              <span
                key={i}
                className="c2-cal-cell"
                title={
                  d.date ? `${d.date} · level ${Math.max(0, Math.min(4, d.level))}` : undefined
                }
                style={{
                  gridRow: (i % 7) + 1,
                  gridColumn: Math.floor(i / 7) + (labelled ? 2 : 1),
                  background: cellColor(d.level, color),
                  transform: hot === i ? 'scale(1.25)' : 'none',
                }}
                onMouseEnter={() => setHot(i)}
              />
            ))}
          </div>
        </div>

        <div className="c2-cal-legend">
          <span className="c2-cal-leg-lbl">{legend[0]}</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <i key={lv} style={{ background: cellColor(lv, color) }} />
          ))}
          <span className="c2-cal-leg-lbl">{legend[1]}</span>
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

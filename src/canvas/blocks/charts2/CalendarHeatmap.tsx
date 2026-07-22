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

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="c2-cal-wrap">
        {weekdays && weekdays.length === 7 && (
          <div className="c2-cal-days">
            {weekdays.map((d, i) => (
              <span key={i} className="c2-cal-day">
                {d}
              </span>
            ))}
          </div>
        )}
        <div className="c2-cal-grid" onMouseLeave={() => setHot(null)}>
          {days.map((d, i) => (
            <span
              key={i}
              className="c2-cal-cell"
              title={d.date ? `${d.date} · level ${Math.max(0, Math.min(4, d.level))}` : undefined}
              style={{
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

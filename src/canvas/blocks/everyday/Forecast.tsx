import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { weatherGlyph } from './glyphs';
import type { ForecastProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ForecastProps & { delay?: number };

// Each day cell (.fc-day) is a fixed-width grid column; a longer condition string (real
// forecasts say "Scattered thunderstorms" or "Wintry mix, heavy at times", not just "Rain")
// would otherwise wrap onto multiple lines and stretch that cell's height past its neighbors
// in the row instead of staying a single truncated line — same fixed-width-text-in-a-cell bug
// as settleup's .su-from/.su-to and unitconvert's .uc-unit.
const truncateConditionStyle: CSSProperties = {
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Weather/multi-day prediction grid. Each day's glyph is resolved from its condition word
// (the model writes "partly cloudy", "rainy", …, not our icon keys) so days don't all render
// a sun. asOf is shown whenever present — data freshness matters for weather forecasts.
export function Forecast({
  title,
  icon = 'sun',
  iconColor = 'var(--warning)',
  location,
  unit,
  asOf,
  days,
  summary,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sun;
  const safeDays = days ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(location || unit) && (
        <div className="fc-meta">
          {location && <span>{location}</span>}
          {unit && <span>°{unit}</span>}
        </div>
      )}

      {asOf && <div className="fc-asof">{asOf}</div>}

      <div className="fc-grid">
        {safeDays.map((day, i) => {
          // Prefer an explicit icon key; otherwise infer the glyph from the condition text.
          const DayIc = weatherGlyph(day.icon || day.condition);
          return (
            <div key={i} className="fc-day">
              <div className="fc-label">{day.label}</div>
              <div className="fc-icon">
                <DayIc className="ic" />
              </div>
              <div className="fc-condition" style={truncateConditionStyle} title={day.condition}>
                {day.condition}
              </div>
              {(day.hi !== undefined || day.lo !== undefined) && (
                <div className="fc-temps">
                  {day.hi !== undefined && <span className="fc-hi">{day.hi}</span>}
                  {day.lo !== undefined && <span className="fc-lo">{day.lo}</span>}
                </div>
              )}
              {day.precipitation && <div className="fc-precip">{day.precipitation}</div>}
            </div>
          );
        })}
      </div>

      {summary && <div className="fc-summary">{summary}</div>}

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

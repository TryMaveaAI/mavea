// A compact multi-day weather read for the tile's viz slot — reuses the app's existing line-icon
// set (no bespoke weather glyphs) so a forecast tile matches everything else in look.
import type { ReactElement } from 'react';
import { Icon } from '../../../../icons/icons';
import type { ForecastDayLite } from '../tileModel';

interface ForecastStripProps {
  days: ForecastDayLite[];
}

export function ForecastStrip({ days }: ForecastStripProps): ReactElement | null {
  if (days.length === 0) return null;
  return (
    <div className="tile-forecast">
      {days.map((d, i) => {
        const Glyph = d.icon ? Icon[d.icon] : null;
        return (
          <div className="tile-forecast-day" key={`${d.label}-${i}`}>
            <span className="tile-forecast-label">{d.label}</span>
            {Glyph && <Glyph className="tile-forecast-glyph" aria-hidden="true" />}
            <span className="tile-forecast-temp">
              {d.hi ?? '—'}
              {d.lo && <span className="tile-forecast-lo">/{d.lo}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

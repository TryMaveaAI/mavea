import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { weatherGlyph } from './glyphs';
import type { WeatherNowProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WeatherNowProps & { delay?: number };

// hourly[]/tiles[] have no itemShapes field beyond their text anchor (time/label), so a loose
// model reply can omit a numeric field entirely — round a real number, otherwise render nothing
// rather than the literal text "NaN°".
const roundOrNull = (n: unknown): number | null =>
  Number.isFinite(n) ? Math.round(n as number) : null;

// Present-moment conditions — distinct from forecast's multi-day grid. One big reading up
// top, an hourly scroll strip for what's coming in the next few hours, and a row of small
// stat tiles for whatever else the source reports (UV, air quality, wind…). asOf is required:
// a "live" temperature reading is only honest with a timestamp telling you how fresh it is.
export function WeatherNow({
  title,
  icon = 'sun',
  iconColor = 'var(--warning)',
  location,
  tempF,
  feelsLikeF,
  condition,
  hi,
  lo,
  asOf,
  hourly,
  tiles,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sun;
  const ConditionIc = weatherGlyph(condition);
  const safeHourly = hourly ?? [];
  const safeTiles = tiles ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {location && <div className="wn-location">{location}</div>}

      <div className="wn-hero">
        <div className="wn-hero-icon">
          <ConditionIc className="ic" />
        </div>
        <div className="wn-hero-main">
          <span className="wn-hero-temp tab-num" data-mark="underline">
            {roundOrNull(tempF) ?? '—'}°
          </span>
          <div className="wn-hero-meta">
            <span className="wn-condition">{condition}</span>
            {roundOrNull(feelsLikeF) !== null && (
              <span className="wn-feels">Feels like {roundOrNull(feelsLikeF)}°</span>
            )}
            {(roundOrNull(hi) !== null || roundOrNull(lo) !== null) && (
              <span className="wn-hilo">
                {roundOrNull(hi) !== null && <span className="wn-hi">H {roundOrNull(hi)}°</span>}
                {roundOrNull(lo) !== null && <span className="wn-lo">L {roundOrNull(lo)}°</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {asOf && <div className="wn-asof">As of {asOf}</div>}

      {safeHourly.length > 0 && (
        <div className="wn-hourly-scroll">
          <div className="wn-hourly">
            {safeHourly.map((h, i) => {
              const HourIc = weatherGlyph(h.icon || undefined);
              return (
                <div
                  key={i}
                  className="wn-hour m-stagger-item m-fade-rise"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <span className="wn-hour-time">{h.time}</span>
                  <HourIc className="ic wn-hour-icon" />
                  <span className="wn-hour-temp tab-num">{roundOrNull(h.tempF) ?? '—'}°</span>
                  {roundOrNull(h.precipPct) !== null &&
                    (roundOrNull(h.precipPct) as number) > 0 && (
                      <span className="wn-hour-precip">{roundOrNull(h.precipPct)}%</span>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {safeTiles.length > 0 && (
        <div className="wn-tiles">
          {safeTiles.map((t, i) => {
            const TileIc = t.icon ? Icon[t.icon] : undefined;
            return (
              <div
                key={i}
                className="wn-tile m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                {TileIc && <TileIc className="ic wn-tile-icon" />}
                <span className="wn-tile-label">{t.label}</span>
                <span className="wn-tile-value tab-num">{t.value}</span>
              </div>
            );
          })}
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

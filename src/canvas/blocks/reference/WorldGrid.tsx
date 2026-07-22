import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { WorldGridCountry, WorldGridProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WorldGridProps & { delay?: number };

// A compact multi-country comparison grid: one tile per country, a flag glyph up top,
// name, and a couple of micro label/value rows. Distinct from countrycard's single-
// country deep-dive — this trades depth for an at-a-glance spread across many.
export function WorldGrid({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  countries,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const safeCountries: WorldGridCountry[] = Array.isArray(countries) ? countries : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {safeCountries.length === 0 ? (
        <div className="wg-empty">No countries yet.</div>
      ) : (
        <div className="wg-grid">
          {safeCountries.map((c, i) => (
            <div
              key={i}
              className="wg-tile m-stagger-item m-scale-in"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="wg-flag" role="img" aria-label={`Flag of ${c.name}`}>
                {typeof c.flag === 'string' && c.flag.trim() ? c.flag : '🌐'}
              </span>
              <div className="wg-name">{c.name}</div>
              {c.capital && (
                <div className="wg-row">
                  <span className="wg-row-k">Capital</span>
                  <span className="wg-row-v">{c.capital}</span>
                </div>
              )}
              {c.currency && (
                <div className="wg-row">
                  <span className="wg-row-k">Currency</span>
                  <span className="wg-row-v">{c.currency}</span>
                </div>
              )}
              {c.language && (
                <div className="wg-row">
                  <span className="wg-row-k">Language</span>
                  <span className="wg-row-v">{c.language}</span>
                </div>
              )}
            </div>
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

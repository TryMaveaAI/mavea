import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CountryCardProps, CountryFact } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CountryCardProps & { delay?: number };

// A single-country deep-dive: a flag banner (a real emoji glyph — no image fetch, so it
// can never 404), a field-marks row for capital/population/area/currency, an official-
// languages chip list, and a short fact list. Distinct from worldgrid, which trades this
// depth for a compact multi-country glance.
export function CountryCard({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  name,
  flag,
  capital,
  population,
  area,
  officialLanguages,
  currency,
  facts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const safeFacts: CountryFact[] = Array.isArray(facts) ? facts : [];
  const langs = (Array.isArray(officialLanguages) ? officialLanguages : []).filter(
    (l): l is string => typeof l === 'string' && l.trim().length > 0,
  );
  const marks = [
    { label: 'Capital', value: capital },
    { label: 'Population', value: population },
    { label: 'Area', value: area },
    { label: 'Currency', value: currency },
  ].filter((m): m is { label: string; value: string } => typeof m.value === 'string' && !!m.value);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="cc-banner">
        <span className="cc-flag" role="img" aria-label={`Flag of ${name}`}>
          {typeof flag === 'string' && flag.trim() ? flag : '🌐'}
        </span>
      </div>

      <div className="cc-name" data-mark="underline">
        {name}
      </div>

      {marks.length > 0 && (
        <div className="cc-marks">
          {marks.map((m, i) => (
            <div key={i} className="cc-mark">
              <span className="cc-mark-label">{m.label}</span>
              <span className="cc-mark-value">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {langs.length > 0 && (
        <div className="cc-langs">
          {langs.map((l, i) => (
            <span key={i} className="cc-lang-chip">
              {l}
            </span>
          ))}
        </div>
      )}

      {safeFacts.length > 0 && (
        <div className="cc-facts">
          {safeFacts.map((f, i) => (
            <div key={i} className="cc-fact-row">
              <span className="cc-fact-label">{f.label}</span>
              <span className="cc-fact-value">{f.value}</span>
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

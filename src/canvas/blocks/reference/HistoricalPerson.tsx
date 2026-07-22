import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HistoricalFact, HistoricalPersonProps, LifeEvent } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HistoricalPersonProps & { delay?: number };

// Derive a 1–2 letter monogram from a name: initials of the first two words, or the
// first letter alone for a single-word name. Falls back to "?" for a genuinely empty
// name so the medallion never renders blank.
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0]?.toUpperCase() ?? '?';
  return ((words[0][0] ?? '') + (words[words.length - 1][0] ?? '')).toUpperCase();
}

function displayYear(year: unknown): string {
  return (typeof year === 'string' && year.trim()) ||
    (typeof year === 'number' && Number.isFinite(year))
    ? String(year)
    : '—';
}

// Biography profile card: a monogram medallion, the name + era as the headline, birth/
// death as a lead stat pair, a compact strip of life-beats, and a short legacy
// paragraph. Every field here is optional except the name — a biography lookup can
// come back thin (just a name and era) or rich (facts, a dozen life events, legacy
// prose), and the card degrades gracefully either way.
export function HistoricalPerson({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  name,
  era,
  born,
  died,
  knownFor,
  facts,
  lifeEvents,
  legacy,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const safeFacts: HistoricalFact[] = facts ?? [];
  const safeEvents: LifeEvent[] = lifeEvents ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="hp-head">
        <div className="hp-medallion" aria-hidden="true">
          {monogram(name)}
        </div>
        <div className="hp-headline">
          <div className="hp-name" data-mark="underline">
            {name}
          </div>
          {era && <div className="hp-era">{era}</div>}
          {knownFor && <div className="hp-known">{knownFor}</div>}
        </div>
      </div>

      {(born || died) && (
        <div className="hp-dates">
          {born && (
            <div className="hp-date">
              <span className="hp-date-k">Born</span>
              <span className="hp-date-v">{born}</span>
            </div>
          )}
          {died && (
            <div className="hp-date">
              <span className="hp-date-k">Died</span>
              <span className="hp-date-v">{died}</span>
            </div>
          )}
        </div>
      )}

      {safeEvents.length > 0 && (
        <div className="hp-beats">
          {safeEvents.map((ev, i) => (
            <div
              key={i}
              className="hp-beat m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="hp-beat-year">{displayYear(ev.year)}</span>
              <span className="hp-beat-label">{ev.label}</span>
            </div>
          ))}
        </div>
      )}

      {safeFacts.length > 0 && (
        <div className="hp-facts">
          {safeFacts.map((f, i) => (
            <div key={i} className="hp-fact-row">
              <span className="hp-fact-label">{f.label}</span>
              <span className="hp-fact-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {legacy && <div className="hp-legacy">{legacy}</div>}

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

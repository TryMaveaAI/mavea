import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DictionaryProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DictionaryProps & { delay?: number };

// Dictionary entry card: large word display with IPA phonetic, numbered senses each
// carrying a POS chip, definition, optional italic example, and synonym chips.
// An etymology note sits below a subtle separator when provided.
export function Dictionary({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  word,
  phonetic,
  senses,
  etymology,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const safeSenses = senses ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* word headline + phonetic */}
      <div className="dc-word">{word}</div>
      {phonetic && (
        <div className="dc-phonetic" style={{ fontFamily: 'monospace', fontStyle: 'normal' }}>
          {phonetic}
        </div>
      )}

      {/* senses list */}
      {safeSenses.length > 0 && (
        <ol className="dc-senses" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {safeSenses.map((sense, i) => (
            <li key={i} className="dc-sense">
              {/* sense number + POS chip on one line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 'var(--fs-xs, 11px)',
                    fontWeight: 700,
                    color: 'var(--text-faint)',
                    minWidth: '1.4em',
                  }}
                >
                  {i + 1}.
                </span>
                <span className="dc-pos">{sense.pos}</span>
              </div>

              {/* definition — first sense is the lead meaning (authored order); underline
                  gesture points at the primary definition text */}
              <div
                className="dc-def"
                style={{ paddingLeft: 'calc(1.4em + 8px)' }}
                {...(i === 0 ? { 'data-mark': 'underline' } : {})}
              >
                {sense.definition}
              </div>

              {/* example sentence */}
              {sense.example && (
                <div className="dc-example" style={{ marginLeft: 'calc(1.4em + 8px)' }}>
                  {sense.example}
                </div>
              )}

              {/* synonym chips */}
              {(sense.synonyms ?? []).length > 0 && (
                <div
                  className="dc-synonyms"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 4,
                    marginLeft: 'calc(1.4em + 8px)',
                  }}
                >
                  <span style={{ color: 'var(--text-faint)', marginRight: 2 }}>syn.</span>
                  {(sense.synonyms ?? []).map((syn, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: 'var(--fs-xs, 11px)',
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: 'var(--track)',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.7,
                      }}
                    >
                      {syn}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* etymology — subtle separator before the note */}
      {etymology && (
        <div className="dc-etymology">
          <span style={{ fontWeight: 600, fontStyle: 'normal', color: 'var(--text-muted)' }}>
            Etymology&ensp;
          </span>
          {etymology}
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

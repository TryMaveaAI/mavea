import { type CSSProperties, useMemo } from 'react';
import { Icon } from '../../../icons/icons';
import type { GlossProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GlossProps & { delay?: number };

// Glossary-of-terms card: alphabetically sorted entries with faint letter dividers
// whenever a new first-letter group begins. Each entry shows the term in bold,
// definition below at secondary weight, and an optional cross-reference in muted
// italic. An optional domain chip sits below the eyebrow.
export function Gloss({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  domain,
  entries,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;

  // Sort entries alphabetically by term (case-insensitive) once per prop change.
  const sorted = useMemo(
    () =>
      [...(entries ?? [])].sort((a, b) =>
        a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }),
      ),
    [entries],
  );

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* optional domain chip */}
      {domain && <div className="gl-domain">{domain}</div>}

      {/* entries with letter-group dividers */}
      <div className="gl-entries">
        {sorted.map((entry, i) => {
          const letter = entry.term.charAt(0).toUpperCase();
          const prevLetter = i === 0 ? null : sorted[i - 1].term.charAt(0).toUpperCase();
          const showDivider = letter !== prevLetter;

          return (
            <div key={i}>
              {showDivider && (
                <div className="gl-letter-divider" aria-hidden="true">
                  {letter}
                </div>
              )}
              <div className="gl-entry">
                <div className="gl-term">{entry.term}</div>
                <div className="gl-def">{entry.definition}</div>
                {entry.see && (
                  <div className="gl-see">
                    See also: <span style={{ fontStyle: 'italic' }}>{entry.see}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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

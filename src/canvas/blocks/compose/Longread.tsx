import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LongreadProps, LongreadSection } from './types';
import { BlockEmpty, CopyButton } from '../../lib';
import { richInnerHtml } from '../../../lib/richText';

type Props = LongreadProps & { delay?: number };

/** A section with its prose already filtered down to the strings that actually carry words. */
interface ReadySection {
  heading?: string;
  paragraphs: string[];
}

/** Adult silent-reading speed for non-technical prose; only used when no readingTime is given. */
const WORDS_PER_MINUTE = 225;

/** The entrance stagger stops climbing after this many sections, so a long piece's tail still
 *  animates in with the rest instead of waiting seconds for its turn. */
const MAX_STAGGER_INDEX = 11;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Drop blank paragraphs and any section left with nothing to read, so the spine never draws a
 *  marker against empty space. A heading with no paragraphs under it is kept — that's a real
 *  section the writer hasn't filled, not a defect. */
function readySections(sections: readonly LongreadSection[] | undefined): ReadySection[] {
  // Annotated rather than inferred: `Array.isArray` widens a `readonly T[]` to `any[]`, and the
  // point of these guards is that loose model JSON can't reach React, not that it loses its type.
  const list: readonly LongreadSection[] = Array.isArray(sections) ? sections : [];
  const out: ReadySection[] = [];
  for (const section of list) {
    const raw: readonly string[] = Array.isArray(section?.paragraphs) ? section.paragraphs : [];
    const paragraphs = raw.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
    const heading = typeof section?.heading === 'string' ? section.heading.trim() : '';
    if (heading || paragraphs.length > 0) out.push({ heading: heading || undefined, paragraphs });
  }
  return out;
}

/** One section as plain text for the clipboard — heading, blank line, then its paragraphs. */
function sectionText(section: ReadySection): string {
  return [section.heading, ...section.paragraphs].filter(Boolean).join('\n\n');
}

// A first-party reading surface: Mavéa's own prose, typeset the way prose wants to be read —
// an optional standfirst, then headed sections on a light spine at a real ~66ch measure, with
// the reading time and a copy-out above it. There is deliberately no filename bar, page number,
// or paper texture: `docview` frames text as a file somebody uploaded, and that framing is
// exactly wrong for words Mavéa wrote herself.
export function Longread({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  standfirst,
  sections,
  readingTime,
  copySections,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.edit;
  const ready = readySections(sections);
  const lede = typeof standfirst === 'string' ? standfirst.trim() : '';

  if (ready.length === 0 && !lede) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="Nothing written yet" />
      </div>
    );
  }

  const words = countWords([lede, ...ready.flatMap((s) => s.paragraphs)].join(' '));
  const minutes =
    typeof readingTime === 'number' && Number.isFinite(readingTime)
      ? Math.max(1, Math.round(readingTime))
      : Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  // The spine is structure, not decoration: with no headings anywhere there is nothing for it
  // to mark, so the prose runs at full measure instead.
  const hasHeadings = ready.some((s) => s.heading);
  const wholePiece = [lede, ...ready.map(sectionText)].filter(Boolean).join('\n\n');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lgr-wrap">
        <div className="lgr-meta">
          <span className="lgr-readtime tab-num faint">
            {minutes} min read
            {words > 0 && ` · ${words.toLocaleString()} words`}
          </span>
          <CopyButton text={wholePiece} label="Copy the whole piece" />
        </div>

        {lede && <p className="lgr-standfirst">{lede}</p>}

        <div className={'lgr-piece' + (hasHeadings ? ' lgr-piece--spine' : '')}>
          {ready.map((section, i) => (
            <section
              key={i}
              className="lgr-section m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: Math.min(i, MAX_STAGGER_INDEX) } as CSSProperties}
            >
              {section.heading && (
                <h3 className="lgr-heading">
                  <span className="lgr-heading-text">{section.heading}</span>
                  {copySections && (
                    <CopyButton
                      text={sectionText(section)}
                      label={`Copy “${section.heading}”`}
                      className="lgr-section-copy"
                    />
                  )}
                </h3>
              )}
              {section.paragraphs.map((paragraph, pi) => (
                <p key={pi} className="lgr-para">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
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

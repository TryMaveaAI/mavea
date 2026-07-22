import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScansionMarkProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScansionMarkProps & { delay?: number };

// The two prosody marks placed above each syllable: an acute accent for a stressed beat, a
// breve for an unstressed one — the same notation a scansion does by hand.
const MARK: Record<'stressed' | 'unstressed', string> = {
  stressed: '´', // ´ acute accent
  unstressed: '˘', // ˘ breve
};

// Rhyme letters are coloured so the scheme reads at a glance (every "a" the same hue). The
// palette cycles through the family's accent tokens; a line with no rhyme letter gets none.
const RHYME_HUES = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
] as const;

/**
 * A poetry scansion: each line's syllables carry a stress mark above them, foot-divider bars
 * fall between metrical feet, and the rhyme letter sits in the right margin under the named
 * meter. The marks, foot bars, and rhyme palette are all computed from the per-syllable data,
 * so the card scans exactly what the model authored — no invented beats.
 */
export function ScansionMark({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  lines,
  meter,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;

  // Assign each distinct rhyme letter a stable hue from the palette, in first-seen order, so
  // matching rhymes share a colour across the whole poem.
  const rhymeHue = new Map<string, string>();
  for (const ln of lines) {
    const r = ln.rhyme?.trim().toLowerCase();
    if (r && !rhymeHue.has(r)) rhymeHue.set(r, RHYME_HUES[rhymeHue.size % RHYME_HUES.length]);
  }

  return (
    <div
      className="card reveal lay-scan"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      {meter && (
        <div className="lay-scan-meter">
          <span className="lay-scan-meter-key">
            <span className="lay-scan-glyph">{MARK.stressed}</span> stressed
            <span className="lay-scan-glyph muted">{MARK.unstressed}</span> unstressed
          </span>
          <span className="lay-scan-meter-name">{meter}</span>
        </div>
      )}

      <div className="lay-scan-lines">
        {lines.map((ln, li) => {
          // A foot bar is drawn BEFORE the syllable at each `feet` index (skipping 0, which
          // would sit at the very start of the line). Lookup is per-index for the row render.
          const feet = new Set((ln.feet || []).filter((i) => i > 0 && i < ln.syllables.length));
          const hue = ln.rhyme ? rhymeHue.get(ln.rhyme.trim().toLowerCase()) : undefined;
          return (
            <div className="lay-scan-row" key={li}>
              <ol className="lay-scan-line">
                {ln.syllables.map((sy, si) => (
                  <li
                    className="lay-scan-syl"
                    key={si}
                    data-stress={sy.stress === 'stressed' ? 'on' : 'off'}
                  >
                    {feet.has(si) && <span className="lay-scan-bar" aria-hidden="true" />}
                    <span className="lay-scan-mark" aria-hidden="true">
                      {MARK[sy.stress] ?? MARK.unstressed}
                    </span>
                    <span className="lay-scan-text">{sy.text}</span>
                  </li>
                ))}
              </ol>
              {ln.rhyme && (
                <span
                  className="lay-scan-rhyme"
                  style={hue ? ({ ['--rh' as string]: hue } as CSSProperties) : undefined}
                >
                  {ln.rhyme.trim().toLowerCase()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {caption && <div className="lay-scan-caption faint">{caption}</div>}

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

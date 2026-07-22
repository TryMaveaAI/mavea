import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PronunciationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PronunciationProps & { delay?: number };

// Pronunciation guide: large word display, IPA badge, syllable breakdown
// with stressed syllable bolded, and tips list using .pr-tips CSS class.
// The syllables prop uses the inter-punct separator (·) convention, matching
// standard lexicographic style — e.g. "pro·nun·ci·a·tion".
export function Pronunciation({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  word,
  ipa,
  syllables,
  tips,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.doc;
  const safeTips = tips ?? [];

  // Split on the inter-punct character and bold the syllable that carries
  // primary stress. IPA primary stress mark is ˈ (U+02C8); secondary is ˌ.
  // We find the stressed syllable index by scanning the IPA string for ˈ and
  // mapping it back to the syllable list by token order.
  const syllableParts: { text: string; stressed: boolean }[] = (() => {
    if (!syllables) return [];
    const parts = syllables.split('·');
    if (!ipa) return parts.map((t) => ({ text: t, stressed: false }));

    // The IPA string has ˈ immediately before the stressed syllable's phones.
    // A reliable heuristic: the syllable whose lowercase letters appear after
    // the first ˈ in the IPA is the stressed one. Count the ˈ position from
    // the start — if ˈ appears before the nth phoneme cluster, syllable n is
    // stressed. Simpler and robust: mark the first syllable that follows ˈ in
    // left-to-right order by finding which part index matches the ˈ-adjacent
    // segment. Fall back to index 0 when detection is ambiguous.
    const stressedIdx = (() => {
      const stressPos = ipa.indexOf('ˈ');
      if (stressPos === -1) return -1;
      // Count how many syllable separators appear before the stress mark in
      // the IPA by comparing character density — approximation: pick the
      // syllable at a proportional offset into the parts array.
      const ipaCore = ipa.replace(/[/[\]]/g, '');
      const fraction = stressPos / Math.max(ipaCore.length, 1);
      return Math.min(Math.round(fraction * parts.length), parts.length - 1);
    })();

    return parts.map((text, i) => ({ text, stressed: i === stressedIdx }));
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* large word headline */}
      <div className="pr-word">{word}</div>

      {/* IPA badge — monospace, grid-line background */}
      {ipa && (
        <div
          className="pr-ipa"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono, monospace)',
            fontStyle: 'normal',
            background: 'var(--grid-line)',
            borderRadius: 'var(--r-sm, 4px)',
            padding: '2px 8px',
            marginTop: 6,
            fontSize: 'var(--fs-sm, 14px)',
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
          }}
        >
          {ipa}
        </div>
      )}

      {/* syllable breakdown with stressed syllable bolded */}
      {syllableParts.length > 0 && (
        <div className="pr-syllables">
          {syllableParts.map((part, i) => (
            <span key={i}>
              {i > 0 && (
                <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                  ·
                </span>
              )}
              {/* stressed syllable is explicitly highlighted; underline gesture on it */}
              <span
                style={
                  part.stressed
                    ? { fontWeight: 800, color: 'var(--presence)' }
                    : { fontWeight: 400, color: 'var(--text-secondary)' }
                }
                {...(part.stressed ? { 'data-mark': 'underline' } : {})}
              >
                {part.text}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* tips list — .pr-tips + .pr-tip (→ arrow via CSS ::before) */}
      {safeTips.length > 0 && (
        <div className="pr-tips">
          {safeTips.map((tip, i) => (
            <div key={i} className="pr-tip">
              {tip}
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

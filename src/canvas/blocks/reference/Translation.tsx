import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { CopyButton } from '../../lib';
import type { TranslationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TranslationProps & { delay?: number };

// Translation card: renders the full source text and its translation together, then
// an optional sentence-by-sentence breakdown for learners who want to see how each
// piece maps across. CopyButton lives next to the result so the output is immediately
// portable — copy is the primary action on a translation surface.
export function Translation({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  fromLang,
  toLang,
  text,
  result,
  pairs,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const safePairs = pairs ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* language-pair direction line */}
      <div className="tl-langs">
        <span className="tl-from">{fromLang}</span>
        <span className="tl-arrow">→</span>
        <span className="tl-to">{toLang}</span>
      </div>

      {/* source + result side by side */}
      <div className="tl-pair">
        <div className="tl-source">
          <div className="tl-text" style={{ color: 'var(--text-secondary)' }}>
            {text}
          </div>
        </div>
        <div className="tl-result">
          {/* result is the primary datum — it's bold and gets the copy button;
              underline gesture points at the translated text */}
          <div className="tl-text" style={{ fontWeight: 600 }} data-mark="underline">
            {result}
          </div>
        </div>
      </div>

      {/* copy affordance for the translated result */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <CopyButton text={result} label={`Copy ${toLang} translation`} />
      </div>

      {/* sentence-by-sentence breakdown */}
      {safePairs.length > 0 && (
        <>
          <div
            style={{
              fontSize: 'var(--fs-xs, 11px)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            Breakdown
          </div>
          <div className="tl-breakdowns">
            {safePairs.map((pair, i) => (
              <div key={i} className="tl-bp">
                <span className="tl-bp-orig">{pair.original}</span>
                <span className="tl-bp-trans">
                  {pair.translated}
                  {pair.note && (
                    <span className="tl-bp-note" style={{ display: 'block', marginTop: 2 }}>
                      {pair.note}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
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

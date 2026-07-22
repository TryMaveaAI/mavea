import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VoiceStyleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VoiceStyleProps & { delay?: number };

// Capture & apply the user's personal writing voice: the learned style traits as chips, then a
// before→after that lands the payoff — the same line in a flat generic voice vs in the user's own.
// The rewritten "in your voice" side is the hero (emphasised), the generic side is the muted foil.
// For "learn my voice / make it sound like me". Only renders the traits and sample actually given.
export function VoiceStyle({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  traits,
  sample,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.spark;
  const chips = traits ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Captured style traits — each is a fingerprint of how the user writes, with an optional
          tell-tale example shown as a tooltip-style aside under the label. */}
      {chips.length > 0 && (
        <div className="vst-traits">
          {chips.map((t, i) => (
            <span key={i} className="vst-chip">
              <span className="vst-chip-label">{t.trait}</span>
              {t.example && <span className="vst-chip-ex">{t.example}</span>}
            </span>
          ))}
        </div>
      )}

      {/* The before→after payoff: a muted generic line, an arrow, then the rewrite in the user's
          own voice rendered large and accented — the reveal the whole card builds toward. */}
      {sample && (
        <div className="vst-baf">
          {sample.generic && (
            <div className="vst-side vst-side--generic">
              <div className="vst-side-tag">Generic</div>
              <p className="vst-generic-text">{sample.generic}</p>
            </div>
          )}

          {sample.generic && sample.inYourVoice && (
            <div className="vst-arrow" aria-hidden="true">
              <Icon.spark className="ic" style={{ width: 14, height: 14 }} />
            </div>
          )}

          {sample.inYourVoice && (
            <div className="vst-side vst-side--mine">
              <div className="vst-side-tag vst-side-tag--mine">
                <Icon.check className="ic" style={{ width: 12, height: 12 }} /> In your voice
              </div>
              <p className="vst-mine-text">{sample.inYourVoice}</p>
            </div>
          )}
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

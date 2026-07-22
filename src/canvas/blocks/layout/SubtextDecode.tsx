import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SubtextDecodeProps, SubtextLikelihood } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SubtextDecodeProps & { delay?: number };

// Likelihood → label + accent. Honest odds, never a single confident reading.
const BAND: Record<SubtextLikelihood, { label: string; color: string }> = {
  'most likely': { label: 'Most likely', color: 'var(--insight)' },
  possible: { label: 'Possible', color: 'var(--warning)' },
  'less likely': { label: 'Less likely', color: 'var(--text-muted)' },
};

// Decode a received message the user is unsure about: the verbatim message pinned at top, 2–3 ranked
// interpretations each resting on the exact textual cue, an honest "you can't know for sure" line, and
// one clarifying reply to send. The 'caution' flavor reframes it as red-flag/scam screening (the
// readings become warning signs) without forking into a second component. Distinct from differential
// (causes of a fault/symptom) — this reads tone and intent in someone's own words.
export function SubtextDecode({
  title,
  icon,
  iconColor,
  flavor = 'tone',
  message,
  readings,
  cantKnow,
  reply,
  footer,
  delay,
}: Props) {
  const caution = flavor === 'caution';
  const Ic = Icon[icon ?? (caution ? 'shield' : 'chat')] || Icon.chat;
  const accent = iconColor || (caution ? 'var(--warning)' : 'var(--presence)');
  const list = readings ?? [];

  return (
    <div
      className="card reveal sbd-card"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sd' as string]: accent } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: accent }} /> {title}
      </div>

      <figure className="sbd-msg">
        <span className="sbd-msg-bar" />
        <Icon.quote className="ic sbd-msg-mark" style={{ width: 22, height: 22 }} />
        <blockquote className="sbd-msg-text">{message}</blockquote>
      </figure>

      {list.length > 0 && (
        <ol className="sbd-readings">
          {list.map((r, i) => {
            const band = r.likelihood ? BAND[r.likelihood] : undefined;
            return (
              <li key={i} className="sbd-reading">
                <div className="sbd-reading-head">
                  <span className="sbd-rank">{i + 1}</span>
                  <span className="sbd-interp">{r.interpretation}</span>
                  {band && (
                    <span
                      className="sbd-band"
                      style={{ ['--sb' as string]: band.color } as CSSProperties}
                    >
                      {band.label}
                    </span>
                  )}
                </div>
                {r.cue && (
                  <div className="sbd-cue">
                    <span className="sbd-cue-tag">{caution ? 'Red flag' : 'Rests on'}</span>
                    <span>{r.cue}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {cantKnow && (
        <div className="sbd-cantknow">
          <Icon.eye className="ic" style={{ width: 14, height: 14 }} />
          <span>{cantKnow}</span>
        </div>
      )}

      {reply && (
        <div className="sbd-reply">
          <div className="sbd-reply-tag">
            <Icon.send className="ic" style={{ width: 13, height: 13 }} />
            {caution ? 'If you respond' : 'You could ask'}
          </div>
          <p className="sbd-reply-text">{reply}</p>
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

import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TalkTrackProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TalkTrackProps & { delay?: number };

// A speakable, word-for-word talk-track: the literal sentences to SAY, in order, paced — for a
// toast, pitch, interview answer, or hard phone call. Lines render large and calm so they read at a
// glance while talking; delivery beats ("pause here", "~15s") sit as quiet side notes. Distinct from
// takeaways (bullets to remember): these are spoken sentences, voice-first, said out loud.
export function TalkTrack({
  title,
  icon = 'mic',
  iconColor = 'var(--presence)',
  lines,
  totalTime,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.mic;
  const list = lines ?? [];

  return (
    <div
      className="card reveal tlk-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {totalTime && (
          <span className="tlk-total">
            <Icon.clock className="ic tlk-total-ic" /> {totalTime}
          </span>
        )}
      </div>

      <ol className="tlk-list">
        {list.map((l, i) => (
          <li key={i} className="tlk-line">
            <span className="tlk-rail" aria-hidden="true">
              <span className="tlk-dot" />
            </span>
            <div className="tlk-body">
              <p className="tlk-say">{l.say}</p>
              {(l.beat || l.note) && (
                <div className="tlk-meta">
                  {l.beat && (
                    <span className="tlk-beat">
                      <Icon.play className="ic tlk-beat-ic" /> {l.beat}
                    </span>
                  )}
                  {l.note && <span className="tlk-note">{l.note}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

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

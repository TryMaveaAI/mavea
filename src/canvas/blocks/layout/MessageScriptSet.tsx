import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { CopyButton } from '../../lib';
import type { MessageScriptSetProps, ScriptChannel } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MessageScriptSetProps & { delay?: number };

// Channel → chip label + icon. The chip tells the user HOW each line is meant to be sent, so the
// same bundle can mix an email, a phone-call script, and an in-app chat without confusion.
const CHANNEL: Record<ScriptChannel, { label: string; icon: keyof typeof Icon }> = {
  email: { label: 'Email', icon: 'mail' },
  phone: { label: 'Call', icon: 'speaker' },
  'in-app': { label: 'In-app', icon: 'sliders' },
  chat: { label: 'Chat', icon: 'chat' },
};

// A bundle of ready-to-send messages aimed at SEVERAL recipients at once — "here is what to say to
// cancel / dispute / ask X across these N places." Each target is its own card: a channel chip, the
// exact line to send in a copy-friendly block, and an optional rebuttal for when they push back.
// Distinct from messagedraft, which polishes ONE message to ONE recipient.
export function MessageScriptSet({
  title,
  icon = 'send',
  iconColor = 'var(--presence)',
  intro,
  scripts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.send;
  const list = scripts ?? [];

  return (
    <div
      className="card reveal mss-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {intro && <p className="mss-intro">{intro}</p>}

      <ul className="mss-list">
        {list.map((s, i) => {
          const ch = s.channel ? CHANNEL[s.channel] : undefined;
          const ChIc = ch ? Icon[ch.icon] || Icon.send : undefined;
          return (
            <li key={i} className="mss-item">
              <div className="mss-head">
                <span className="mss-target">{s.target}</span>
                {ch && ChIc && (
                  <span className="mss-chan">
                    <ChIc className="ic mss-chan-ic" /> {ch.label}
                  </span>
                )}
              </div>

              <div className="mss-msg">
                <p className="mss-msg-text">{s.message}</p>
                <CopyButton text={s.message} label="Copy message" className="mss-copy" />
              </div>

              {s.rebuttal && (
                <div className="mss-rebuttal">
                  <span className="mss-rebuttal-tag">If they push back</span>
                  <span>{s.rebuttal}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

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

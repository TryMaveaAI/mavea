import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChatThreadProps, ChatMessage } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ChatThreadProps & { delay?: number };

// Derive a single-letter avatar label: prefer the first character of the
// display name, fall back to the first letter of the role string.
function avatarLabel(msg: ChatMessage): string {
  const source = msg.name ?? msg.role;
  return source.charAt(0).toUpperCase();
}

export function ChatThread({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  participants,
  messages,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chat;
  // Guard against an absent messages prop so the component renders an empty thread
  // rather than crashing when a block is partially constructed.
  const thread = messages ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {participants && (
          <span className="ct-participants" style={{ marginLeft: 'auto' }}>
            {participants}
          </span>
        )}
      </div>

      <div className="ct-thread">
        {thread.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={i}
              className={`ct-row m-stagger-item m-fade-rise${isUser ? ' ct-user' : ''}`}
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <div className="ct-avatar" aria-hidden="true">
                {avatarLabel(msg)}
              </div>
              {/* Stamp the first bubble — ordered authored content, the author placed it first */}
              <div className="ct-bubble" {...(i === 0 ? { 'data-mark': 'circle' } : {})}>
                {msg.name && <div className="ct-name">{msg.name}</div>}
                <div>{msg.text}</div>
                {msg.time && <div className="ct-time">{msg.time}</div>}
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

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PullquoteProps, LayoutTone } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PullquoteProps & { delay?: number };

const TONE_ACCENT: Record<LayoutTone, string> = {
  info: 'var(--presence)',
  success: 'var(--insight)',
  warn: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--text-muted)',
};

export function Pullquote({
  title,
  icon = 'quote',
  iconColor,
  quote,
  author,
  role,
  tone = 'info',
  variants,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.quote;
  const accent = TONE_ACCENT[tone];

  // all quotes (primary + variants) form a carousel; idx 0 is the headline quote
  const all = [{ quote, author, role }, ...(variants || [])];
  const [idx, setIdx] = useState(0);
  const cur = all[idx];

  return (
    <div
      className="card reveal lay-pq"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pq' as string]: accent } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor || accent }} /> {title}
      </div>

      <figure className="lay-pq-fig">
        <span className="lay-pq-bar" />
        <Icon.quote className="ic lay-pq-mark" style={{ color: accent }} />
        <blockquote
          className="lay-pq-quote"
          key={idx}
          dangerouslySetInnerHTML={richInnerHtml(cur.quote)}
        />
        {(cur.author || cur.role) && (
          <figcaption className="lay-pq-cap">
            {cur.author && <span className="lay-pq-author">{cur.author}</span>}
            {cur.role && <span className="lay-pq-role faint">{cur.role}</span>}
          </figcaption>
        )}
      </figure>

      {all.length > 1 && (
        <div className="lay-pq-nav">
          <button
            type="button"
            className="lay-pq-arrow mini-btn"
            onClick={() => setIdx((i) => (i - 1 + all.length) % all.length)}
            aria-label="previous quote"
          >
            <Icon.chevR className="ic" style={{ transform: 'rotate(180deg)' }} />
          </button>
          <span className="lay-pq-dots">
            {all.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`lay-pq-dot ${i === idx ? 'on' : ''}`}
                onClick={() => setIdx(i)}
                aria-label={`quote ${i + 1}`}
              />
            ))}
          </span>
          <button
            type="button"
            className="lay-pq-arrow mini-btn"
            onClick={() => setIdx((i) => (i + 1) % all.length)}
            aria-label="next quote"
          >
            <Icon.chevR className="ic" />
          </button>
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

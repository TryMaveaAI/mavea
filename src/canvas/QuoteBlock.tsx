// A grid of testimonial quotes, each tinted by an optional tone.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { QuoteBlockProps } from '../data/conversation';

type Props = QuoteBlockProps & { delay?: number };

export function QuoteBlock({
  title = 'What customers are saying',
  icon = 'quote',
  iconColor = 'var(--presence-soft)',
  quotes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.quote;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <ul className="quote-list">
        {quotes.map((q, i) => (
          <li
            key={i}
            className={'quote-item q-' + (q.tone || 'neutral')}
            style={{ '--ti': i } as CSSProperties}
          >
            <p className="quote-text">“{q.text}”</p>
            <span className="quote-who">{q.who}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

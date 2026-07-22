import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FaqProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FaqProps & { delay?: number };

export function Faq({
  title,
  icon = 'chat',
  iconColor = 'var(--presence)',
  items,
  defaultOpen = 0,
  multi = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chat;
  const [open, setOpen] = useState<Set<number>>(() =>
    defaultOpen >= 0 ? new Set([defaultOpen]) : new Set(),
  );

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(multi ? prev : []);
      if (prev.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-faq-list">
        {items.map((it, i) => {
          const isOpen = open.has(i);
          return (
            <div key={i} className={`lay-faq-item ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="lay-faq-q"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
              >
                <Icon.plus
                  className="ic lay-faq-sign"
                  style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                />
                <span className="lay-faq-q-text" dangerouslySetInnerHTML={richInnerHtml(it.q)} />
                {it.tag && <span className="lay-faq-tag">{it.tag}</span>}
              </button>
              <div className={`lay-faq-a ${isOpen ? 'open' : ''}`}>
                <div className="lay-faq-a-inner" dangerouslySetInnerHTML={richInnerHtml(it.a)} />
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

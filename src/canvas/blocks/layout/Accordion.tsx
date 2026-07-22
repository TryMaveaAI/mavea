import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { AccordionProps } from './types';

type Props = AccordionProps & { delay?: number };

// A general disclosure list: expandable sections with rich bodies. Distinct from Faq
// (which is Q&A-specific) — the header carries an optional leading icon, a meta hint, and
// a tag, and a chevron rotates to signal state. Single-open by default (classic accordion);
// `multi` lets several stay open. The open rows are tracked by index, so authored content
// order is preserved and the body uses the same 0fr→1fr grid reveal as the rest of the family.
export function Accordion({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  sections,
  defaultOpen = 0,
  multi = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
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

      <div className="lay-acc-list">
        {sections.map((s, i) => {
          const isOpen = open.has(i);
          const LeadIc = s.icon ? Icon[s.icon] : null;
          return (
            <div key={i} className={`lay-acc-item ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="lay-acc-head"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
              >
                {LeadIc && (
                  <LeadIc className="ic lay-acc-lead" style={{ color: s.tagColor || iconColor }} />
                )}
                <span className="lay-acc-label">{s.label}</span>
                {s.tag && (
                  <span
                    className="lay-acc-tag"
                    style={
                      s.tagColor ? { color: s.tagColor, borderColor: 'currentColor' } : undefined
                    }
                  >
                    {s.tag}
                  </span>
                )}
                {s.meta && <span className="lay-acc-meta">{s.meta}</span>}
                <Icon.arrowDown
                  className="ic lay-acc-chev"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                />
              </button>
              <div className={`lay-acc-body ${isOpen ? 'open' : ''}`}>
                <div
                  className="lay-acc-body-inner"
                  dangerouslySetInnerHTML={richInnerHtml(s.body)}
                />
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

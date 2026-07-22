// A done/doing/todo checklist — plan progress, study run-ups, setup steps.
// Each row carries a status (done | doing | todo) that drives its check glyph.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { ProgressChecklistProps } from '../data/conversation';

type Props = ProgressChecklistProps & { delay?: number };

export function ProgressChecklist({
  title = 'Plan',
  icon = 'check',
  iconColor = 'var(--insight)',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  // The in-progress (doing) step is the active emphasis; if none, the first todo is the lead.
  const salientIdx = (() => {
    const doing = rows.findIndex((r) => r.st === 'doing');
    if (doing >= 0) return doing;
    return rows.findIndex((r) => r.st === 'todo');
  })();
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <ul className="plan-list">
        {rows.map((p, i) => (
          <li key={i} className={'plan-row st-' + p.st} style={{ '--ti': i } as CSSProperties}>
            <span className="plan-check" data-mark={i === salientIdx ? 'circle' : undefined}>
              {p.st === 'done' ? (
                <Icon.check style={{ width: 12, height: 12 }} />
              ) : p.st === 'doing' ? (
                <span className="plan-dot" />
              ) : null}
            </span>
            <span className="plan-t">{p.t}</span>
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

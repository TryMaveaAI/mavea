// Test and CI results: pass/fail/skip rows with a summary line and optional footer.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { ChecksProps, CheckStatus } from '../data/conversation';

type Props = ChecksProps & { delay?: number };

const icon: Record<CheckStatus, (typeof Icon)[keyof typeof Icon]> = {
  pass: Icon.check,
  fail: Icon.x,
  skip: Icon.clock,
};

export function Checks({ title = 'Tests after the change', summary, items, footer, delay }: Props) {
  // The first failing check is the flagged emphasis — Mavéa's gesture circles its icon.
  const firstFail = items.findIndex((it) => it.status === 'fail');
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.proof className="ic" style={{ color: 'var(--insight)' }} /> {title}
      </div>
      {summary && <div className="checks-summary">{summary}</div>}
      <div className="checks-list">
        {items.map((it, i) => {
          const Ic = icon[it.status] || Icon.check;
          return (
            <div className={'check2-row ' + it.status} key={i}>
              <span className="check2-ic" data-mark={i === firstFail ? 'circle' : undefined}>
                <Ic />
              </span>
              <span className="check2-name mono">{it.name}</span>
              {it.note && <span className="check2-note">{it.note}</span>}
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

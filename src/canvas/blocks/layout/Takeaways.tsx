import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TakeawaysProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TakeawaysProps & { delay?: number };

export function Takeaways({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  heading,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  // click a takeaway to "check it off"; default none checked so it reads clean revealed
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const pct = items.length ? Math.round((done.size / items.length) * 100) : 0;

  return (
    <div
      className="card reveal lay-ta"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {heading && <div className="lay-ta-heading">{heading}</div>}

      <ol className="lay-ta-list">
        {items.map((it, i) => {
          const color = it.color || 'var(--presence)';
          const checked = done.has(i);
          return (
            <li key={i} className={`lay-ta-item ${checked ? 'done' : ''}`}>
              <button
                type="button"
                className="lay-ta-num"
                style={{ ['--tc' as string]: color } as CSSProperties}
                onClick={() => toggle(i)}
                aria-pressed={checked}
              >
                {checked ? <Icon.check className="ic" /> : <span className="tab-num">{i + 1}</span>}
              </button>
              <div className="lay-ta-body">
                <span className="lay-ta-text" dangerouslySetInnerHTML={richInnerHtml(it.text)} />
                {it.detail && (
                  <span
                    className="lay-ta-detail faint"
                    dangerouslySetInnerHTML={richInnerHtml(it.detail)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="lay-ta-foot">
        <div className="lay-ta-track">
          <span className="lay-ta-fill" style={{ width: pct + '%' }} />
        </div>
        <span className="lay-ta-pct tab-num faint">
          {done.size}/{items.length}
        </span>
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

// Labelled horizontal bars for a category breakdown, with optional row tags.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { BreakdownProps } from '../data/conversation';

type Props = BreakdownProps & { delay?: number };

export function BreakdownCard({
  title,
  icon = 'table',
  iconColor = 'var(--insight)',
  rows,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  // The row the breakdown itself calls out — the flagged one, else the widest bar; Mavéa's
  // drawn gesture circles whatever carries data-mark.
  const salient = (() => {
    const hot = rows.findIndex((r) => r.hot);
    if (hot >= 0) return hot;
    let top = 0;
    rows.forEach((r, i) => {
      if (r.pct > rows[top].pct) top = i;
    });
    return top;
  })();
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="cat-list">
        {rows.map((r, ri) => (
          <div className="cat-row" key={r.name}>
            <div className="cat-top">
              <span>
                <span className="cat-name">{r.name}</span>
                {r.tag && (
                  <span
                    className="cat-tag"
                    style={
                      r.tagColor
                        ? {
                            color: r.tagColor,
                            background: 'transparent',
                            border: '1px solid currentColor',
                          }
                        : undefined
                    }
                  >
                    {r.tag}
                  </span>
                )}
              </span>
              <span className="tab-num">{r.val}</span>
            </div>
            <div className="cat-bar">
              <i
                data-mark={ri === salient ? 'circle' : undefined}
                style={{
                  width: r.pct + '%',
                  background: r.hot ? 'var(--warning)' : 'var(--presence)',
                }}
              ></i>
            </div>
          </div>
        ))}
      </div>
      {conf && (
        <div className="card-foot">
          <div className="card-foot-l" />
          <ConfidenceBadge level={conf} title={CONF_TITLE_UNVERIFIED} />
        </div>
      )}
    </div>
  );
}

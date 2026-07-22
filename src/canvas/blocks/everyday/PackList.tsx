import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PackListProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PackListProps & { delay?: number };

// A category-grouped packing checklist. The per-group and overall "packed / total" meters are
// computed from each item's `packed` flag — never hardcoded — so the progress always reflects the
// real list. The trip context (duration, weather) heads the card; counted items render as "3×".
export function PackList({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  context,
  groups,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;

  // Overall progress is the sum across every group's items, derived once from the data.
  const allItems = groups.flatMap((g) => g.items);
  const total = allItems.length;
  const packed = allItems.filter((it) => it.packed).length;
  const overallPct = total > 0 ? (packed / total) * 100 : 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="pl-caption">{caption}</div>}

      <div className="pl-overall">
        {context && <span className="pl-context">{context}</span>}
        <span className="pl-overall-count">
          {packed} / {total} packed
        </span>
      </div>
      <div className="pl-bar" role="progressbar" aria-valuenow={Math.round(overallPct)}>
        <span className="pl-bar-fill" style={{ width: `${overallPct}%` }} />
      </div>

      <div className="pl-groups">
        {groups.map((g, gi) => {
          const gTotal = g.items.length;
          const gPacked = g.items.filter((it) => it.packed).length;
          const gPct = gTotal > 0 ? (gPacked / gTotal) * 100 : 0;
          return (
            <div key={gi} className="pl-group">
              <div className="pl-group-head">
                <span className="pl-group-name">{g.name}</span>
                <span className="pl-group-count">
                  {gPacked}/{gTotal}
                </span>
              </div>
              <div className="pl-group-bar">
                <span className="pl-group-bar-fill" style={{ width: `${gPct}%` }} />
              </div>
              <ul className="pl-items">
                {g.items.map((it, ii) => (
                  <li key={ii} className={`pl-item${it.packed ? ' packed' : ''}`}>
                    <span className="pl-check" aria-hidden>
                      {it.packed ? <Icon.check className="ic" /> : null}
                    </span>
                    <span className="pl-item-label">{it.label}</span>
                    {it.count !== undefined && it.count > 1 && (
                      <span className="pl-item-count">{it.count}×</span>
                    )}
                  </li>
                ))}
              </ul>
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

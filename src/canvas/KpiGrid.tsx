// A grid of big-number stats, each a value over a label with an optional
// accent color. Column count is configurable; without an explicit count the
// grid balances itself to the data.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { KpiGridProps } from '../data/conversation';

type Props = KpiGridProps & { delay?: number };

/** Columns that leave no orphan when the author didn't pin a count: three stats read as one
 *  row of three (a lone orphan under a 2×2 hole looked broken), four as a clean 2×2, and
 *  anything longer wraps at three. */
function balancedCols(count: number): number {
  if (count === 4) return 2;
  return Math.min(Math.max(count, 1), 3);
}

/** Characters in the longest run a line cannot break inside — a whole figure, or a label's
 *  longest word. At least 1, so the CSS never divides by zero. */
function longestRun(text: string): number {
  return Math.max(1, ...text.split(/\s+/).map((w) => [...w].length));
}

export function KpiGrid({
  title,
  icon = 'spark',
  iconColor = 'var(--insight)',
  cols,
  kpis,
  footer,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  return (
    <div
      className="card reveal kpi-card"
      style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div
        className="kpi-grid"
        style={{ '--kpi-cols': cols ?? balancedCols(kpis.length) } as CSSProperties}
      >
        {kpis.map((k, i) => {
          const val = String(k.val);
          const whole = !/\s/.test(val.trim());
          return (
            <div
              key={i}
              className="kpi"
              // The longest unbreakable run in each line, so the type can be sized to hold it
              // whole in the tile it gets (the CSS does the fitting — no measuring pass).
              style={
                {
                  '--kpi-val-chars': longestRun(val),
                  '--kpi-label-chars': longestRun(k.label),
                } as CSSProperties
              }
            >
              {/* the lead stat is the one Mavéa's drawn gesture underlines */}
              <div
                className={
                  'kpi-val tab-num' +
                  (val.length > 8 ? ' kpi-val--long' : '') +
                  (whole ? ' kpi-val--whole' : '')
                }
                data-mark={i === 0 ? 'underline' : undefined}
                style={k.color ? { color: k.color } : undefined}
              >
                {k.val}
              </div>
              <div className="kpi-label">{k.label}</div>
              {k.sub && <div className="kpi-sub">{k.sub}</div>}
            </div>
          );
        })}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
      {conf && (
        <div className="card-foot">
          <div className="card-foot-l" />
          <ConfidenceBadge level={conf} title={CONF_TITLE_UNVERIFIED} />
        </div>
      )}
    </div>
  );
}

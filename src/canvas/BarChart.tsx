// Vertical bars with an optional goal line.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { formatValue, withUnit } from './lib/format';
import { spreadOrder, thinLabels } from './lib/thinLabels';
import { observeResize } from './layout/sharedResize';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { BarChartProps } from '../data/conversation';

type Props = BarChartProps & { delay?: number };

export function BarChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence-soft)',
  bars,
  unit = '',
  goal,
  goalLabel,
  footer,
  conf,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const max = Math.max(...bars.map((b) => b.value), goal || 0) * 1.05 || 1; // guard an all-zero set
  // The bar the chart itself calls out — the flagged one, else the tallest. Mavéa's drawn
  // gesture (the live annotation layer) circles whatever carries data-mark.
  const salient = (() => {
    const hot = bars.findIndex((b) => b.hot);
    if (hot >= 0) return hot;
    let top = 0;
    bars.forEach((b, i) => {
      if (b.value > bars[top].value) top = i;
    });
    return top;
  })();
  // A tight glyph unit ($, %, ×, a 1-2 char symbol) reads naturally glued to each value and
  // stays narrow. A longer descriptive unit ("fit score (1-10)") is shown ONCE as an axis
  // caption instead of being repeated over every bar — repeated, its width overran the bar and
  // collided with the neighbouring bars' labels. Per-bar labels then carry only the value.
  const u = unit.trim();
  const tightUnit = u !== '' && (/^[$€£¥₹]/.test(u) || u === '%' || u.length <= 2);
  const axisUnit = tightUnit ? '' : u;
  const values = bars.map(
    (b) => b.label2 || (tightUnit ? withUnit(b.value, unit) : formatValue(b.value)),
  );

  // Every value is drawn when the row has room for it. Past the type floor it does not, and the
  // values would pile onto each other — so the chart draws the ones a reader needs first (the
  // bar it calls out, the smallest, both ends) and as many evenly spaced others as fit, judged
  // on the widths they actually render at. The rest stay in the document, only unpainted.
  const plot = useRef<HTMLDivElement>(null);
  const n = bars.length;
  let low = 0;
  bars.forEach((b, i) => {
    if (b.value < bars[low].value) low = i;
  });
  // The figures themselves, as one key: a new array of the same figures is the same row, and
  // re-measuring it on every parent render would be a layout read for nothing.
  const valuesKey = values.join('\u0000');
  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    const order = spreadOrder(n, [salient, low, 0, n - 1]);
    const thin = (): void => {
      const labels = Array.from(el.querySelectorAll<HTMLElement>('.bar-val'));
      const spans = labels.map((l) => l.getBoundingClientRect());
      // Not laid out (a skipped off-screen card, a collapsed drawer): every box reads zero and
      // would "collide" with every other. Judge the row once it has a size, not before.
      if (spans.some((r) => r.width === 0)) return;
      const card = (el.closest('.card') ?? el).getBoundingClientRect();
      const keep = thinLabels(spans, order, 4, card);
      labels.forEach((l, i) => l.toggleAttribute('data-quiet', !keep.has(i)));
    };
    thin();
    return observeResize(el, thin);
  }, [n, salient, low, valuesKey]);

  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {axisUnit && <div className="bars-unit">{axisUnit}</div>}
      <div className="bars-chart">
        <div className="bars-plot" ref={plot}>
          {goal != null && (
            <div className="bars-goal" style={{ bottom: `${(goal / max) * 100}%` }}>
              <span className="bars-goal-label">{goalLabel || 'Goal'}</span>
            </div>
          )}
          {bars.map((b, i) => {
            const val = values[i];
            return (
              <div className="bar-col" key={i}>
                <div
                  className="bar-fill"
                  data-mark={i === salient ? 'circle' : undefined}
                  style={{
                    height: `${(b.value / max) * 100}%`,
                    background: b.hot ? 'var(--warning)' : b.color || 'var(--presence)',
                  }}
                >
                  <span
                    className="bar-val tab-num"
                    style={{ '--bar-val-chars': val.length } as CSSProperties}
                  >
                    {val}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bars-axis">
          {bars.map((b, i) => (
            <div className="bar-label" key={i}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 14 }}>
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

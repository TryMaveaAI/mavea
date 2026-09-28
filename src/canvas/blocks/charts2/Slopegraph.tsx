import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { withUnit } from '../../lib/format';
import type { SlopegraphProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SlopegraphProps & { delay?: number };

// The slopes' horizontal coordinate span. The SVG stretches to whatever width its column is left
// (preserveAspectRatio="none"), so the number is arbitrary; the gutters live in the stylesheet.
const VIEW_W = 100;

// Nudge label positions apart so values that converge to nearly the same height don't overlap
// (the dots stay on their true y — only the text is spread). Preserves order, stays within [0,hi].
function spreadLabels(ys: number[], minGap: number, hi: number): number[] {
  const order = ys.map((y, idx) => ({ y, idx })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < minGap) out[i] = out[i - 1] + minGap;
  }
  const overflow = out[out.length - 1] - hi;
  if (overflow > 0) {
    for (let i = 0; i < out.length; i++) out[i] -= overflow;
    for (let i = out.length - 2; i >= 0; i--) {
      if (out[i + 1] - out[i] < minGap) out[i] = out[i + 1] - minGap;
    }
  }
  const res: number[] = [];
  order.forEach((o, k) => (res[o.idx] = Math.max(0, out[k])));
  return res;
}

export function Slopegraph({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  beforeLabel = 'Before',
  afterLabel = 'After',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const all = rows.flatMap((r) => [r.before, r.after]);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);

  // The row with the largest absolute change is the headline movement.
  const salient = rows.reduce(
    (best, r, i) =>
      Math.abs(r.after - r.before) > Math.abs(rows[best].after - rows[best].before) ? i : best,
    0,
  );
  const range = max - min || 1;
  // Height scales with row count instead of a fixed 200px — a fixed height packed each row's
  // label pair into an ever-shrinking slice as rows grew, degrading into illegible overlap well
  // before spreadLabels' min-gap nudging could compensate.
  const ROW_H = 34;
  const padY = 14;
  const H = Math.max(200, rows.length * ROW_H + padY * 2);
  const y = (v: number) => padY + (1 - (v - min) / range) * (H - padY * 2);
  // Spread the value labels so converging lines' numbers don't overlap (dots stay on true y).
  const leftLabelY = spreadLabels(
    rows.map((r) => y(r.before)),
    17,
    H,
  );
  const pct = (v: number) => `${(v / H) * 100}%`;
  const rightLabelY = spreadLabels(
    rows.map((r) => y(r.after)),
    17,
    H,
  );

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-slope-head">
        <span className="faint">{beforeLabel}</span>
        <span className="faint">{afterLabel}</span>
      </div>
      {/* Three columns: row names + start values, the slopes, end values. The label columns are
          sized by their own text (capped in the stylesheet), so a value carrying a unit, "2.5
          hours" rather than "2.5", widens its gutter instead of running over the dots or past
          the card. The dots are HTML so they stay round while the SVG stretches to its column. */}
      <div className="c2-slope" style={{ height: H }} onMouseLeave={() => setHot(null)}>
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${VIEW_W} ${H}`}
          preserveAspectRatio="none"
          className="c2-slope-svg"
        >
          <line x1="0" y1="0" x2="0" y2={H} className="c2-slope-rule" />
          <line x1={VIEW_W} y1="0" x2={VIEW_W} y2={H} className="c2-slope-rule" />
          {rows.map((r, i) => {
            const active = hot === i;
            const dim = hot !== null && !active;
            return (
              <line
                key={i}
                x1="0"
                y1={y(r.before)}
                x2={VIEW_W}
                y2={y(r.after)}
                stroke={r.color || 'var(--presence)'}
                strokeWidth={active ? 3 : 2}
                vectorEffect="non-scaling-stroke"
                style={{ opacity: dim ? 0.18 : 1, transition: 'opacity var(--m-fast)' }}
              />
            );
          })}
        </svg>
        {rows.map((r, i) => {
          const col = r.color || 'var(--presence)';
          const active = hot === i;
          const dim = hot !== null && !active;
          const up = r.after >= r.before;
          return (
            <Fragment key={i}>
              <span
                className={`c2-slope-dot l${active ? ' on' : ''}`}
                style={{ top: pct(y(r.before)), background: col, opacity: dim ? 0.18 : 1 }}
                aria-hidden="true"
              />
              <span
                className={`c2-slope-dot r${active ? ' on' : ''}`}
                style={{ top: pct(y(r.after)), background: col, opacity: dim ? 0.18 : 1 }}
                data-mark={i === salient ? 'point' : undefined}
                aria-hidden="true"
              />
              <div
                className="c2-slope-lbl l"
                style={{ top: pct(leftLabelY[i]), opacity: dim ? 0.25 : 1 }}
                onMouseEnter={() => setHot(i)}
              >
                <span className="c2-slope-name">{r.label}</span>
                <span className="tab-num mono">{withUnit(r.before, unit)}</span>
              </div>
              <div
                className="c2-slope-lbl r"
                style={{ top: pct(rightLabelY[i]), opacity: dim ? 0.25 : 1 }}
                onMouseEnter={() => setHot(i)}
              >
                <span
                  className="tab-num mono"
                  style={{ color: up ? 'var(--insight)' : 'var(--danger)' }}
                >
                  {withUnit(r.after, unit)}
                </span>
              </div>
            </Fragment>
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

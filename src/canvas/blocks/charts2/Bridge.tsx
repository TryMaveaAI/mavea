import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { withUnit } from '../../lib/format';
import type { BridgeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BridgeProps & { delay?: number };

// A waterfall BRIDGE: it reconciles a start value to an end value through a sequence of signed
// contributions, each drawn as a floating bar that spans only from the running total before the step
// to the running total after it — so the eye reads how every +/- moved the number. Start and end are
// full anchored bars; positives take one accent, negatives another. For "why did X change" (revenue,
// cost, headcount, a score) where the magnitude AND direction of each driver must be visible.
export function Bridge({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  start,
  end,
  steps,
  unit,
  prefix,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  // A row per node: the start anchor, each contribution, then the end anchor. We carry the running
  // total before/after every step so a bar can float between them, and pick a shared domain across
  // ALL running totals (and 0) so the staircase never clips and zero is honoured when in range.
  const { rows, domain } = useMemo(() => {
    const list = steps ?? [];
    let running = start;
    const totals: number[] = [start];
    const built = list.map((s, i) => {
      const before = running;
      running += s.delta;
      totals.push(running);
      return {
        kind: 'step' as const,
        idx: i,
        label: s.label,
        delta: s.delta,
        before,
        after: running,
        pos: s.delta >= 0,
      };
    });
    totals.push(end);
    const lo = Math.min(0, ...totals);
    const hi = Math.max(0, ...totals);
    const span = hi - lo || 1;
    return {
      rows: built,
      domain: { lo, hi, span },
    };
  }, [start, end, steps]);

  // Map a value in data space to a 0–100% position along the track.
  const at = (v: number) => ((v - domain.lo) / domain.span) * 100;
  const fmt = (v: number) => withUnit(v, unit ?? prefix);
  const fmtDelta = (v: number) => (v >= 0 ? '+' : '−') + withUnit(Math.abs(v), unit ?? prefix);

  // The largest-magnitude contribution is the headline driver of the change — worth surfacing.
  const driver = rows.reduce(
    (best, r) => (Math.abs(r.delta) > Math.abs(rows[best]?.delta ?? -Infinity) ? r.idx : best),
    rows.length ? 0 : -1,
  );

  const POS = 'var(--insight)';
  const NEG = 'var(--danger)';

  // One anchor row (start / end): a full bar from the zero baseline to its value, rendered bold.
  const anchor = (label: string, value: number, edge: 'start' | 'end') => {
    const base = at(0);
    const v = at(value);
    const left = Math.min(base, v);
    const width = Math.abs(v - base);
    return (
      <div className="br-row br-row--anchor" key={edge}>
        <div className="br-label">{label}</div>
        <div className="br-track">
          <div
            className="br-bar br-bar--anchor"
            style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }}
          />
        </div>
        <div className="br-val tab-num mono">{fmt(value)}</div>
      </div>
    );
  };

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="br-wrap" onMouseLeave={() => setHot(null)}>
        {anchor('Start', start, 'start')}

        {rows.map((r) => {
          const a = at(r.before);
          const b = at(r.after);
          const left = Math.min(a, b);
          const width = Math.abs(b - a);
          const col = r.pos ? POS : NEG;
          const active = hot === r.idx;
          // Anchor the floating tooltip to the step's leading edge, kept inside the track.
          const tipLeft = Math.min(Math.max(r.pos ? b : a, 8), 92);
          return (
            <div
              className={
                'br-row' + (active ? ' on' : '') + (r.idx === driver ? ' br-row--driver' : '')
              }
              key={r.idx}
              onMouseEnter={() => setHot(r.idx)}
            >
              <div className="br-label">{r.label}</div>
              <div className="br-track">
                <div
                  className="br-bar"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.6)}%`,
                    background: col,
                  }}
                  data-mark={r.idx === driver ? 'point' : undefined}
                />
                {active && (
                  <div className="br-tip" style={{ left: `${tipLeft}%` }}>
                    <span className="tab-num mono" style={{ color: col }}>
                      {fmtDelta(r.delta)}
                    </span>
                    <span className="br-tip-run faint">to {fmt(r.after)}</span>
                  </div>
                )}
              </div>
              <div className="br-val tab-num mono" style={{ color: col }}>
                {fmtDelta(r.delta)}
              </div>
            </div>
          );
        })}

        {anchor('End', end, 'end')}
      </div>

      <div className="br-legend">
        <span className="br-leg">
          <i className="br-swatch" style={{ background: POS }} /> increase
        </span>
        <span className="br-leg">
          <i className="br-swatch" style={{ background: NEG }} /> decrease
        </span>
        <span className="br-leg br-leg--net tab-num mono">net {fmtDelta(end - start)}</span>
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

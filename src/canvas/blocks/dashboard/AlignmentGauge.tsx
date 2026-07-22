// AlignmentGauge — one radial answering "is my reasoning still holding?". When pct is null the dial
// is empty and the center reads "—" with "awaiting your data": real-data-only means we never draw a
// fabricated alignment number. The progress ring is a real arc `<path>` (not a dasharray-clipped
// circle) so usePathDraw can measure its true length and sweep it in on mount/value-change.
import { useRef, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { usePathDraw } from '../../lib';
import type { AlignmentGaugeProps } from './types';

type Props = AlignmentGaugeProps & { delay?: number };

const R = 46;
const CX = 60;
const CY = 60;

/** Point on the gauge ring at `angle` radians, where 0 = 3 o'clock and angle increases clockwise
 *  (SVG's y-down convention) — the frame the arc-path math below is built on. */
function pointOnRing(angle: number) {
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

/** The visible progress ring as a real arc path, swept clockwise from the top (12 o'clock) —
 *  `getTotalLength()` on this is the arc's actual length, so usePathDraw draws exactly the
 *  filled portion rather than the whole circle. Null below/at 0% (nothing to draw). A `frac` of
 *  1 makes the SVG arc command's start/end points coincide, which the spec defines as "omit the
 *  arc entirely" — capped just under a full turn so a 100% gauge still draws a (visually
 *  indistinguishable) near-complete ring instead of vanishing. */
function progressArc(frac: number): string | null {
  if (frac <= 0) return null;
  const swept = Math.min(frac, 0.9998);
  const start = -Math.PI / 2;
  const end = start + swept * 2 * Math.PI;
  const from = pointOnRing(start);
  const to = pointOnRing(end);
  const largeArc = swept > 0.5 ? 1 : 0;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/** The arc lives in its own component so its `key` (the path's own `d`) can force a fresh mount —
 *  and so a fresh usePathDraw measurement — whenever the swept value actually changes, not just
 *  whenever the parent re-renders. That gives a live-updating gauge a deliberate re-sweep to its
 *  new value instead of either a frozen stale draw-length or an unanimated snap. */
function GaugeArc({ d, color, delay }: { d: string; color: string; delay?: number }) {
  const ref = useRef<SVGPathElement>(null);
  usePathDraw(ref, { delay });
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="9"
      strokeLinecap="round"
      className="dash-gauge-arc"
    />
  );
}

export function AlignmentGauge({
  title = 'Thesis alignment',
  icon = 'shield',
  iconColor = 'var(--insight)',
  pct,
  band,
  note,
  color = 'var(--insight)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const has = pct !== null && Number.isFinite(pct);
  const frac = has ? Math.max(0, Math.min(100, pct)) / 100 : 0;
  const d = progressArc(frac);

  return (
    <div
      className="card reveal dash-gauge"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dash-gauge-body">
        <div className="dash-gauge-ring">
          <svg viewBox="0 0 120 120" className="dash-gauge-svg" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth="9" />
            {d && <GaugeArc key={d} d={d} color={color} delay={delay} />}
          </svg>
          <div className="dash-gauge-center">
            <div
              className="dash-gauge-pct tab-num"
              style={{ color: has ? color : 'var(--text-muted)' }}
            >
              {has ? `${Math.round(pct)}%` : '—'}
            </div>
          </div>
        </div>

        <div className="dash-gauge-side">
          {has ? (
            <>
              {band && <div className="dash-gauge-band">{band}</div>}
              {note && <div className="dash-gauge-note">{note}</div>}
            </>
          ) : (
            <div className="dash-gauge-note faint">Awaiting your data</div>
          )}
        </div>
      </div>

      {footer && <div className="dash-foot">{footer}</div>}
    </div>
  );
}

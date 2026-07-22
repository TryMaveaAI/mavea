// A/B test experiment readout — Statpair's paired-tile layout applied to a control/variant
// split, plus the two things an experiment readout actually needs on top of that: a computed
// lift and, only when the caller supplies the inferential-statistics numbers, a significance
// read. Nothing here is invented — the p-value, the CI bounds, and the significance call all
// come straight from the caller (see AbtestresultProps in types.ts); the only arithmetic this
// component does itself is the lift %, the same kind of caller-data derivation Statpair already
// does for its ratio.
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Icon } from '../../../icons/icons';
import { useCountUp } from '../../lib/motion';
import type { AbtestresultProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AbtestresultProps & { delay?: number };

/** Adaptive percentage formatting so a small rate (0.3%) doesn't round away to "0%" while a
 *  large one (61%) doesn't carry noisy decimals. */
function fmtRate(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  const v = rate * 100;
  const abs = Math.abs(v);
  const decimals = abs === 0 ? 0 : abs < 1 ? 2 : abs < 10 ? 1 : 0;
  return `${v.toFixed(decimals)}%`;
}

function fmtN(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** APA-style p-value text: "p < .001" for tiny values, "p = .043" otherwise. */
function fmtP(p: number): string {
  if (p < 0.001) return 'p < .001';
  return `p = ${p.toFixed(3).replace(/^0\./, '.')}`;
}

/** Lays [low, high, 0, point] onto a padded 0–100% track so the whisker, the zero-effect
 *  reference tick, and the point estimate all land at their true relative position — the same
 *  "domain from the real values, never a hand-placed guess" approach as charts2/ErrorBars. */
function ciLayout(low: number, high: number, point: number | null) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const vals = [lo, hi, 0, ...(point !== null && Number.isFinite(point) ? [point] : [])];
  const spanMin = Math.min(...vals);
  const spanMax = Math.max(...vals);
  const pad = Math.max((spanMax - spanMin) * 0.14, 0.5);
  const domainMin = spanMin - pad;
  const domainMax = spanMax + pad;
  const span = domainMax - domainMin || 1;
  const toPct = (v: number) => ((v - domainMin) / span) * 100;
  return {
    loPct: toPct(lo),
    hiPct: toPct(hi),
    zeroPct: toPct(0),
    pointPct: point !== null && Number.isFinite(point) ? toPct(point) : null,
  };
}

export function AbTestResult({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  control,
  variant,
  pValue,
  confidenceInterval,
  significant,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<'control' | 'variant' | null>(null);

  const rawLift =
    control.conversionRate > 0
      ? ((variant.conversionRate - control.conversionRate) / control.conversionRate) * 100
      : NaN;
  const liftKnown = Number.isFinite(rawLift);
  const liftText = useCountUp(liftKnown ? rawLift : 0, {
    delay: (delay || 0) + 260,
    format: fmtSigned,
  });
  const liftColor = !liftKnown
    ? 'var(--text-muted)'
    : rawLift > 0
      ? 'var(--insight)'
      : rawLift < 0
        ? 'var(--danger)'
        : 'var(--text-muted)';

  // Significance: an explicit call always wins; otherwise fall back to a plain p<0.05 read of
  // the caller's own p-value. Neither given → no badge, never a guessed one.
  const hasExplicitSig = typeof significant === 'boolean';
  const hasP = typeof pValue === 'number' && Number.isFinite(pValue);
  const sigResolved = hasExplicitSig
    ? (significant as boolean)
    : hasP
      ? (pValue as number) < 0.05
      : null;
  const showBadge = hasExplicitSig || hasP;

  const ci =
    confidenceInterval && confidenceInterval.length === 2
      ? ciLayout(confidenceInterval[0], confidenceInterval[1], liftKnown ? rawLift : null)
      : null;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {showBadge && (
        <div className="abt-head">
          <span className={`abt-badge m-scale-in ${sigResolved ? 'on' : ''}`}>
            {sigResolved && <Icon.check className="ic abt-badge-ic" />}
            {sigResolved ? 'Significant' : 'Not significant'}
            {hasP && <span className="abt-badge-p">{fmtP(pValue as number)}</span>}
          </span>
        </div>
      )}

      <div className="abt-row">
        <div
          className={`abt-side m-fade-rise m-stagger-item ${hot === 'control' ? 'on' : ''}`}
          style={{ ['--i' as string]: 0 } as CSSProperties}
          onMouseEnter={() => setHot('control')}
          onMouseLeave={() => setHot(null)}
        >
          <div className="abt-name">{control.name}</div>
          <div className="abt-val tab-num">{fmtRate(control.conversionRate)}</div>
          <div className="abt-n faint">n = {fmtN(control.n)}</div>
        </div>

        <div className="abt-connector">
          <span className="abt-arrow">→</span>
        </div>

        <div
          className={`abt-side m-fade-rise m-stagger-item ${hot === 'variant' ? 'on' : ''}`}
          style={{ ['--i' as string]: 1 } as CSSProperties}
          onMouseEnter={() => setHot('variant')}
          onMouseLeave={() => setHot(null)}
        >
          <div className="abt-name">{variant.name}</div>
          <div className="abt-val tab-num" style={{ color: liftColor }}>
            {fmtRate(variant.conversionRate)}
          </div>
          <div className="abt-n faint">n = {fmtN(variant.n)}</div>
        </div>
      </div>

      <div
        className="abt-lift m-fade-rise m-stagger-item"
        style={{ ['--i' as string]: 2 } as CSSProperties}
      >
        <span className="abt-lift-v tab-num" style={{ color: liftColor }} data-mark="underline">
          {liftKnown ? liftText : '—'}
        </span>
        <span className="abt-lift-l faint">relative lift</span>
      </div>

      {ci && confidenceInterval && (
        <div
          className="abt-ci m-fade-rise m-stagger-item"
          style={{ ['--i' as string]: 3 } as CSSProperties}
        >
          <span className="abt-ci-lbl faint">95% confidence interval</span>
          <div className="abt-ci-track">
            <span
              className="abt-ci-band"
              style={{
                left: `${ci.loPct}%`,
                width: `${Math.max(ci.hiPct - ci.loPct, 1.5)}%`,
              }}
            />
            <span className="abt-ci-zero" style={{ left: `${ci.zeroPct}%` }} title="no effect" />
            {ci.pointPct !== null && (
              <span className="abt-ci-point" style={{ left: `${ci.pointPct}%` }} />
            )}
          </div>
          <div className="abt-ci-labels">
            <span className="tab-num">{fmtSigned(confidenceInterval[0])}</span>
            <span className="tab-num">{fmtSigned(confidenceInterval[1])}</span>
          </div>
        </div>
      )}

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

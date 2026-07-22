import { type CSSProperties, useMemo, useState } from 'react';
import { Icon } from '../../../icons/icons';
import { safeEval } from './expr';
import type { LiveComputeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LiveComputeProps & { delay?: number };

function fmt(n: number, decimals: number): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// A sensible slider step when none is given, scaled to the range so the lever feels smooth.
function stepFor(min: number, max: number, step?: number): number {
  if (typeof step === 'number' && step > 0) return step;
  const span = Math.abs(max - min) || 1;
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  if (span <= 200) return 1;
  return Math.max(1, Math.round(span / 200));
}

// A stateful what-if: drag the levers and one honest projected number updates live. The output is a
// TRANSPARENT formula over the inputs, evaluated safely (never eval); it shows "—" rather than a
// wrong number if the formula can't resolve, and carries an "estimate" caveat — it never invents
// data, it just recomputes what you set.
export function LiveCompute({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  inputs,
  formula,
  output,
  caveat,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;
  const defs = useMemo(() => inputs ?? [], [inputs]);
  const [vals, setVals] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const d of defs) m[d.key] = typeof d.value === 'number' ? d.value : d.min;
    return m;
  });

  const result = useMemo(() => safeEval(formula || '', vals), [formula, vals]);
  const dec = output?.decimals ?? 0;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lc-output">
        <span className="lc-out-label">{output?.label}</span>
        <span className="lc-out-val">
          {output?.prefix || ''}
          {fmt(result, dec)}
          {output?.unit ? <span className="lc-out-unit"> {output.unit}</span> : null}
        </span>
      </div>

      <div className="lc-levers">
        {defs.map((d) => {
          const cur = vals[d.key] ?? d.min;
          return (
            <div key={d.key} className="lc-lever">
              <div className="lc-lever-top">
                <span className="lc-lever-label">{d.label}</span>
                <span className="lc-lever-val">
                  {d.prefix || ''}
                  {fmt(cur, cur % 1 === 0 ? 0 : 2)}
                  {d.unit ? ` ${d.unit}` : ''}
                </span>
              </div>
              <input
                type="range"
                className="lc-range"
                min={d.min}
                max={d.max}
                step={stepFor(d.min, d.max, d.step)}
                value={cur}
                aria-label={d.label}
                onChange={(e) => setVals((v) => ({ ...v, [d.key]: Number(e.target.value) }))}
              />
            </div>
          );
        })}
      </div>

      {caveat && (
        <div className="lc-caveat">
          <Icon.alert className="ic" /> <span>{caveat}</span>
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

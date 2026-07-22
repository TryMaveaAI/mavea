import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib/format';
import type { LabPanelProps, LabResult } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = LabPanelProps & { delay?: number };

/** Classify a value against its reference interval. */
function flag(r: LabResult): 'low' | 'high' | 'ok' {
  if (r.value < r.low) return 'low';
  if (r.value > r.high) return 'high';
  return 'ok';
}

export function LabPanel({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  results,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  // Salient: the first out-of-range result demands attention above all others.
  const salient = results.findIndex((r) => flag(r) !== 'ok');

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {caption && <div className="tb-lab-cap">{caption}</div>}

      <div className="tb-lab">
        {results.map((r, i) => {
          const f = flag(r);
          // Position the value marker within a padded reference window so out-of-range still shows.
          const span = r.high - r.low || 1;
          const pad = span * 0.4;
          const lo = r.low - pad;
          const hi = r.high + pad;
          const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
          const trend = r.prior != null ? Math.sign(r.value - r.prior) : 0;
          return (
            <div key={i} className={'tb-lab-row flag-' + f}>
              <div className="tb-lab-name">{r.name}</div>
              <div
                className="tb-lab-val tab-num"
                data-mark={i === salient ? 'underline' : undefined}
              >
                {formatValue(r.value, { unit: r.unit })}
                {trend !== 0 && (
                  <Icon.arrowUp
                    className="tb-lab-trend"
                    style={{ transform: trend < 0 ? 'rotate(180deg)' : 'none' }}
                  />
                )}
              </div>
              <div className="tb-lab-track">
                {/* the in-range band */}
                <span
                  className="tb-lab-band"
                  style={{ left: `${pct(r.low)}%`, width: `${pct(r.high) - pct(r.low)}%` }}
                />
                {/* the value marker */}
                <span className="tb-lab-mark" style={{ left: `${pct(r.value)}%` }} />
              </div>
              <div className="tb-lab-ref tab-num">
                {formatValue(r.low)}–{formatValue(r.high)}
              </div>
              <div className="tb-lab-flag">{f === 'high' ? 'High' : f === 'low' ? 'Low' : ''}</div>
            </div>
          );
        })}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

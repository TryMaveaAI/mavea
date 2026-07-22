import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DeltacascadeProps, CascadeStep } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DeltacascadeProps & { delay?: number };

export function Deltacascade({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  prefix = '',
  suffix = '',
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<number | null>(null);

  // running totals; baseline & total are absolute, others accumulate
  let running = 0;
  const rows = steps.map((s: CascadeStep) => {
    if (s.isBase) running = s.delta;
    else if (s.isTotal) running = s.delta;
    else running += s.delta;
    return { ...s, running };
  });
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.running)), 1);
  const fmt = (n: number) => prefix + n.toLocaleString() + suffix;
  // the isTotal row is the culminating result Mavéa's drawn gesture underlines;
  // fall back to the last row when no explicit total is marked
  const salient = (() => {
    const ti = rows.findIndex((r) => r.isTotal);
    return ti >= 0 ? ti : rows.length - 1;
  })();

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dc-list">
        {rows.map((r, i) => {
          const pos = r.delta >= 0;
          const accent =
            r.isBase || r.isTotal ? 'var(--presence)' : pos ? 'var(--insight)' : 'var(--danger)';
          const w = (Math.abs(r.running) / maxAbs) * 100;
          const on = hover === i;
          return (
            <div
              key={i}
              className={`dc-step ${r.isBase ? 'base' : ''} ${r.isTotal ? 'total' : ''} ${on ? 'on' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="dc-step-head">
                <span className="dc-step-label">{r.label}</span>
                <span
                  className="dc-step-delta tab-num"
                  data-mark={i === salient ? 'underline' : undefined}
                  style={{ color: accent }}
                >
                  {r.isBase || r.isTotal ? fmt(r.running) : (pos ? '+' : '') + fmt(r.delta)}
                </span>
              </div>
              <div className="dc-step-track">
                <span className="dc-step-fill" style={{ width: w + '%', background: accent }} />
              </div>
              {!r.isTotal && <div className="dc-run faint tab-num">→ {fmt(r.running)}</div>}
              {r.detail && (
                <div
                  className="dc-detail"
                  data-open={on}
                  dangerouslySetInnerHTML={richInnerHtml(r.detail)}
                />
              )}
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

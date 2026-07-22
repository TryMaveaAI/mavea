import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { FactcheckProps, Verdict } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FactcheckProps & { delay?: number };

const VERDICT: Record<Verdict, { c: string; label: string; icon: keyof typeof Icon }> = {
  true: { c: 'var(--insight)', label: 'Verified', icon: 'check' },
  partly: { c: 'var(--warning)', label: 'Partly true', icon: 'alert' },
  false: { c: 'var(--danger)', label: 'False', icon: 'x' },
  unverified: { c: 'var(--text-muted)', label: 'Unverified', icon: 'eyeOff' },
};

export function Factcheck({
  title,
  icon = 'proof',
  iconColor = 'var(--insight)',
  claims,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;
  // first claim expanded by default
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fc-list">
        {claims.map((cl, i) => {
          const v = VERDICT[cl.verdict];
          const Vi = Icon[v.icon];
          const on = open === i;
          return (
            <div
              key={i}
              className={`fc-item ${on ? 'on' : ''}`}
              style={{ ['--vc' as string]: v.c } as CSSProperties}
            >
              <button className="fc-head" onClick={() => setOpen(on ? null : i)}>
                <span className="fc-verdict" style={{ color: v.c }}>
                  <Vi className="fc-verdict-ic" />
                </span>
                <span className="fc-claim" dangerouslySetInnerHTML={richInnerHtml(cl.claim)} />
                <span className="fc-conf tab-num" style={{ color: v.c }}>
                  {Math.round(cl.confidence)}%
                </span>
                <Icon.chevR className={`fc-chev ${on ? 'open' : ''}`} />
              </button>
              <div className="fc-bar">
                <span
                  className="fc-bar-fill"
                  style={{ width: cl.confidence + '%', background: v.c }}
                />
              </div>
              <div className="fc-detail" data-open={on}>
                {on && (
                  <div className="fc-detail-in">
                    <span
                      className="fc-tag"
                      style={{ color: v.c, ['--vc' as string]: v.c } as CSSProperties}
                    >
                      {v.label}
                    </span>
                    {cl.detail && (
                      <div className="fc-expl" dangerouslySetInnerHTML={richInnerHtml(cl.detail)} />
                    )}
                    {cl.sources && cl.sources.length > 0 && (
                      <div className="fc-sources">
                        {cl.sources.map((s, k) => (
                          <span key={k} className="fc-source mono">
                            <Icon.globe className="fc-source-ic" /> {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

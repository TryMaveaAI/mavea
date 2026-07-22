import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TokenStreamProps, StreamToken } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TokenStreamProps & { delay?: number };

// confidence → token tint color (red low → amber mid → green high)
function heatColor(p: number): string {
  if (p >= 0.85) return 'var(--insight)';
  if (p >= 0.6) return 'var(--presence)';
  if (p >= 0.4) return 'var(--warning)';
  return 'var(--danger)';
}

export function TokenStream({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  prefix,
  tokens,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const [hover, setHover] = useState<number | null>(null);

  const active: StreamToken | null = hover != null ? tokens[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-ts-stream">
        {prefix && <span className="ai-ts-prefix">{prefix}</span>}
        {tokens.map((t, i) => {
          const c = heatColor(t.p);
          const on = hover === i;
          return (
            <span
              key={i}
              className={'ai-ts-tok' + (on ? ' is-on' : '')}
              style={
                {
                  ['--c' as string]: c,
                  ['--a' as string]: String(0.1 + t.p * 0.32),
                } as CSSProperties
              }
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {t.text}
            </span>
          );
        })}
      </div>

      <div className="ai-ts-readout">
        {active ? (
          <div className="ai-ts-pop">
            <div className="ai-ts-pop-head">
              <span className="ai-ts-pop-tok mono">{active.text.trim() || '␣'}</span>
              <span className="ai-ts-pop-p tab-num" style={{ color: heatColor(active.p) }}>
                {(active.p * 100).toFixed(1)}%
              </span>
            </div>
            <div className="ai-ts-bar">
              <span style={{ width: `${active.p * 100}%`, background: heatColor(active.p) }} />
            </div>
            {active.alts && active.alts.length > 0 && (
              <div className="ai-ts-alts">
                <span className="faint">alternatives</span>
                {active.alts.map((a, ai) => (
                  <span className="ai-ts-alt" key={ai}>
                    <span className="mono">{a.t.trim() || '␣'}</span>
                    <span className="tab-num faint">{(a.p * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="faint">
            <Icon.eye className="ic" style={{ verticalAlign: '-2px', width: 14, height: 14 }} />{' '}
            Hover a token to see its probability and top alternatives
          </span>
        )}
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

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StatpairProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StatpairProps & { delay?: number };

export function Statpair({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  left,
  right,
  connector = '→',
  ratioLabel = 'ratio',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [active, setActive] = useState<'left' | 'right' | null>(null);

  const lc = left.color || 'var(--presence)';
  const rc = right.color || 'var(--insight)';
  const total = left.weight + right.weight || 1;
  const ratio = right.weight === 0 ? '—' : (left.weight / right.weight).toFixed(2);
  const pctLeft = (left.weight / total) * 100;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sp-row">
        <div
          className={`sp-side ${active === 'left' ? 'on' : ''}`}
          onMouseEnter={() => setActive('left')}
          onMouseLeave={() => setActive(null)}
        >
          <div className="sp-val tab-num" style={{ color: lc }}>
            {left.value}
          </div>
          <div className="sp-label">{left.label}</div>
          {left.sub && <div className="sp-sub faint">{left.sub}</div>}
        </div>

        <div className="sp-connector">
          <span className="sp-arrow">{connector}</span>
        </div>

        <div
          className={`sp-side right ${active === 'right' ? 'on' : ''}`}
          onMouseEnter={() => setActive('right')}
          onMouseLeave={() => setActive(null)}
        >
          <div className="sp-val tab-num" style={{ color: rc }}>
            {right.value}
          </div>
          <div className="sp-label">{right.label}</div>
          {right.sub && <div className="sp-sub faint">{right.sub}</div>}
        </div>
      </div>

      <div className="sp-bar">
        <span className="sp-bar-l" style={{ width: pctLeft + '%', background: lc }} />
        <span className="sp-bar-r" style={{ width: 100 - pctLeft + '%', background: rc }} />
      </div>

      <div className="sp-ratio">
        {/* the computed ratio synthesises both sides — the one figure Mavéa's drawn gesture underlines */}
        <span className="sp-ratio-v tab-num" data-mark="underline">
          {ratio}
        </span>
        <span className="sp-ratio-l faint">{ratioLabel}</span>
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

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { WaffleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = WaffleProps & { delay?: number };

export function Waffle({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  cats,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hot, setHot] = useState<string | null>(null);

  // assign 100 squares to categories by rounded pct
  const cells = useMemo(() => {
    const out: { cat: string; color: string }[] = [];
    cats.forEach((c) => {
      const n = Math.round(c.pct);
      for (let i = 0; i < n && out.length < 100; i++) out.push({ cat: c.name, color: c.color });
    });
    while (out.length < 100) out.push({ cat: '', color: 'var(--cell-empty)' });
    return out.slice(0, 100);
  }, [cats]);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-waf-wrap">
        <div className="c2-waffle" onMouseLeave={() => setHot(null)}>
          {cells.map((c, i) => {
            const isEmpty = !c.cat;
            const active = hot === c.cat;
            const dim = hot != null && !active && !isEmpty;
            return (
              <span
                key={i}
                className="c2-waf-cell"
                style={{
                  background: isEmpty ? 'var(--cell-empty)' : c.color,
                  opacity: dim ? 0.22 : 1,
                  transform: active ? 'scale(1.12)' : 'none',
                  ['--cd' as string]: i * 6 + 'ms',
                }}
                onMouseEnter={() => !isEmpty && setHot(c.cat)}
              />
            );
          })}
        </div>
        <div className="c2-waf-legend">
          {cats.map((c) => {
            const active = hot === c.name;
            return (
              <button
                key={c.name}
                className={'c2-waf-leg' + (active ? ' on' : '')}
                onMouseEnter={() => setHot(c.name)}
                onMouseLeave={() => setHot(null)}
              >
                <i style={{ background: c.color }} />
                <span className="c2-waf-leg-name">{c.name}</span>
                <span className="tab-num mono c2-waf-leg-pct">{Math.round(c.pct)}%</span>
              </button>
            );
          })}
        </div>
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

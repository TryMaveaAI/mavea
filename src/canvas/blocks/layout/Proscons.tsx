import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProsConsProps, ProsConsItem } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ProsConsProps & { delay?: number };

type Hover = { side: 'pro' | 'con'; i: number } | null;

function Column({
  side,
  label,
  items,
  accent,
  hover,
  setHover,
}: {
  side: 'pro' | 'con';
  label: string;
  items: ProsConsItem[];
  accent: string;
  hover: Hover;
  setHover: (h: Hover) => void;
}) {
  const Mark = side === 'pro' ? Icon.check : Icon.x;
  return (
    <div className="lay-pc-col" style={{ ['--pc' as string]: accent } as CSSProperties}>
      <div className="lay-pc-head">
        <Mark className="ic" style={{ color: accent }} />
        <span>{label}</span>
        <span className="lay-pc-count tab-num">{items.length}</span>
      </div>
      <ul className="lay-pc-list">
        {items.map((it, i) => {
          const on = hover?.side === side && hover.i === i;
          const w = Math.max(1, Math.min(5, it.weight ?? 3));
          return (
            <li
              key={i}
              className={`lay-pc-item ${on ? 'on' : ''}`}
              onMouseEnter={() => setHover({ side, i })}
              onMouseLeave={() => setHover(null)}
            >
              <Mark className="ic lay-pc-mark" style={{ color: accent }} />
              <div className="lay-pc-body">
                <span className="lay-pc-text" dangerouslySetInnerHTML={richInnerHtml(it.text)} />
                <span className="lay-pc-pips" aria-label={`weight ${w} of 5`}>
                  {[0, 1, 2, 3, 4].map((p) => (
                    <span
                      key={p}
                      className={`lay-pc-pip ${p < w ? 'fill' : ''}`}
                      style={{ background: p < w ? accent : undefined }}
                    />
                  ))}
                </span>
                {it.note && on && (
                  <span
                    className="lay-pc-note faint"
                    dangerouslySetInnerHTML={richInnerHtml(it.note)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Proscons({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  prosLabel = 'Pros',
  consLabel = 'Cons',
  pros,
  cons,
  verdict,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<Hover>(null);

  const proW = pros.reduce((s, p) => s + (p.weight ?? 3), 0);
  const conW = cons.reduce((s, c) => s + (c.weight ?? 3), 0);
  const tot = proW + conW || 1;
  const proPct = (proW / tot) * 100;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-pc-grid">
        <Column
          side="pro"
          label={prosLabel}
          items={pros}
          accent="var(--insight)"
          hover={hover}
          setHover={setHover}
        />
        <div className="lay-pc-divider" />
        <Column
          side="con"
          label={consLabel}
          items={cons}
          accent="var(--danger)"
          hover={hover}
          setHover={setHover}
        />
      </div>

      <div className="lay-pc-verdict">
        <div className="lay-pc-vbar">
          <span className="lay-pc-vbar-l" style={{ width: proPct + '%' }} />
          <span className="lay-pc-vbar-r" style={{ width: 100 - proPct + '%' }} />
        </div>
        <div className="lay-pc-vrow">
          <span className="lay-pc-vlabel" style={{ color: 'var(--insight)' }}>
            <span className="tab-num">{proW}</span> for
          </span>
          {verdict ? (
            <span className="lay-pc-vtext" dangerouslySetInnerHTML={richInnerHtml(verdict)} />
          ) : (
            <span className="lay-pc-vtext faint">
              {proPct >= 50 ? 'Leans for' : 'Leans against'}
            </span>
          )}
          <span className="lay-pc-vlabel" style={{ color: 'var(--danger)' }}>
            <span className="tab-num">{conW}</span> against
          </span>
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

import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { RangefilterProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RangefilterProps & { delay?: number };

export function Rangefilter({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  min,
  max,
  step = 1,
  low,
  high,
  prefix = '',
  suffix = '',
  unitLabel = 'results',
  items,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const span = max - min || 1;
  const [lo, setLo] = useState<number>(low != null ? low : min + Math.round(span * 0.15));
  const [hi, setHi] = useState<number>(high != null ? high : max - Math.round(span * 0.1));
  const [active, setActive] = useState<'lo' | 'hi' | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  const valFromX = (cx: number) => {
    const el = trackRef.current;
    if (!el) return lo;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (cx - r.left) / r.width));
    return Math.round((min + ratio * span) / step) * step;
  };

  const grab = (which: 'lo' | 'hi') => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(which);
  };
  const move = (e: RPointerEvent<HTMLElement>) => {
    if (!active) return;
    const v = valFromX(e.clientX);
    if (active === 'lo') setLo(Math.min(v, hi - step, max));
    else setHi(Math.max(v, lo + step, min));
  };
  const release = (e: RPointerEvent<HTMLElement>) => {
    setActive(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const fmt = (n: number) => prefix + n.toLocaleString() + suffix;
  const matches = items.filter((it) => it.value >= lo && it.value <= hi);
  const visible = matches.slice(0, 6);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--rf-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="rf-head">
        <span className="rf-bound tab-num">{fmt(lo)}</span>
        <span className="rf-count">
          {/* the in-range count is the single salient figure Mavéa underlines */}
          <strong className="tab-num" data-mark="underline" style={{ color }}>
            {matches.length}
          </strong>{' '}
          {unitLabel}
        </span>
        <span className="rf-bound tab-num">{fmt(hi)}</span>
      </div>

      <div className="rf-track" ref={trackRef}>
        <span className="rf-sel" style={{ left: loPct + '%', width: hiPct - loPct + '%' }} />
        <button
          type="button"
          className={`rf-handle ${active === 'lo' ? 'drag' : ''}`}
          style={{ left: loPct + '%' }}
          onPointerDown={grab('lo')}
          onPointerMove={move}
          onPointerUp={release}
          aria-label="Minimum"
        />
        <button
          type="button"
          className={`rf-handle ${active === 'hi' ? 'drag' : ''}`}
          style={{ left: hiPct + '%' }}
          onPointerDown={grab('hi')}
          onPointerMove={move}
          onPointerUp={release}
          aria-label="Maximum"
        />
      </div>

      <div className="rf-list">
        {visible.map((it, i) => {
          const p = ((it.value - min) / span) * 100;
          return (
            <div className="rf-item" key={i}>
              <span className="rf-item-bar">
                <span className="rf-item-fill" style={{ width: p + '%' }} />
              </span>
              <span className="rf-item-label">{it.label}</span>
              {it.meta && <span className="rf-item-meta faint">{it.meta}</span>}
              <span className="rf-item-val tab-num">{it.display || fmt(it.value)}</span>
            </div>
          );
        })}
        {matches.length > visible.length && (
          <div className="rf-more faint">+{matches.length - visible.length} more in range</div>
        )}
        {matches.length === 0 && (
          <div className="rf-more faint">No items in this range — widen it.</div>
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

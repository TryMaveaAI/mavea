import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { BeforeAfterProps } from './types';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = BeforeAfterProps & { delay?: number };

export function BeforeAfter({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  before,
  after,
  position = 50,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const [pos, setPos] = useState(Math.max(2, Math.min(98, position)));
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // untrusted model URLs — a rejected plate keeps its gradient, same as a 404
  const beforeSrc = safeBlockImageSrc(before.src);
  const afterSrc = safeBlockImageSrc(after.src);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    setPos(Math.max(2, Math.min(98, p)));
  };
  const onDown = (e: RPointerEvent) => {
    setDrag(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    move(e.clientX);
  };
  const onMove = (e: RPointerEvent) => {
    if (drag) move(e.clientX);
  };
  const onUp = () => setDrag(false);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={'me-ba' + (drag ? ' dragging' : '')}
        ref={ref}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {/* AFTER plate (full, underneath) */}
        <div
          className="me-ba-plate"
          style={{
            background: `linear-gradient(135deg, ${safeCssColor(after.from, 'var(--presence-deep)')}, ${safeCssColor(after.to, 'var(--presence-soft)')})`,
          }}
        >
          {afterSrc && (
            <img
              className="me-img-fill"
              src={afterSrc}
              alt=""
              decoding="async"
              // a 404'd model URL hides itself so the gradient + label show, not a broken icon
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="me-ba-tag right">{after.label}</span>
        </div>
        {/* BEFORE plate clipped to divider */}
        <div
          className="me-ba-plate me-ba-before"
          style={{
            background: `linear-gradient(135deg, ${safeCssColor(before.from, 'var(--presence-deep)')}, ${safeCssColor(before.to, 'var(--presence-soft)')})`,
            clipPath: `inset(0 ${100 - pos}% 0 0)`,
          }}
        >
          {beforeSrc && (
            <img
              className="me-img-fill"
              src={beforeSrc}
              alt=""
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="me-ba-tag left">{before.label}</span>
        </div>

        {/* divider */}
        <div
          className="me-ba-divider"
          style={{ left: pos + '%' }}
          data-interactive
          onPointerDown={onDown}
        >
          <span className="me-ba-handle">
            <Icon.chevR className="me-ba-arrow flip" />
            <Icon.chevR className="me-ba-arrow" />
          </span>
        </div>
      </div>

      <div className="me-ba-caps">
        <span className="faint">{before.caption || 'Before'}</span>
        <span className="tab-num me-ba-pct">{Math.round(pos)}%</span>
        <span className="faint">{after.caption || 'After'}</span>
      </div>

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer || <span className="faint">Drag the divider to wipe between the two versions</span>}
      </div>
    </div>
  );
}

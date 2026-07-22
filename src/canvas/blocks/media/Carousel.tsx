import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { CarouselProps } from './types';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = CarouselProps & { delay?: number };

export function Carousel({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  slides,
  start = 0,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const n = slides.length;
  const [idx, setIdx] = useState(Math.max(0, Math.min(n - 1, start)));
  const [dx, setDx] = useState(0);
  const down = useRef<number | null>(null);

  const go = (i: number) => setIdx(n > 0 ? (i + n) % n : 0);
  const onDown = (e: RPointerEvent) => {
    down.current = e.clientX;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (down.current != null) setDx(e.clientX - down.current);
  };
  const onUp = () => {
    if (Math.abs(dx) > 48) go(idx + (dx < 0 ? 1 : -1));
    down.current = null;
    setDx(0);
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-carousel">
        <div
          className="me-car-track"
          style={{ transform: `translateX(calc(${-idx * 100}% + ${dx}px))` }}
          data-interactive
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {slides.map((s, i) => {
            // untrusted model URL — a rejected src leaves the gradient slide, same as a 404
            const src = safeBlockImageSrc(s.src);
            return (
              <div className="me-car-slide" key={i}>
                <div
                  className="me-car-img"
                  style={{
                    background: `linear-gradient(135deg, ${safeCssColor(s.from, 'var(--presence-deep)')}, ${safeCssColor(s.to, 'var(--presence-soft)')})`,
                  }}
                  // First slide is the authored lead (start prop); circle = visual image tile.
                  {...(i === 0 ? { 'data-mark': 'circle' } : {})}
                >
                  {src && (
                    <img
                      className="me-img-fill"
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      // a 404'd model URL hides itself so the gradient + label show, not a broken icon
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  {s.tag && <span className="me-car-tag">{s.tag}</span>}
                  <span className="me-car-label">{s.label}</span>
                </div>
                {s.caption && <div className="me-car-cap">{s.caption}</div>}
              </div>
            );
          })}
        </div>

        <button className="me-car-arrow left" onClick={() => go(idx - 1)} aria-label="Previous">
          <Icon.chevR className="flip" />
        </button>
        <button className="me-car-arrow right" onClick={() => go(idx + 1)} aria-label="Next">
          <Icon.chevR />
        </button>
      </div>

      <div className="me-car-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={'me-dot' + (i === idx ? ' on' : '')}
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
        <span className="tab-num me-car-count">
          {idx + 1}/{n}
        </span>
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

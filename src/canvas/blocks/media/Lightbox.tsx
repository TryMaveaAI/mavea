import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { LightboxProps } from './types';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = LightboxProps & { delay?: number };

export function Lightbox({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const [open, setOpen] = useState<number | null>(null);
  const n = items.length;
  const go = (i: number) => setOpen(n > 0 ? ((i % n) + n) % n : null);
  const cur = open != null ? items[open] : null;
  // untrusted model URL — a rejected src leaves the gradient hero, same as a 404
  const curSrc = cur ? safeBlockImageSrc(cur.src) : undefined;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-lb-grid">
        {items.map((it, i) => {
          // same gate as the hero: rejected thumbs keep their gradient
          const src = safeBlockImageSrc(it.src);
          return (
            <button
              key={i}
              className="me-lb-thumb"
              style={{
                background: `linear-gradient(135deg, ${safeCssColor(it.from, 'var(--presence-deep)')}, ${safeCssColor(it.to, 'var(--presence-soft)')})`,
              }}
              onClick={() => setOpen(i)}
              aria-label={it.label}
            >
              {src && (
                <img
                  className="me-img-fill"
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  // A model-supplied URL can 404 — hide the element so the gradient + label show
                  // instead of a broken-image icon (the button's aria-label carries the meaning).
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <span className="me-lb-thumblabel">{it.label}</span>
              <span className="me-lb-expand">
                <Icon.external />
              </span>
            </button>
          );
        })}
      </div>

      {cur && open != null && (
        <div
          className="me-lb-modal"
          onClick={() => setOpen(null)}
          role="button"
          tabIndex={0}
          aria-label="Close"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(null);
            }
          }}
        >
          <div
            className="me-lb-stage"
            // Not a control in its own right — role="presentation" marks it as such — it only
            // exists to swallow clicks/keys before they reach the backdrop's close handler below.
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              // Keep Enter/Space presses on nav/close controls inside the stage from also
              // bubbling up to the backdrop's close handler — mirrors the click stopPropagation.
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
          >
            <div
              className="me-lb-hero"
              style={{
                background: `linear-gradient(135deg, ${safeCssColor(cur.from, 'var(--presence-deep)')}, ${safeCssColor(cur.to, 'var(--presence-soft)')})`,
              }}
            >
              {curSrc && (
                <img
                  className="me-img-fill"
                  src={curSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <span className="me-lb-herolabel">{cur.label}</span>
            </div>
            <div className="me-lb-bar">
              <div className="me-lb-meta">
                <span className="me-lb-metatitle">{cur.label}</span>
                {cur.caption && <span className="me-lb-metacap faint">{cur.caption}</span>}
              </div>
              <span className="tab-num faint">
                {open + 1} / {n}
              </span>
            </div>
            <button className="me-lb-nav left" onClick={() => go(open - 1)} aria-label="Previous">
              <Icon.chevR className="flip" />
            </button>
            <button className="me-lb-nav right" onClick={() => go(open + 1)} aria-label="Next">
              <Icon.chevR />
            </button>
            <button className="me-lb-close" onClick={() => setOpen(null)} aria-label="Close">
              <Icon.x />
            </button>
          </div>
        </div>
      )}

      <div className="insight-summary" style={{ marginTop: 10 }}>
        {footer || (
          <span className="faint">Click any thumbnail to open the lightbox · {n} images</span>
        )}
      </div>
    </div>
  );
}

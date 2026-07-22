import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ImageCalloutsProps } from './types';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = ImageCalloutsProps & { delay?: number };

// Keep a callout pin on the image even if a coordinate arrives out of range (untrusted data).
const clampPct = (v: number) => Math.max(2, Math.min(98, v));

export function ImageCallouts({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  image,
  callouts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  const [active, setActive] = useState(0);
  // untrusted model URL — a rejected src leaves the gradient plate, same as a 404
  const imgSrc = safeBlockImageSrc(image.src);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-ico-wrap">
        <div
          className="me-ico-img"
          style={{
            background: `linear-gradient(135deg, ${safeCssColor(image.from, 'var(--presence-deep)')}, ${safeCssColor(image.to, 'var(--presence-soft)')})`,
          }}
        >
          {imgSrc && (
            <img
              className="me-img-fill"
              src={imgSrc}
              alt=""
              loading="lazy"
              decoding="async"
              // a model-supplied URL can 404 — hide the element so the gradient + label show
              // instead of a broken-image icon (alt is empty so nothing renders on failure).
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {image.label && <span className="me-ico-imglabel">{image.label}</span>}
          {callouts.map((c, i) => {
            const col = c.color || 'var(--presence)';
            const on = i === active;
            return (
              <button
                key={i}
                className={'me-ico-pin' + (on ? ' on' : '')}
                style={
                  {
                    left: clampPct(c.x) + '%',
                    top: clampPct(c.y) + '%',
                    ['--cc' as string]: col,
                  } as CSSProperties
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={c.label}
                // First pin is the authored lead callout (numbered list, author-ordered).
                {...(i === 0 ? { 'data-mark': 'circle' } : {})}
              >
                <span className="me-ico-num">{i + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="me-ico-list">
          {callouts.map((c, i) => {
            const col = c.color || 'var(--presence)';
            const on = i === active;
            return (
              <button
                key={i}
                className={'me-ico-row' + (on ? ' on' : '')}
                style={{ ['--cc' as string]: col } as CSSProperties}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <span className="me-ico-rownum">{i + 1}</span>
                <span className="me-ico-rowbody">
                  <span className="me-ico-rowtitle">{c.label}</span>
                  {c.detail && <span className="me-ico-rowdetail">{c.detail}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

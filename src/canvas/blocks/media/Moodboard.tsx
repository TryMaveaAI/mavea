import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MoodTile, MoodboardProps } from './types';
import { safeBlockImageSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = MoodboardProps & { delay?: number };

function tileStyle(t: MoodTile): CSSProperties {
  const s: CSSProperties = {
    gridColumn: `span ${t.span === 2 ? 2 : 1}`,
    gridRow: `span ${t.rows === 2 ? 2 : 1}`,
  };
  // AccentVar is a closed token union at the type level, but the live schema only
  // tag-neutralizes these fields at runtime — it never validates them against the token set.
  // `swatch` in particular becomes the WHOLE `background` value, where a raw `url(...)` is
  // valid CSS: gate both at the render boundary, same principle as richInnerHtml/safeImageUrl.
  if (t.kind === 'image')
    s.background = `linear-gradient(135deg, ${safeCssColor(t.from)}, ${safeCssColor(t.to, 'var(--presence-soft)')})`;
  else if (t.kind === 'color') s.background = safeCssColor(t.swatch);
  return s;
}

export function Moodboard({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  tiles,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-mood">
        {tiles.map((t, i) => {
          // untrusted model URL — a rejected src leaves the gradient tile, same as a 404
          const src = safeBlockImageSrc(t.src);
          return (
            <div
              key={i}
              className={
                'me-mood-tile k-' +
                t.kind +
                (hover === i ? ' lift' : '') +
                (hover != null && hover !== i ? ' fade' : '')
              }
              style={tileStyle(t)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {t.kind === 'image' && src && (
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
              {t.kind === 'text' && <span className="me-mood-text">{t.text || t.label}</span>}
              {t.kind === 'color' && <span className="me-mood-hex tab-num">{t.hex || ''}</span>}
              {t.kind === 'image' && t.label && <span className="me-mood-imglabel">{t.label}</span>}
            </div>
          );
        })}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

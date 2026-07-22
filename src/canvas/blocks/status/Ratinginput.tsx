import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RatinginputProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RatinginputProps & { delay?: number };

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function Glyph({ shape, fill }: { shape: 'star' | 'heart'; fill: boolean }) {
  if (shape === 'heart')
    return (
      <svg viewBox="0 0 24 24" className="ri-glyph" aria-hidden="true">
        <path
          d="M12 20.5 4.2 12.8a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z"
          fill={fill ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="ri-glyph">
      <path
        d="m12 3 2.6 5.6 6 .7-4.4 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.4 9.3l6-.7L12 3Z"
        fill={fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Ratinginput({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  shape = 'star',
  max = 5,
  value,
  caption,
  facets,
  color = 'var(--warning)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  // cap the rendered glyph count so a large `max` can't overflow the card row
  const glyphCount = Math.max(1, Math.min(10, max));
  const init = value != null ? value : Math.max(1, Math.round(max * 0.8));
  const [val, setVal] = useState<number>(Math.min(max, Math.max(0, init)));
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover != null ? hover : val;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ri-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ri-main">
        <div className="ri-glyphs" onMouseLeave={() => setHover(null)} style={{ color }}>
          {Array.from({ length: glyphCount }).map((_, i) => {
            const idx = i + 1;
            const filled = idx <= shown;
            return (
              <button
                key={i}
                type="button"
                className={`ri-btn ${filled ? 'on' : ''} ${hover != null && idx <= hover ? 'preview' : ''}`}
                onMouseEnter={() => setHover(idx)}
                onFocus={() => setHover(idx)}
                onClick={() => setVal(idx)}
                aria-label={`${idx} of ${max}`}
              >
                <Glyph shape={shape} fill={filled} />
              </button>
            );
          })}
        </div>
        <div className="ri-meta">
          {/* the live numeric score is the single salient figure Mavéa underlines */}
          <span className="ri-val tab-num" data-mark="underline" style={{ color }}>
            {shown.toFixed(1)}
          </span>
          <span className="ri-word dim">
            {hover != null && hover <= 5
              ? LABELS[hover] || `${hover}`
              : caption || LABELS[Math.min(5, Math.round(val))] || ''}
          </span>
        </div>
      </div>

      {facets && facets.length > 0 && (
        <div className="ri-facets">
          {facets.map((f, i) => (
            <div className="ri-facet" key={i}>
              <span className="ri-facet-label">{f.label}</span>
              <span className="ri-facet-track">
                <span
                  className="ri-facet-fill"
                  style={{ width: (f.value / (max || 1)) * 100 + '%' }}
                />
              </span>
              <span className="ri-facet-val tab-num faint">{f.value.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

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

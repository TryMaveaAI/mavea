import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SlideDeckProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SlideDeckProps & { delay?: number };

// Map the optional layout hint to a human-readable chip label.
// Undefined layout means content by default, so only show the chip for
// non-default slides so the deck stays scannable.
const LAYOUT_LABELS: Record<NonNullable<SlideDeckProps['slides'][number]['layout']>, string> = {
  title: 'title',
  content: 'content',
  quote: 'quote',
  image: 'image',
};

export function SlideDeck({
  title,
  icon = 'slides',
  iconColor = 'var(--presence)',
  deck,
  slides,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.slides;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {/* Eyebrow: block label + icon so it reads as "Presentation outline" at a glance */}
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Deck title — the name of the presentation, prominent but below the eyebrow */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 'var(--fs-md, 15px)',
          color: 'var(--text-primary)',
          padding: '6px 0 4px',
          lineHeight: 1.35,
        }}
      >
        {deck}
      </div>

      {/* Slide list using the design-system .sd-slides class */}
      <ul className="sd-slides">
        {(slides ?? []).map((slide, i) => (
          // Ordered authored content — first slide is the honest lead of the deck
          <li key={i} className="sd-slide" {...(i === 0 ? { 'data-mark': 'circle' } : {})}>
            {/* Slide header: number badge + title + optional layout chip */}
            <div className="sd-slide-head">
              <span className="sd-num">{i + 1}</span>
              <span className="sd-title">{slide.title}</span>
              {slide.layout && slide.layout !== 'content' && (
                <span className="sd-layout-chip">{LAYOUT_LABELS[slide.layout]}</span>
              )}
            </div>

            {/* Bullet points — the CSS ::before pseudo-element already renders the · prefix */}
            {(slide.bullets ?? []).length > 0 && (
              <ul className="sd-bullets" aria-label={`Bullets for slide ${i + 1}`}>
                {slide.bullets!.map((bullet, bi) => (
                  <li key={bi} className="sd-bullet">
                    {bullet}
                  </li>
                ))}
              </ul>
            )}

            {/* Speaker note in muted italic below the bullets */}
            {slide.note && <div className="sd-note">{slide.note}</div>}
          </li>
        ))}
      </ul>

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

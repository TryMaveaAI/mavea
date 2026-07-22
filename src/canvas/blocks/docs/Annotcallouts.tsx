import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AnnotcalloutsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AnnotcalloutsProps & { delay?: number };

export function Annotcallouts({
  title,
  icon = 'image',
  iconColor = 'var(--presence)',
  caption,
  ratio = 16 / 9,
  callouts,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.image;
  // first pin active by default
  const [active, setActive] = useState<number>(0);
  const note = callouts[active];
  const noteCol = note?.color || 'var(--presence)';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ac-surface" style={{ aspectRatio: String(ratio) }}>
        {/* abstract "panel" — a soft schematic so it reads as an annotated figure */}
        <svg className="ac-bg" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="acg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--grid-strong)" />
              <stop offset="100%" stopColor="var(--grid-line)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="160" height="90" fill="url(#acg)" />
          {[18, 36, 54, 72].map((y) => (
            <line
              key={y}
              x1="10"
              y1={y}
              x2="150"
              y2={y}
              stroke="var(--grid-line)"
              strokeWidth="0.6"
            />
          ))}
          {[40, 80, 120].map((x) => (
            <line
              key={x}
              x1={x}
              y1="8"
              x2={x}
              y2="82"
              stroke="var(--grid-line)"
              strokeWidth="0.6"
            />
          ))}
        </svg>

        {callouts.map((c, i) => {
          const col = c.color || 'var(--presence)';
          const on = active === i;
          return (
            <button
              key={i}
              className={`ac-pin ${on ? 'on' : ''}`}
              style={{ left: c.x + '%', top: c.y + '%', ['--pc' as string]: col } as CSSProperties}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={c.label}
              // the first callout pin is the authored lead — the dot Mavéa arrows at
              data-mark={i === 0 ? 'point' : undefined}
            >
              <span className="ac-pin-ring" />
              <span className="ac-pin-num tab-num">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {caption && <div className="ac-caption faint">{caption}</div>}

      {note && (
        <div
          key={active}
          className="ac-note"
          style={{ ['--pc' as string]: noteCol } as CSSProperties}
        >
          <span className="ac-note-num tab-num">{active + 1}</span>
          <div className="ac-note-text">
            <span className="ac-note-label">{note.label}</span>
            <span className="ac-note-body" dangerouslySetInnerHTML={richInnerHtml(note.note)} />
          </div>
        </div>
      )}

      <div className="ac-thumbs">
        {callouts.map((c, i) => (
          <button
            key={i}
            className={`ac-thumb tab-num ${active === i ? 'on' : ''}`}
            style={{ ['--pc' as string]: c.color || 'var(--presence)' } as CSSProperties}
            onClick={() => setActive(i)}
          >
            {i + 1}
          </button>
        ))}
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

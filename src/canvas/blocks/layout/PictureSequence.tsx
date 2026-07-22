import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PictureSequenceProps, SequenceMarker } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PictureSequenceProps & { delay?: number };

// The ordinal cue word + accent for a panel. When a panel does not name its own marker we DERIVE
// one from its position so the strip always reads first → then… → last: position 0 is "first", the
// final panel is "last", and everything between is "then"/"next" (alternating to feel like a chant).
const MARKER: Record<SequenceMarker, { label: string; color: string }> = {
  first: { label: 'First', color: 'var(--insight)' },
  then: { label: 'Then', color: 'var(--presence)' },
  next: { label: 'Next', color: 'var(--presence)' },
  last: { label: 'Last', color: 'var(--insight)' },
};

/** Derive the marker for the panel at index `i` of `n` when it didn't declare one. */
function markerFor(i: number, n: number): SequenceMarker {
  if (i === 0) return 'first';
  if (i === n - 1) return 'last';
  // alternate then / next for the middle steps so a long strip keeps a sing-song rhythm
  return i % 2 === 1 ? 'then' : 'next';
}

// An order-the-events picture strip for early language / how-to: 3–6 illustrated panels left→right,
// each a simple symbolic placeholder carrying its sequence marker (first/then/next/last) and a
// caption, with arrows between them. The marker word + accent are derived from position when a panel
// leaves them off, so the steps always read in order. The illustration is a stand-in glyph keyed off
// the panel index, never invented content.
export function PictureSequence({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  panels,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const list = panels ?? [];
  const n = list.length;

  return (
    <div
      className="card reveal lay-pseq"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <ol className="lay-pseq-strip">
        {list.map((p, i) => {
          const key = p.marker ?? markerFor(i, n);
          const m = MARKER[key];
          return (
            <Fragment key={i}>
              <li
                className="lay-pseq-panel"
                style={{ ['--mc' as string]: m.color } as CSSProperties}
              >
                <span className="lay-pseq-marker">{m.label}</span>
                <div className="lay-pseq-frame">
                  <svg
                    className="lay-pseq-art"
                    viewBox="0 0 64 48"
                    role="img"
                    aria-label={p.label}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* a simple symbolic still: a card with a number medallion, so each panel reads
                        as an illustrated placeholder for its step without faking specific imagery */}
                    <rect x="8" y="8" width="48" height="32" rx="4" className="lay-pseq-art-card" />
                    <line x1="16" y1="32" x2="48" y2="32" className="lay-pseq-art-base" />
                    <circle cx="32" cy="21" r="9" className="lay-pseq-art-badge" />
                    <text x="32" y="21" className="lay-pseq-art-num">
                      {i + 1}
                    </text>
                  </svg>
                </div>
                <div className="lay-pseq-label">{p.label}</div>
                {p.caption && <div className="lay-pseq-cap faint">{p.caption}</div>}
              </li>
              {i < n - 1 && (
                <li className="lay-pseq-arrow" aria-hidden="true">
                  <Icon.chevR className="ic" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      {caption && <div className="lay-pseq-caption faint">{caption}</div>}

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

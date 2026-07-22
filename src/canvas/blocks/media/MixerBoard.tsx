import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MixerBoardProps, MixerTrack } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MixerBoardProps & { delay?: number };

// Cycle lane accents so adjacent tracks stay visually distinct when the model omits colors.
const LANE_ACCENTS = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--insight-soft)',
];

// The bars a track's clips reach to — used to size the shared timeline when `bars` isn't given.
function trackEnd(t: MixerTrack): number {
  return (t.clips ?? []).reduce((mx, c) => Math.max(mx, c.start + Math.max(0, c.len)), 0);
}

export function MixerBoard({
  title,
  icon = 'sliders',
  iconColor = 'var(--presence)',
  tracks,
  bars,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sliders;

  // The timeline spans `bars`, or far enough to hold every clip (min 4) — so clips always sit to
  // scale and nothing runs off the lane.
  const span = Math.max(4, bars ?? (tracks.reduce((mx, t) => Math.max(mx, trackEnd(t)), 0) || 4));
  // Bar gridlines: every bar up to ~16, else a coarser step so the ruler never crowds.
  const gridStep = span <= 16 ? 1 : Math.ceil(span / 12);
  const gridBars: number[] = [];
  for (let b = 0; b <= span; b += gridStep) gridBars.push(b);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="mx-board">
        {/* the bar ruler across the timeline column */}
        <div className="mx-ruler">
          <span className="mx-ruler-head" />
          <div className="mx-ruler-track">
            {gridBars.map((b) => (
              <span key={b} className="mx-ruler-tick" style={{ left: (b / span) * 100 + '%' }}>
                {b + 1}
              </span>
            ))}
          </div>
        </div>

        {tracks.map((t, i) => {
          const accent = t.color || LANE_ACCENTS[i % LANE_ACCENTS.length];
          const vol = Math.max(0, Math.min(100, t.volume ?? 80));
          const pan = Math.max(-100, Math.min(100, t.pan ?? 0));
          // Map pan -100..100 onto a 0..100 left offset for the thumb.
          const panPct = (pan + 100) / 2;
          const panLabel = pan === 0 ? 'C' : (pan < 0 ? 'L' : 'R') + Math.round(Math.abs(pan));
          return (
            <div
              key={i}
              className={'mx-lane' + (t.mute ? ' muted' : '') + (t.solo ? ' soloed' : '')}
              style={{ ['--cc' as string]: accent } as CSSProperties}
            >
              <div className="mx-head">
                <div className="mx-head-top">
                  <span className="mx-name">{t.name}</span>
                  <span className="mx-flags">
                    <span className={'mx-flag m' + (t.mute ? ' on' : '')}>M</span>
                    <span className={'mx-flag s' + (t.solo ? ' on' : '')}>S</span>
                  </span>
                </div>
                <div className="mx-controls">
                  <span className="mx-vol" title={`Volume ${vol}`}>
                    <span className="mx-vol-fill" style={{ width: vol + '%' }} />
                  </span>
                  <span className="mx-pan" title={`Pan ${panLabel}`}>
                    <span className="mx-pan-mid" />
                    <span className="mx-pan-thumb" style={{ left: panPct + '%' }} />
                  </span>
                  <span className="mx-pan-lbl tab-num">{panLabel}</span>
                </div>
              </div>

              <div className="mx-timeline">
                {gridBars.map((b) => (
                  <span
                    key={b}
                    className="mx-grid"
                    style={{ left: (b / span) * 100 + '%' }}
                    aria-hidden
                  />
                ))}
                {(t.clips ?? []).map((c, ci) => {
                  const left = (Math.max(0, c.start) / span) * 100;
                  const width = (Math.max(0, Math.min(c.len, span - c.start)) / span) * 100;
                  return (
                    <span
                      key={ci}
                      className="mx-clip"
                      style={{ left: left + '%', width: width + '%' }}
                      title={c.label}
                      // First clip of the first lane is the authored anchor → box gesture.
                      {...(i === 0 && ci === 0 ? { 'data-mark': 'box' } : {})}
                    >
                      {c.label && <span className="mx-clip-lbl">{c.label}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {caption && <div className="mx-caption">{caption}</div>}

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

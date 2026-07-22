import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { VideoEmbedProps } from './types';
import { safeBlockImageSrc, safeSameOriginMediaSrc } from '../../../lib/safeImageUrl';
import { safeCssColor } from '../../../lib/safeCssColor';

type Props = VideoEmbedProps & { delay?: number };

export function VideoEmbed({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  thumb,
  video,
  poster,
  durationLabel = '12:40',
  chapters,
  active = 0,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.play;
  // untrusted model image URL — a rejected poster leaves the native video chrome, same as a 404
  const posterSrc = safeBlockImageSrc(poster);
  // The video field is also model-shaped data. Until a vetted video-search backend exists, only a
  // bundled/same-origin asset may make the browser fetch media; external/active schemes fall back
  // to the designed chapter preview instead of producing a broken or privacy-leaking player.
  const videoSrc = safeSameOriginMediaSrc(video);
  const [sel, setSel] = useState(Math.max(0, Math.min(chapters.length - 1, active)));
  const [playing, setPlaying] = useState(false);
  const vidRef = useRef<HTMLVideoElement>(null);
  // Scrubber positions are 0..100; clamp so untrusted data can't push a tick off the track.
  const atPct = (i: number) => Math.max(0, Math.min(100, chapters[i]?.at ?? 0));
  const head = atPct(sel);
  // select a chapter; with a real video, also seek to its position (at% of duration)
  const pick = (i: number) => {
    setSel(i);
    const v = vidRef.current;
    if (v && v.duration) v.currentTime = (atPct(i) / 100) * v.duration;
  };
  // Arrow keys move between chapters when the chapter list has focus.
  const onChapKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      pick(Math.min(chapters.length - 1, sel + 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      pick(Math.max(0, sel - 1));
    }
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="me-vid">
        {videoSrc ? (
          <video
            ref={vidRef}
            className="me-vid-real"
            src={videoSrc}
            poster={posterSrc}
            controls
            preload="metadata"
            playsInline
          >
            {/* No per-source caption file is available for an arbitrary model-supplied video URL —
                an empty track still surfaces the native CC toggle rather than omitting one entirely. */}
            <track kind="captions" srcLang="en" label="English" src="data:text/vtt,WEBVTT" />
          </video>
        ) : (
          <div
            className="me-vid-thumb"
            style={{
              background: `linear-gradient(135deg, ${safeCssColor(thumb.from, 'var(--presence-deep)')}, ${safeCssColor(thumb.to, 'var(--presence-soft)')})`,
            }}
          >
            {thumb.label && <span className="me-vid-overlaylabel">{thumb.label}</span>}
            <span className="me-vid-dur tab-num">{durationLabel}</span>
            <button
              className={'me-vid-playbtn' + (playing ? ' playing' : '')}
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <span className="me-vid-pause">
                  <i />
                  <i />
                </span>
              ) : (
                <Icon.play />
              )}
            </button>
            <div className="me-vid-scrub">
              <span className="me-vid-scrub-fill" style={{ width: head + '%' }} />
              {chapters.map((_, i) => (
                <span
                  key={i}
                  className={'me-vid-tick' + (i === sel ? ' on' : '')}
                  style={{ left: atPct(i) + '%' }}
                />
              ))}
            </div>
          </div>
        )}

        {chapters.length > 0 && (
          <div
            className="me-vid-chapters"
            role="listbox"
            aria-label="Chapters"
            tabIndex={0}
            onKeyDown={onChapKey}
          >
            {chapters.map((c, i) => (
              <button
                key={i}
                className={'me-vid-chap' + (i === sel ? ' on' : '')}
                onClick={() => pick(i)}
                role="option"
                aria-selected={i === sel}
              >
                <span className="me-vid-chaptime tab-num">{c.time}</span>
                {/* Active chapter (flagged via the `active` prop) is the emphasis lead. */}
                <span
                  className="me-vid-chaptitle"
                  {...(i === sel ? { 'data-mark': 'underline' } : {})}
                >
                  {c.title}
                </span>
                {i === sel && <Icon.play className="me-vid-chapnow" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {(footer || chapters.length > 0) && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer || (
            <span>
              Now at{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{chapters[sel]?.title}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

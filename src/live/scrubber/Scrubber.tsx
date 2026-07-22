// The conversation scrubber — a slim video-timeline strip above the composer. Each chapter is a
// tinted track, each ask a tick; the tick you're viewing glows. Hover a tick for the question,
// click to jump the canvas back to that moment, or arrow across them like a real timeline. The
// layers button to the left zooms out to the Overview.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../icons/icons';
import type { Chapter } from './chapters';
import './scrubber.css';

interface ScrubberProps {
  chapters: Chapter[];
  /** The frame index currently on screen (the glowing tick). */
  currentIndex: number;
  onJump: (frameIndex: number) => void;
  onOpenOverview: () => void;
  /** While a turn is streaming, jumping is disabled (don't race the live canvas). */
  disabled?: boolean;
}

export function Scrubber({
  chapters,
  currentIndex,
  onJump,
  onOpenOverview,
  disabled,
}: ScrubberProps): ReactElement | null {
  // One tabbable tick at a time (roving tabindex); arrows move focus across chapter boundaries.
  const flat = chapters.flatMap((ch) => ch.moments);
  const [focusFrame, setFocusFrame] = useState(currentIndex);
  const btns = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => setFocusFrame(currentIndex), [currentIndex]);

  const move = useCallback(
    (toPos: number): void => {
      if (flat.length === 0) return;
      const clamped = Math.max(0, Math.min(flat.length - 1, toPos));
      const fi = flat[clamped].frameIndex;
      setFocusFrame(fi);
      btns.current.get(fi)?.focus();
    },
    [flat],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      const pos = flat.findIndex((m) => m.frameIndex === focusFrame);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(pos + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(pos - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        move(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        move(flat.length - 1);
      }
    },
    [flat, focusFrame, move],
  );

  if (chapters.length === 0) return null;
  const tabFrame = flat.some((m) => m.frameIndex === focusFrame) ? focusFrame : flat[0]?.frameIndex;

  return (
    <div
      className="scrubber"
      role="toolbar"
      aria-label="Conversation timeline"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="scrub-layers"
        onClick={onOpenOverview}
        aria-haspopup="dialog"
        aria-label="Open conversation overview"
        title="Overview"
      >
        <Icon.layers />
      </button>
      <div className="scrub-tracks">
        {chapters.map((ch) => (
          <div
            key={ch.id}
            className="scrub-track"
            style={{ ['--track-c']: ch.color, flexGrow: ch.moments.length } as React.CSSProperties}
          >
            <div className="scrub-rail">
              {ch.moments.map((m) => {
                const current = m.frameIndex === currentIndex;
                const past = !current && m.frameIndex < currentIndex;
                const Glyph = Icon[m.icon] || Icon.mic;
                return (
                  <button
                    key={m.frameIndex}
                    type="button"
                    ref={(el) => {
                      if (el) btns.current.set(m.frameIndex, el);
                      else btns.current.delete(m.frameIndex);
                    }}
                    className={
                      'scrub-tick' + (current ? ' is-current' : '') + (past ? ' is-past' : '')
                    }
                    style={{ ['--tick-c']: ch.color } as React.CSSProperties}
                    onClick={() => onJump(m.frameIndex)}
                    disabled={disabled}
                    tabIndex={m.frameIndex === tabFrame ? 0 : -1}
                    aria-current={current ? 'true' : undefined}
                    aria-label={m.question || 'Moment'}
                  >
                    <span className="scrub-dot" />
                    <span className="scrub-tip" role="tooltip">
                      <Glyph />
                      <span className="scrub-tip-q">{m.question || 'Moment'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="scrub-label">{ch.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

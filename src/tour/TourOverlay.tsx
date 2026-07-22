// TourOverlay — the walkthrough's chrome: a spotlight ring on the real control being taught, the
// coach caption, and a full transport (back / play-pause / next / chapter dots / skip). It renders
// OVER the real Live surface (which keeps running underneath), reads everything from the driver,
// and is pointer-transparent except for its own controls so it never blocks the app it's teaching.
import { useEffect, type ReactElement } from 'react';
import { Icon } from '../icons/icons';
import { useElementRect } from './useElementRect';
import type { TourDriver } from './useTourDriver';
import './tour.css';

export function TourOverlay({ driver }: { driver: TourDriver }): ReactElement | null {
  const rect = useElementRect(driver.spotlight, driver.active && driver.started && !driver.done);

  // Stamp the current chapter on <body> so tour.css can reveal hover-only chrome the chapter is
  // pointing at (the per-card Ask pills hide at rest — a ring around an invisible control reads
  // as highlighting nothing).
  const chapterId =
    driver.active && driver.started && !driver.done ? driver.chapter?.id : undefined;
  useEffect(() => {
    if (!chapterId) return;
    document.body.dataset.tourChapter = chapterId;
    return () => {
      delete document.body.dataset.tourChapter;
    };
  }, [chapterId]);

  if (!driver.active || driver.done) return null;

  if (!driver.started) {
    return (
      <div className="tourx tourx-intro" aria-live="polite">
        <div
          className="tourx-welcome"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tourx-welcome-title"
        >
          <span className="tourx-welcome-kicker">Walkthrough</span>
          <h2 id="tourx-welcome-title">See Mavéa in action</h2>
          <p>
            {driver.total} short {driver.total === 1 ? 'scene plays' : 'scenes play'} automatically.
            Pause, skip, or move at your own pace.
          </p>
          <div className="tourx-welcome-actions">
            <button type="button" className="tourx-welcome-start" onClick={driver.start}>
              Start the tour
            </button>
            <button type="button" className="tourx-welcome-skip" onClick={driver.skip}>
              Skip tour
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pad = 8;
  // The multi-card Ask scene uses the grounding rail directly above the composer. Dock its coach
  // at the top so it never covers the two selected-card chips it is trying to teach.
  const panelAtTop =
    chapterId === 'ask' || (!!rect && rect.top + rect.height / 2 > window.innerHeight * 0.58);

  return (
    <div className="tourx" aria-live="polite">
      {/* Spotlight: a ring around the control + a dim scrim everywhere else (box-shadow cutout).
          Only when a control is actually on screen — answer/montage/present chapters dim nothing. */}
      {rect && (
        <div
          className="tourx-ring"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}

      {/* Coach caption + transport, docked bottom-center above the composer. The head + coach are
          keyed by chapter so each one enters with a soft rise — a cut reads as a scene change. */}
      <div
        className={'tourx-panel' + (driver.solo ? ' is-solo' : '') + (panelAtTop ? ' is-top' : '')}
        role="group"
        aria-label={driver.solo ? 'Mini-demo controls' : 'Walkthrough controls'}
      >
        <div className="tourx-head" key={'head-' + driver.index}>
          <span className="tourx-count">
            {driver.solo ? 'Mini demo' : `${driver.index + 1} / ${driver.total}`}
          </span>
          <span className="tourx-title">{driver.chapter?.title}</span>
        </div>
        <p className="tourx-coach" key={'coach-' + driver.index}>
          {driver.coach}
        </p>
        <div className="tourx-controls">
          {!driver.solo && (
            <button
              type="button"
              className="tourx-btn"
              onClick={driver.prev}
              disabled={driver.index === 0}
              aria-label="Previous chapter"
            >
              <Icon.chevL className="tourx-ic" />
            </button>
          )}
          <button
            type="button"
            className="tourx-btn tourx-play tourx-auto"
            onClick={driver.toggle}
            aria-label={driver.playing ? 'Pause autoplay' : 'Turn on autoplay'}
          >
            {driver.playing ? (
              <Icon.pause className="tourx-ic" />
            ) : (
              <Icon.play className="tourx-ic" />
            )}
            <span>{driver.playing ? 'Pause' : 'Autoplay'}</span>
          </button>
          <button
            type="button"
            className="tourx-btn tourx-mute"
            onClick={driver.toggleMute}
            aria-label={driver.muted ? 'Turn narration on' : 'Mute narration'}
            aria-pressed={driver.muted}
            title={driver.muted ? 'Turn narration on' : 'Mute narration'}
          >
            {driver.muted ? (
              <Icon.speakerOff className="tourx-ic" />
            ) : (
              <Icon.speaker className="tourx-ic" />
            )}
          </button>
          {!driver.solo && (
            <>
              <button
                type="button"
                className="tourx-btn"
                onClick={driver.next}
                aria-label="Next chapter"
              >
                <Icon.chevR className="tourx-ic" />
              </button>
              <div className="tourx-dots" role="tablist" aria-label="Chapters">
                {Array.from({ length: driver.total }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === driver.index}
                    aria-label={`Chapter ${i + 1}`}
                    className={'tourx-dot' + (i === driver.index ? ' is-active' : '')}
                    onClick={() => driver.jumpTo(i)}
                  />
                ))}
              </div>
            </>
          )}
          <button type="button" className="tourx-skip" onClick={driver.skip}>
            {driver.solo ? 'Back to demos' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}

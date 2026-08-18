import { useRef, type ReactElement } from 'react';
import { Presence } from '../presence/Presence';
import { useVoiceEnergySink } from '../voice/voiceEnergy';
import { useFocusTrap } from '../live/useFocusTrap';
import { TOUR_EXTRAS } from './tourPlan';

export function TourEndCard({
  onStart,
  onReplay,
  onPlayExtra,
  hasStoredSession = false,
}: {
  onStart: () => void;
  onReplay: () => void;
  onPlayExtra: (id: string) => void;
  hasStoredSession?: boolean;
}): ReactElement {
  // It covers the whole surface with a scrim, so it has to hold keyboard focus too — mounting it
  // is what makes it modal, and it never renders in a non-modal state.
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef);
  const voiceSinkRef = useVoiceEnergySink();

  return (
    <div
      ref={cardRef}
      className="tour-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-end-title"
    >
      <section className="tour-end-card">
        <header className="tour-end-intro">
          <div className="tour-end-mascot" aria-hidden="true" ref={voiceSinkRef}>
            <Presence state="idle" emotion="neutral" gaze="center" />
          </div>
          <h2 id="tour-end-title" className="tour-end-title tour-end-line">
            That's Mavéa.
          </h2>
          <p className="tour-end-tagline tour-end-line">Talk to AI. See what it means.</p>
          <p className="tour-end-copy tour-end-line">
            Try it now, or open any scripted mini-demo below to see that feature operate on the real
            interface.
          </p>
          <div className="tour-end-actions tour-end-line">
            <button type="button" className="tour-end-start" onClick={onStart}>
              {hasStoredSession ? 'Back to your session' : 'Start Mavéa'}
            </button>
            <button type="button" className="tour-end-replay" onClick={onReplay}>
              Replay the tour
            </button>
          </div>
        </header>

        <div className="tour-end-extras">
          <h3>More to explore</h3>
          <div className="tour-end-grid">
            {TOUR_EXTRAS.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className="tour-end-extra"
                onClick={() => onPlayExtra(chapter.id)}
                aria-label={`Play scripted mini-demo: ${chapter.title}`}
              >
                <span className="tour-end-glyph" aria-hidden="true">
                  {chapter.glyph}
                </span>
                <span className="tour-end-extra-copy">
                  <strong>{chapter.title}</strong>
                  <small>{chapter.hook}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

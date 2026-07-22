// The hero. The living Presence face floats in from the app shell (App.tsx) and sits above
// this content; the hero reserves vertical space for it via CSS. The composer is real — typing
// and sending, or tapping the mic, both open Live seeded with the text. While it sits empty it
// rotates example prompts at a calm cadence (frozen on focus, in lite mode, and in background tabs).
import { useEffect, useRef, useState } from 'react';
import { MicIcon, SendIcon } from '../../icons/coreIcons';
import { stashTourMode } from '../../tour/tourEntry';

const EXAMPLES = [
  'How do black holes bend light?',
  'Map 3 days in Lisbon',
  'Why did Q3 dip?',
  'Buy vs. rent a $500k home',
];

const TYPE_PROMPTS = [
  "Explain compound interest like I'm 12.",
  'How did our quarter actually go?',
  'Plan 3 days in Lisbon, mapped day by day.',
  'Buy vs. rent a $500,000 home — chart it.',
];

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Ambient typing is decoration, so it gets no background-tab or lite-tier CPU budget. */
function canAnimatePlaceholder(): boolean {
  if (typeof document === 'undefined') return false;
  return !document.hidden && document.documentElement.dataset.perf !== 'lite';
}

function useAmbientTypingEnabled(): boolean {
  const [enabled, setEnabled] = useState(canAnimatePlaceholder);

  useEffect(() => {
    const sync = (): void => setEnabled(canAnimatePlaceholder());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-perf'],
    });
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return enabled;
}

/** One prompt change every few seconds keeps the composer fresh without a near-frame-rate timer. */
function useRotatingPlaceholder(paused: boolean): string {
  const prompt = useRef(0);
  const [text, setText] = useState(TYPE_PROMPTS[0]);

  useEffect(() => {
    if (paused || prefersReducedMotion()) {
      prompt.current = 0;
      setText(TYPE_PROMPTS[0]);
      return;
    }
    const timer = setInterval(() => {
      prompt.current = (prompt.current + 1) % TYPE_PROMPTS.length;
      setText(TYPE_PROMPTS[prompt.current]);
    }, 6500);
    return () => clearInterval(timer);
  }, [paused]);

  return text;
}

export function Hero({
  onEnterLive,
  onWarm,
  showTourInvite,
  onPlayTour,
  onDismissTourInvite,
}: {
  onEnterLive: (seed?: string) => void;
  onWarm?: () => void;
  showTourInvite?: boolean;
  onPlayTour?: () => void;
  onDismissTourInvite?: () => void;
}) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const ambientTyping = useAmbientTypingEnabled();
  const placeholder = useRotatingPlaceholder(focused || value.length > 0 || !ambientTyping);
  // Rendered as an overlay span, not the native placeholder attribute, so each rotation can
  // cross-fade in (keyed remount) instead of hard-cutting every few seconds.
  const ghost = focused ? 'Ask anything' : ambientTyping ? placeholder : TYPE_PROMPTS[0];

  const submit = (): void => {
    const seed = value.trim();
    onEnterLive(seed || undefined);
  };

  return (
    <div className="fl-hero">
      <div className="fl-hero-orbspace" aria-hidden="true" />
      <h1 className="fl-hero-title">
        Talk to it. Type to it.
        <br />
        <em>See what it means.</em>
      </h1>
      <p className="fl-hero-lede">
        A calm face listens — by voice or keyboard — speaks the headline the instant it forms, then
        steps aside while a living canvas draws the answer. Charts, timelines, evidence you can
        check. Not another wall of text.
      </p>

      <form
        className="fl-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="fl-composer-field">
          <input
            className="fl-composer-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => {
              setFocused(true);
              // The user is about to type a question — warm the Live connection now so the first
              // turn after they click through doesn't pay cold-start latency.
              onWarm?.();
            }}
            onBlur={() => setFocused(false)}
            aria-label="Ask Mavéa anything"
          />
          {value === '' && (
            <span key={ghost} className="fl-composer-ghost" aria-hidden="true">
              {ghost}
            </span>
          )}
        </div>
        <div className="fl-composer-actions">
          <button
            type="button"
            className="fl-composer-btn"
            onClick={() => onEnterLive(value.trim() || undefined)}
            title="Say it in Live"
            aria-label="Say it in Live"
          >
            <MicIcon />
          </button>
          <button type="submit" className="fl-composer-btn primary" title="Send" aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </form>

      {showTourInvite ? (
        <div className="fl-tour-invite" role="note">
          <p className="fl-tour-invite-text">
            Watch Mavéa work — a 2-minute guided tour on the real app. No keys, no setup.
          </p>
          <div className="fl-tour-invite-actions">
            <button type="button" className="fl-tour-invite-play" onClick={onPlayTour}>
              <span className="fl-hero-watch-glyph" aria-hidden="true">
                ▶
              </span>
              Play the tour
            </button>
            <button type="button" className="fl-tour-invite-skip" onClick={onDismissTourInvite}>
              I'll explore on my own
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="fl-hero-watch"
          onClick={() => {
            stashTourMode();
            onEnterLive();
          }}
        >
          <span className="fl-hero-watch-glyph" aria-hidden="true">
            ▶
          </span>
          Watch it work
          <span className="fl-hero-watch-time">2 min, no key needed</span>
        </button>
      )}

      {/* On a first visit the tour invite is the one suggestion on screen — stacking example
          chips under it read as two competing calls. The chips take over once it retires. */}
      {!showTourInvite && (
        <>
          <div className="fl-hero-hint">Not sure where to start? Try one:</div>
          <div className="fl-chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="fl-chip" onClick={() => onEnterLive(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

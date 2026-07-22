// The ink chrome for a canvas: the Highlight tool, the recognized-intent chips, and a one-time
// coach that teaches the feature. Shared by both surfaces (Live + Demo) so they behave identically.
//
// Discoverability: the pen path is invisible by design, and the Highlight tool is quiet — so on the
// first answer (until the user engages) a gentle nudge points at Highlight and the button pulses. It
// disappears for good the moment they arm Highlight or make a mark, and is remembered across
// sessions.
import { useEffect, useState, type ReactElement } from 'react';
import { InkChips } from './InkChips';
import type { PinnedMark } from './useInkIntent';

const HINT_KEY = 'mavea-ink-hint-seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true; // no storage (private mode / SSR) → don't nag
  }
}

export function InkBar({
  armed,
  pins,
  miss = 0,
  onUndo,
  onSend,
}: {
  /** Whether Highlight is armed (the toggle now lives in the composer) — gates the one-time coach. */
  armed: boolean;
  pins: PinnedMark[];
  /** Bumps when a stroke or tap resolved to nothing — triggers a brief "nothing to grab" nudge. */
  miss?: number;
  onUndo: (index: number) => void;
  onSend: () => void;
}): ReactElement | null {
  const [hintSeen, setHintSeen] = useState(readSeen);
  const coaching = !hintSeen && !armed && pins.length === 0;
  // Teach at the moment of intent: the instant Highlight is on and nothing's grabbed yet, show how
  // it works — every time, not just once. This catches the user who dismissed the first-run coach
  // long ago and later turns Highlight on wondering what to do. It clears the moment they grab
  // something.
  const arming = armed && pins.length === 0;

  // A mark that landed on open space / an unrecognized squiggle gives no intent — flash a brief
  // hint so the gesture never just vanishes silently (the "Highlight doesn't work" symptom).
  const [missHint, setMissHint] = useState(false);
  useEffect(() => {
    if (!miss) return;
    setMissHint(true);
    const t = setTimeout(() => setMissHint(false), 2600);
    return () => clearTimeout(t);
  }, [miss]);

  // Engaging with ink (arming or marking) counts as discovery — retire the coach for good.
  useEffect(() => {
    if (hintSeen || (!armed && pins.length === 0)) return;
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [armed, pins.length, hintSeen]);

  const dismiss = (): void => {
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // The Mark toggle now lives in the composer's control row (grouped with mic/attach), so this bar
  // only appears when it has something to say — the coach hint, a "nothing there" miss, or the
  // recognized-mark chips. Idle, it renders nothing, so there's no empty band above the composer.
  const showChips = pins.length > 0;
  if (!coaching && !arming && !missHint && !showChips) return null;

  return (
    <div className={'ink-bar' + (coaching ? ' coaching' : '')}>
      {coaching && (
        <div className="ink-coach" role="note">
          <span className="ink-coach-spark" aria-hidden="true">
            ✍️
          </span>
          <span className="ink-coach-text">
            <strong>Highlight to ask.</strong> Turn on <strong>Highlight</strong>, then drag across
            any value, label, or card to grab it. Ask in your own words, and a pen draws straight
            away.
          </span>
          <button
            type="button"
            className="ink-coach-x"
            title="Dismiss"
            aria-label="Got it"
            onClick={dismiss}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
      {arming && !missHint && (
        <span className="ink-howto" role="status">
          <span className="ink-howto-dot" aria-hidden="true" />
          Drag across any value, label, or card on the answer to grab it. Then ask in your own
          words.
        </span>
      )}
      {missHint && !coaching && (
        <span className="ink-miss" role="status">
          Nothing to grab there. Drag across a value, label, or card.
        </span>
      )}
      {showChips && <InkChips pins={pins} onUndo={onUndo} onSend={onSend} />}
    </div>
  );
}

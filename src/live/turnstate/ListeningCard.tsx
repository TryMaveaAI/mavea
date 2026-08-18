// State 1 of a turn: listening. The live transcript forms in an elevated card above the
// dock — visibly being heard, word by word, with a breathing equalizer and a caret. The
// caption is honest about what the mic will actually do in the current mode.
import { useEffect, useState, type ReactElement } from 'react';
import './turnstate.css';

/** Anti-flash: a fast machine transcribes a short utterance inside this window, and swapping the
 *  card's caption for it would be a blink, not information. Mirrors the voice strip's own
 *  PREPARING_CUE_DELAY_MS beat, halved — this gap is the shorter of the two. */
const TRANSCRIBING_CUE_DELAY_MS = 300;

export function ListeningCard({
  transcript,
  mode,
  note,
  transcribing = false,
}: {
  transcript: string | null;
  mode: 'tap' | 'hold' | 'always';
  /** Override the mode caption — e.g. think-out-loud's "Just listening · 4m — say
   *  'thoughts?' when you want me". Absent → the standard per-mode line. */
  note?: string;
  /** The person has plainly stopped talking: either the utterance is already being turned into
   *  text, or the mic's own tail-watcher says it is about to be. The card HOLDS rather than
   *  unmounting — the words are already gone from the air, and an empty stage here is what read
   *  as "it didn't hear me". The copy stays true of both, because the earlier of the two can
   *  still be taken back if they were only pausing mid-thought. */
  transcribing?: boolean;
}): ReactElement {
  // The hold is immediate (continuity), but the changed treatment waits out the anti-flash beat.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!transcribing) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), TRANSCRIBING_CUE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [transcribing]);
  const held = transcribing && settled;
  return (
    <div className="listen-stage">
      <div className={'listen-card' + (held ? ' is-transcribing' : '')}>
        <span className="listen-eq" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
        <div className="listen-body">
          <div className="listen-line">
            {transcript ? `“${transcript}` : held ? 'Heard you' : 'Listening'}
            <span className="listen-caret" aria-hidden="true"></span>
            {transcript ? '”' : ''}
          </div>
          {/* Only the mode caption is a live region. The transcript line above mutates on every
              recognized word, so announcing it would read the speaker's own words back at them
              while they're still talking; the settled utterance is announced by the turn flow. */}
          <div className="listen-note" role="status" aria-live="polite">
            {held
              ? 'Got that — one moment…'
              : (note ??
                (mode === 'always'
                  ? 'Always on — Mavéa answers when you finish a thought.'
                  : mode === 'hold'
                    ? 'Release the mic or shortcut to send.'
                    : 'It sends when you pause — or tap the mic to send now.'))}
          </div>
        </div>
      </div>
    </div>
  );
}

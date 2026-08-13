// State 1 of a turn: listening. The live transcript forms in an elevated card above the
// dock — visibly being heard, word by word, with a breathing equalizer and a caret. The
// caption is honest about what the mic will actually do in the current mode.
import type { ReactElement } from 'react';
import './turnstate.css';

export function ListeningCard({
  transcript,
  mode,
  note,
}: {
  transcript: string | null;
  mode: 'tap' | 'hold' | 'always';
  /** Override the mode caption — e.g. think-out-loud's "Just listening · 4m — say
   *  'thoughts?' when you want me". Absent → the standard per-mode line. */
  note?: string;
}): ReactElement {
  return (
    <div className="listen-stage">
      <div className="listen-card">
        <span className="listen-eq" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
        <div className="listen-body">
          <div className="listen-line">
            {transcript ? `“${transcript}` : 'Listening'}
            <span className="listen-caret" aria-hidden="true"></span>
            {transcript ? '”' : ''}
          </div>
          {/* Only the mode caption is a live region. The transcript line above mutates on every
              recognized word, so announcing it would read the speaker's own words back at them
              while they're still talking; the settled utterance is announced by the turn flow. */}
          <div className="listen-note" role="status" aria-live="polite">
            {note ??
              (mode === 'always'
                ? 'Always on — Mavéa answers when you finish a thought.'
                : mode === 'hold'
                  ? 'Release the mic or shortcut to send.'
                  : 'It sends when you pause — or tap the mic to send now.')}
          </div>
        </div>
      </div>
    </div>
  );
}

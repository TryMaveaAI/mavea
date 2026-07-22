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
  mode: 'tap' | 'always';
  /** Override the mode caption — e.g. think-out-loud's "Just listening · 4m — say
   *  'thoughts?' when you want me". Absent → the standard per-mode line. */
  note?: string;
}): ReactElement {
  return (
    <div className="listen-stage">
      <div className="listen-card" role="status" aria-live="polite">
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
          <div className="listen-note">
            {note ??
              (mode === 'always'
                ? 'Always on — Mavéa answers when you finish a thought.'
                : 'It sends when you pause — or tap the mic to stop.')}
          </div>
        </div>
      </div>
    </div>
  );
}

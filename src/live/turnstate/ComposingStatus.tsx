// Shown beneath the canvas the whole time a turn is still streaming in, so a partly-built
// answer is never mistaken for a finished one. Unlike the skeleton cards (which carry a short
// mount delay to avoid flashing on an instant answer), this is keyed straight to the turn's
// `busy` flag: it appears the moment the turn starts and clears the instant the answer settles.
import type { ReactElement } from 'react';
import './turnstate.css';

/** `thinking` = the model is still reasoning (no answer content yet); we say "Thinking…" so a long
 *  pre-answer reasoning phase (some OpenRouter/reasoning models) never reads as a frozen turn. */
export function ComposingStatus({ thinking = false }: { thinking?: boolean }): ReactElement {
  return (
    <div className="composing-status" role="status" aria-live="polite">
      <span className="composing-orb" aria-hidden="true" />
      <span>{thinking ? 'Thinking it through' : 'Composing your answer'}</span>
      <span className="composing-dots" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </div>
  );
}

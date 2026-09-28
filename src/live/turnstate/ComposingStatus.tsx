// Shown beneath the canvas the whole time a turn is still streaming in, so a partly-built
// answer is never mistaken for a finished one. Unlike the skeleton cards (which carry a short
// mount delay to avoid flashing on an instant answer), this is keyed straight to the turn's
// `busy` flag: it appears the moment the turn starts and clears the instant the answer settles.
import type { LiveActivity } from '../generateLive';
import type { BoardCue } from '../settleTurn';
import type { ReactElement } from 'react';
import './turnstate.css';

/** `thinking` = the model is still reasoning (no answer content yet); we say "Thinking…" so a long
 *  pre-answer reasoning phase (some OpenRouter/reasoning models) never reads as a frozen turn.
 *  `cue` = a follow-up is certain to keep the board on screen, so the line says what it is doing
 *  to it — otherwise the reader, looking at an unchanged board, cannot tell it from a new one. */
export function ComposingStatus({
  thinking = false,
  activity = null,
  cue = null,
}: {
  thinking?: boolean;
  activity?: LiveActivity;
  cue?: BoardCue | null;
}): ReactElement {
  return (
    <div className="composing-status" role="status" aria-live="polite">
      <span className="composing-orb" aria-hidden="true" />
      <span>
        {/* A provider wait is named so it does not look like a hung model; the implementation
            detail stays out of the reader's language. */}
        {activity === 'rate-limited'
          ? 'Waiting for your provider'
          : activity === 'provider-busy'
            ? 'Trying again'
            : cue === 'extend'
              ? 'Adding to this board'
              : cue === 'revise'
                ? 'Updating this board'
                : thinking
                  ? 'Thinking it through'
                  : 'Composing your answer'}
      </span>
      <span className="composing-dots" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </div>
  );
}

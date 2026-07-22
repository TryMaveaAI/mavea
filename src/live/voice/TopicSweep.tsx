// TopicSweep — the one felt beat of session threading: when a turn genuinely PIVOTS to a new topic
// (the session rail opens a new thread), a hairline sweeps once across the top of the stage and a
// small "New topic" label breathes in and out, then the whole thing removes itself. It punctuates a
// real subject-change so continuity-vs-fresh-start is felt, without any persistent chrome.
//
// Rendered as an <aside> overlay (never a div inside .card-grid — grid div children carry a transform
// transition and would drift under the spotlight choreography), pointer-events:none, aria-hidden. The
// parent keys it on the pivoting turn so each pivot replays the one-shot; this component just unmounts
// itself when the animation is done. Honors prefers-reduced-motion (a quiet static fade, no motion).
import { useEffect, type CSSProperties, type ReactElement } from 'react';
import './voice.css';

/** Matches the longest voice.css animation on `.topic-sweep` (kept in sync so we unmount after it). */
const SWEEP_MS = 1300;

export function TopicSweep({
  onDone,
  tint,
}: {
  onDone: () => void;
  /** The colour of the thread being entered, so the sweep reads as that topic. Falls back to the
   *  brand accent in CSS when absent. */
  tint?: string;
}): ReactElement {
  useEffect(() => {
    const t = window.setTimeout(onDone, SWEEP_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <aside
      className="topic-sweep"
      aria-hidden="true"
      style={tint ? ({ '--topic-sweep-ink': tint } as CSSProperties) : undefined}
    >
      <span className="topic-sweep-line" />
      <span className="topic-sweep-label">New topic</span>
    </aside>
  );
}

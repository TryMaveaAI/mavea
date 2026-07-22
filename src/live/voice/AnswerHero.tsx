// The spoken answer, leading the canvas. The voice is the hero of the surface: its line
// renders as a large serif headline with the key figures accented, over a quiet mono row of
// provenance (sources + how many claims are inferred). Everything below it is evidence.
import type { CSSProperties, ReactElement } from 'react';
import type { WebSource } from '../../data/conversation';
import { InferredMark } from '../../canvas/provenance';
import { renderHeroLine } from './emphasize';
import { sourceNames } from './confidence';
import './voice.css';

export function AnswerHero({
  question,
  narration,
  sources,
  inferred,
  tint,
}: {
  question: string | null;
  narration: string;
  sources: WebSource[] | undefined;
  inferred: number;
  /** The current topic thread's colour (from the session rail), shown as a small dot on the ask so
   *  the hero and the rail read as the same thread. Only supplied once a session has ≥2 threads. */
  tint?: string;
}): ReactElement | null {
  if (!narration) return null;
  const names = sourceNames(sources);
  return (
    <section
      className="answer-hero"
      aria-label="Mavéa's answer"
      style={tint ? ({ '--thread-tint': tint } as CSSProperties) : undefined}
    >
      {question && (
        <p className="hero-ask">
          {tint && <span className="hero-thread-dot" aria-hidden="true" />}You asked, “{question}”
        </p>
      )}
      <p className="hero-line voice-text">{renderHeroLine(narration)}</p>
      {(names.length > 0 || inferred > 0) && (
        <p className="hero-meta">
          {names.length > 0 && <span className="hero-sources">Sources: {names.join(' · ')}</span>}
          {inferred > 0 && <InferredMark count={inferred} />}
        </p>
      )}
    </section>
  );
}

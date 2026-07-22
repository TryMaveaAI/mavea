// AnswerCard — the one-time answer for a planTracker() call that came back "static": a settled
// fact (a mountain's height, a historical date) isn't worth a recurring check, so this is the
// single honest answer instead of a standing tracker nobody needs. Sources are real citations only
// (safeHttpUrl-gated, same discipline as LastCheckCard); when the model answered from its own
// knowledge rather than a fresh search it says so, never presenting a guess as verified. "Track it
// anyway" still exists because the planner's "this won't change" call can be wrong — the plan it
// came with always carries a usable live fallback (planTracker's coercePlan guarantees it).
import { type ReactElement } from 'react';
import type { StaticAnswer } from './planTracker';
import { safeHttpUrl } from '../../lib/sourceHost';
import './dash-composer.css';

export function AnswerCard({
  answer,
  onTrackAnyway,
}: {
  /** The one-time answer, or null when the call itself failed outright (no key, network, etc). */
  answer: StaticAnswer | null;
  onTrackAnyway: () => void;
}): ReactElement {
  if (!answer) {
    return (
      <div className="dash-answer">
        <p className="dash-answer-text dash-answer-text--fallback">
          Mavéa couldn’t reach your model for that — try tracking it instead.
        </p>
        <button type="button" className="dash-answer-track" onClick={onTrackAnyway}>
          Track it anyway →
        </button>
      </div>
    );
  }

  return (
    <div className="dash-answer">
      <p className="dash-answer-text">{answer.text}</p>
      {!answer.grounded && (
        <p className="dash-answer-qualifier">Based on background knowledge, not a fresh search.</p>
      )}
      {answer.sources.length > 0 && (
        <div className="dash-answer-sources">
          {answer.sources.map((s) => {
            const url = safeHttpUrl(s.url);
            if (!url) return null;
            return (
              <a
                key={s.url}
                className="dash-answer-source"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={s.title}
              >
                {s.title}
              </a>
            );
          })}
        </div>
      )}
      <div className="dash-answer-foot">
        <span className="dash-answer-badge">Answered once — nothing worth re-checking</span>
        <button type="button" className="dash-answer-track" onClick={onTrackAnyway}>
          Track it anyway →
        </button>
      </div>
    </div>
  );
}

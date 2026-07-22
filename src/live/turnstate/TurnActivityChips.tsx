// Transparency chips while a turn works: every external/billable action and every real
// source being read, named. Replaces the single-pill activity row — when the search
// resolves, the actual hostnames appear (real titles only, straight from the results).
import type { ReactElement } from 'react';
import type { WebSource } from '../../data/conversation';
import type { LiveActivity } from '../generateLive';
import { Icon } from '../../icons/icons';
import { hostOf } from '../../lib/sourceHost';
import './turnstate.css';

export function TurnActivityChips({
  activity,
  sources,
}: {
  activity: LiveActivity;
  /** Sources known mid-turn (the search resolved; the model is reading them now). */
  sources: WebSource[];
}): ReactElement | null {
  const reading = sources.slice(0, 3);
  const searching = activity === 'searching';
  if (!searching && reading.length === 0) return null;
  return (
    <div className="turn-chips" role="status" aria-live="polite">
      {searching && reading.length === 0 && (
        <span className="turn-chip">
          <Icon.globe /> Searching the web…
        </span>
      )}
      {reading.map((s, i) => (
        <span key={i} className="turn-chip src">
          <i className="turn-chip-dot" aria-hidden="true"></i>
          {hostOf(s.url) ?? s.title}
        </span>
      ))}
    </div>
  );
}

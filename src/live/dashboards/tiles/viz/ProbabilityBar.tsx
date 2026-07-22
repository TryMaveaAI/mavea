// A two-outcome percentage read (odds, a poll, a prediction market) as a single filled meter —
// deliberately not a pie or gauge, so it reads at the tile's small footprint at a glance.
import type { ReactElement } from 'react';

interface ProbabilityBarProps {
  pct: number;
}

export function ProbabilityBar({ pct }: ProbabilityBarProps): ReactElement {
  const clamped = Math.round(Math.min(100, Math.max(0, pct)));
  return (
    <div className="tile-prob" role="img" aria-label={`${clamped}% likely`}>
      <div className="tile-prob-track">
        <div className="tile-prob-fill" style={{ width: `${clamped}%` }} />
      </div>
      <span className="tile-prob-pct">{clamped}%</span>
    </div>
  );
}

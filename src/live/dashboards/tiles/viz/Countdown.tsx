// A one-shot scheduled check's remaining time, in the coarsest honest unit (never a negative
// countdown — a due-or-passed target just reads "due now" rather than counting into the negatives).
import type { ReactElement } from 'react';

interface CountdownProps {
  targetAt: number;
  now: number;
  label?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'due now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins ? `${hrs}h ${remMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
}

export function Countdown({ targetAt, now, label }: CountdownProps): ReactElement {
  return (
    <div className="tile-countdown">
      <span className="tile-countdown-value">{formatRemaining(targetAt - now)}</span>
      {label && <span className="tile-countdown-label">{label}</span>}
    </div>
  );
}

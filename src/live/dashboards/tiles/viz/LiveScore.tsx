// The live-event read for a dashboard whose cadence carries a bounded "match only" window — a
// progress bar across the window plus its label, so a live tile reads as "in progress, this far
// along" even before any scoreboard widget has anything to say.
import type { ReactElement } from 'react';
import type { CadenceWindow } from '../../types';

interface LiveScoreProps {
  liveWindow: CadenceWindow;
  now: number;
}

export function LiveScore({ liveWindow, now }: LiveScoreProps): ReactElement {
  const span = liveWindow.endAt - liveWindow.startAt || 1;
  const elapsed = Math.min(1, Math.max(0, (now - liveWindow.startAt) / span));
  // A window that hasn't opened yet is upcoming, not live: the red dot means exactly one thing here
  // (a window is open RIGHT NOW), and a match scheduled for tomorrow wearing it alongside an empty
  // progress bar contradicts the tile's own plain cadence chip. The label still announces it.
  const started = now >= liveWindow.startAt;
  return (
    <div className="tile-live">
      <div className="tile-live-head">
        {started && <i className="dash-live-dot" aria-hidden="true" />}
        <span className="tile-live-label">{liveWindow.label}</span>
      </div>
      <div className="tile-live-track">
        {started && <div className="tile-live-fill" style={{ width: `${elapsed * 100}%` }} />}
      </div>
    </div>
  );
}

// FeaturedLiveCard — the one dashboard currently inside its bounded live window (a match, a
// release), blown up above the tracking grid while it's actually happening. tileModel already
// gives any windowed dashboard the 'livescore' viz (the window itself is subject-agnostic — a
// progress bar, not a scoreboard read), so LiveScore is the expected case; the TrackerTile
// fallback exists only for a shape tileModel doesn't route there, so nothing is ever left blank.
import { useMemo, type ReactElement } from 'react';
import { dashHref } from './route';
import { buildTileModel } from './tiles/tileModel';
import { LiveScore } from './tiles/viz/LiveScore';
import { TrackerTile } from './tiles/TrackerTile';
import type { Dashboard } from './types';
import './dash-home.css';

export function FeaturedLiveCard({
  dashboard,
  now,
}: {
  dashboard: Dashboard;
  now: number;
}): ReactElement {
  const model = useMemo(() => buildTileModel(dashboard, now), [dashboard, now]);
  const liveWindow = dashboard.cadence.window;

  if (!liveWindow || model.vizKind !== 'livescore') {
    return (
      <div className="featured-live featured-live--fallback">
        <TrackerTile dashboard={dashboard} now={now} />
      </div>
    );
  }

  const asOf = model.everChecked ? `AS OF ${model.asOf}` : model.asOf;

  return (
    <a className="card featured-live" href={dashHref.detail(dashboard.id)}>
      <div className="featured-live-head">
        <span className="card-eyebrow featured-live-eyebrow">
          <i className="dash-live-dot" aria-hidden="true" />
          LIVE NOW
        </span>
        <h3 className="featured-live-title">{dashboard.title}</h3>
      </div>
      <LiveScore liveWindow={liveWindow} now={now} />
      <p className="featured-live-check">
        <span className="featured-live-check-label">FROM THE LAST CHECK</span>
        <span className="featured-live-check-value">{model.value}</span>
        <span className="featured-live-check-context">{model.context}</span>
      </p>
      <div className="featured-live-foot">
        {asOf} · {liveWindow.label} ONLY
      </div>
    </a>
  );
}

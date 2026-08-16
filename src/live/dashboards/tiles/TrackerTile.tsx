// dashboards/tiles/TrackerTile.tsx — one subject-shaped card in the home "TRACKING · N" grid. Purely
// presentational: all the honesty/precedence reasoning lives in tileModel.ts, this just lays the
// model out. `now` and `paused` are supplied by the caller (never read live in here) so a render is
// reproducible and this component stays ignorant of the budget/cadence machinery that decides them.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { dashHref } from '../route';
import { useDataPending } from '../dataPending';
import { Icon } from '../../../icons/icons';
import type { Dashboard } from '../types';
import { buildTileModel, type TileModel } from './tileModel';
import { AreaChart } from './viz/AreaChart';
import { Countdown } from './viz/Countdown';
import { ForecastStrip } from './viz/ForecastStrip';
import { FormChips } from './viz/FormChips';
import { LiveScore } from './viz/LiveScore';
import { ProbabilityBar } from './viz/ProbabilityBar';
import { Sparkline } from './viz/Sparkline';
import './tiles.css';

export interface TrackerTileProps {
  dashboard: Dashboard;
  now: number;
  /** The caller decides this from budget state (see budget.ts) — the tile only reflects it. */
  paused?: boolean;
}

function renderViz(model: TileModel, now: number): ReactElement | null {
  switch (model.vizKind) {
    case 'area':
      return model.history ? (
        <AreaChart points={model.history} tone={model.delta?.direction ?? 'flat'} />
      ) : null;
    case 'sparkline':
      return model.history ? <Sparkline points={model.history} /> : null;
    case 'probability':
      return model.probabilityPct !== null ? <ProbabilityBar pct={model.probabilityPct} /> : null;
    case 'countdown':
      return model.oneShotAt !== null ? (
        <Countdown targetAt={model.oneShotAt} now={now} label={model.oneShotLabel ?? undefined} />
      ) : null;
    case 'formchips':
      return <FormChips items={model.formChips} />;
    case 'forecast':
      return <ForecastStrip days={model.forecastDays} />;
    case 'livescore':
      return model.liveWindow ? <LiveScore liveWindow={model.liveWindow} now={now} /> : null;
    case 'none':
      return null;
  }
}

/** What a tapped check that came back with nothing usable says, in the detail header's own words
 *  (DashboardDetail's Refresh hints) — the home grid was ending the spinner and saying nothing at
 *  all, so a failed check looked exactly like a check that found no news. */
const CHECK_NOTE: Record<'failed' | 'unverified', string> = {
  failed: 'Couldn’t reach your model — check its key or quota, then try again.',
  unverified: 'Checked, but no source could verify new values — keeping the last real ones.',
};
/** Long enough to read once, short enough that the tile goes back to its own subject on its own. */
const CHECK_NOTE_MS = 8000;

export function TrackerTile({ dashboard, now, paused = false }: TrackerTileProps): ReactElement {
  const model = useMemo(() => buildTileModel(dashboard, now), [dashboard, now]);
  const pending = useDataPending(dashboard.id);
  // The store-backed pending flag is only set once the refresh module has been fetched and the call
  // is under way — a real gap on a cold chunk, during which the tile sat there looking untouched
  // and a second tap was swallowed as 'busy' with nothing on screen to explain it. This covers the
  // press itself, so the spinner is up from the first click onward.
  const [launching, setLaunching] = useState(false);
  const checking = pending || launching;
  const [checkNote, setCheckNote] = useState<'failed' | 'unverified' | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  const showPaused = paused && model.pauseEligible;
  const chipState: 'paused' | 'live' | 'plain' = showPaused
    ? 'paused'
    : model.isLiveWindow
      ? 'live'
      : 'plain';

  const flashNote = (note: 'failed' | 'unverified'): void => {
    setCheckNote(note);
    noteTimer.current = window.setTimeout(() => setCheckNote(null), CHECK_NOTE_MS);
  };

  // A span with role="button", not a real <button> — the whole tile is already an <a> (interactive
  // content can't nest inside interactive content), and this stays reachable + activatable exactly
  // like a button (click, Enter, Space) without breaking that or the tile's own click-to-open area.
  // useDashboardLoop is dynamically imported here (not at module top) — the home grid is eagerly
  // mounted with DashboardsApp, and that module's refresh/provider chain must stay out of its
  // chunk (tests/eager-bundle.test.ts) until a check is actually requested. Of the outcomes it can
  // return, only 'failed'/'unverified' need a word here: 'no-model' has the home connect banner,
  // and 'busy' means a pass this tile is already part of is running — the spinner is its answer.
  const checkNow = (e: { preventDefault(): void; stopPropagation(): void }): void => {
    e.preventDefault();
    e.stopPropagation();
    if (checking) return;
    window.clearTimeout(noteTimer.current);
    setCheckNote(null);
    setLaunching(true);
    void import('../useDashboardLoop')
      .then(({ refreshDashboardNow }) => refreshDashboardNow(dashboard.id))
      .then((outcome) => {
        if (outcome === 'failed' || outcome === 'unverified') flashNote(outcome);
      })
      // A chunk that never loads is a check that never happened — say so, rather than leaving an
      // unhandled rejection and a tile that looks untouched.
      .catch(() => flashNote('failed'))
      .finally(() => setLaunching(false));
  };

  return (
    <a
      className="tile-frame"
      href={dashHref.detail(dashboard.id)}
      data-tile-state={chipState === 'plain' ? undefined : chipState}
    >
      <div className="tile-top">
        <span className="tile-name" title={model.name}>
          {model.name}
        </span>
        <span className={`tile-cadence tile-cadence--${chipState}`}>
          {chipState === 'live' && <i className="dash-live-dot" aria-hidden="true" />}
          {showPaused ? 'PAUSED' : model.cadenceLabel}
        </span>
      </div>

      <div className="tile-value-row">
        <span className={`tile-value${checking ? ' tile-value--checking' : ''}`}>
          {model.value}
        </span>
        {model.delta && (
          <span className={`tile-delta tile-delta--${model.delta.direction}`}>
            {model.delta.text}
          </span>
        )}
      </div>
      <p className={`tile-context${!checking && checkNote ? ' tile-context--note' : ''}`}>
        {checking ? 'Checking for live data…' : checkNote ? CHECK_NOTE[checkNote] : model.context}
      </p>

      <div className="tile-viz">{renderViz(model, now)}</div>

      <div className="tile-foot">
        <span className="tile-asof">{model.everChecked ? `AS OF ${model.asOf}` : model.asOf}</span>
        <span
          role="button"
          tabIndex={0}
          className={`tile-check${checking ? ' is-checking' : ''}`}
          aria-label={`Check ${model.name} now`}
          aria-disabled={checking}
          title="Check now"
          onClick={checkNow}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') checkNow(e);
          }}
        >
          <Icon.refresh className={checking ? 'dash-refresh-spin' : undefined} />
        </span>
      </div>
    </a>
  );
}

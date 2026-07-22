// dashboards/tiles/TrackerTile.tsx — one subject-shaped card in the home "TRACKING · N" grid. Purely
// presentational: all the honesty/precedence reasoning lives in tileModel.ts, this just lays the
// model out. `now` and `paused` are supplied by the caller (never read live in here) so a render is
// reproducible and this component stays ignorant of the budget/cadence machinery that decides them.
import { useMemo, type ReactElement } from 'react';
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

export function TrackerTile({ dashboard, now, paused = false }: TrackerTileProps): ReactElement {
  const model = useMemo(() => buildTileModel(dashboard, now), [dashboard, now]);
  const checking = useDataPending(dashboard.id);

  const showPaused = paused && model.pauseEligible;
  const chipState: 'paused' | 'live' | 'plain' = showPaused
    ? 'paused'
    : model.isLiveWindow
      ? 'live'
      : 'plain';

  // A span with role="button", not a real <button> — the whole tile is already an <a> (interactive
  // content can't nest inside interactive content), and this stays reachable + activatable exactly
  // like a button (click, Enter, Space) without breaking that or the tile's own click-to-open area.
  // useDashboardLoop is dynamically imported here (not at module top) — the home grid is eagerly
  // mounted with DashboardsApp, and that module's refresh/provider chain must stay out of its
  // chunk (tests/eager-bundle.test.ts) until a check is actually requested.
  const checkNow = (e: { preventDefault(): void; stopPropagation(): void }): void => {
    e.preventDefault();
    e.stopPropagation();
    if (checking) return;
    void import('../useDashboardLoop').then(({ refreshDashboardNow }) =>
      refreshDashboardNow(dashboard.id),
    );
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
      <p className="tile-context">{checking ? 'Checking for live data…' : model.context}</p>

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

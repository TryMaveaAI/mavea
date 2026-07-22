// DashTopBar — the Dashboards surface's top bar: a way home, the app-nav cluster (the same Explore
// menu + ⌘K feature search Live leads with, so the rest of the app is reachable in place rather
// than only by leaving through Live), an at-a-glance "how many dashboards are live right now" pill,
// the daily search-budget meter, and the board/theme controls every surface carries.
import { useEffect, useState, type ReactElement } from 'react';
import { useDashboards } from './useDashboards';
import { useLedger } from './useLedger';
import { useDashSettings, budgetState, type BudgetState } from './budget';
import { hasLiveContent } from './format';
import { dashHref, type DashView } from './route';
import { BrandMark } from '../../components/BrandMark';
import { homeTarget } from '../../lib/homeTarget';
import { AppMenuBar } from '../../nav/AppMenuBar';
import { TemplatePicker } from '../TemplatePicker';
import type { Dashboard } from './types';
import './dash-home.css';

function isLiveWindowNow(d: Dashboard, now: number): boolean {
  const w = d.cadence.window;
  return !!w && now >= w.startAt && now <= w.endAt;
}

function formatResumeTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function BudgetMeter({ state }: { state: BudgetState }): ReactElement {
  if (state.paused) {
    return (
      <div
        className="dash-budget dash-budget--paused"
        title="Automatic checks are paused until your budget resets"
      >
        <span className="dash-budget-label">
          PAUSED · RESUMES {formatResumeTime(state.resumesAt)}
        </span>
      </div>
    );
  }
  const pct = state.cap > 0 ? Math.min(100, Math.round((state.used / state.cap) * 100)) : 0;
  return (
    <div
      className={'dash-budget' + (state.amber ? ' dash-budget--amber' : '')}
      title={`${state.used} of ${state.cap} searches used today`}
    >
      <span className="dash-budget-track">
        <span className="dash-budget-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="dash-budget-label">
        {state.used}/{state.cap} SEARCHES TODAY{state.amber ? ' · LOW' : ''}
      </span>
    </div>
  );
}

export function DashTopBar({ view }: { view: DashView }): ReactElement {
  const dashboards = useDashboards();
  const entries = useLedger();
  const settings = useDashSettings();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const onWatch = dashboards.filter(hasLiveContent).length;
  const anyLiveNow = dashboards.some((d) => isLiveWindowNow(d, now));
  const budget = budgetState(entries, settings.dailySearchBudget, now);

  return (
    <header className="dash-topbar">
      <BrandMark className="dash-topbar-brand" href={homeTarget().href} />
      <div className="dash-topbar-scroll">
        <span className={'dash-watch-pill' + (anyLiveNow ? ' dash-watch-pill--live' : '')}>
          <i className="dash-live-dot" aria-hidden="true" />
          {onWatch} ON WATCH
        </span>
        <BudgetMeter state={budget} />
        {view !== 'overview' && (
          <a className="dash-topbar-link" href={dashHref.overview}>
            How it works
          </a>
        )}
        <a className="dash-topbar-link" href="#/live">
          Live
        </a>
      </div>
      <span className="topbar-spacer" />
      {/* The rest of the app, reachable in place — the same Create · Practice · Share · Explore
          menus + ⌘K feature search Live leads with, right-aligned before the controls exactly as
          Live places its menus, so a dashboard is no longer a dead-end you leave through Live. */}
      <nav className="dash-topbar-nav" aria-label="App">
        <AppMenuBar omitHash={dashHref.gallery} />
      </nav>
      <span className="topbar-divider" aria-hidden="true" />
      <div className="dash-topbar-tools">
        <a className="dash-topbar-action" href={dashHref.rewind}>
          ✦ Rewind
        </a>
        <a className="dash-topbar-action" href={dashHref.present}>
          ▸ Present
        </a>
        <TemplatePicker triggerClassName="ctrl" />
      </div>
    </header>
  );
}

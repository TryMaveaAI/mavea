// DashboardHome — the #/dashboards home surface: today's briefing (if any), the one dashboard
// currently mid live-window (if any), the "TRACKING · N" grid, the check-log rail, and the
// always-available "track anything" composer. Per-dashboard delete lives on Settings only, so
// this reads purely, no armed/confirm state of its own.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useDashboards } from './useDashboards';
import { useLedger } from './useLedger';
import { useBriefing } from './briefing';
import { useDashSettings, budgetState } from './budget';
import { BriefingHero } from './BriefingHero';
import { FeaturedLiveCard } from './FeaturedLiveCard';
import { CheckLogRail } from './CheckLogRail';
import { TrackComposer } from './TrackComposer';
import { TrackerTile } from './tiles/TrackerTile';
import { DashToast } from './DashToast';
import { onTripwireToast, type TripwireToastDetail } from './dashboardEvents';
import { hasLiveContent } from './format';
import { useLiveConfig, hasModelConfigured } from '../useLiveConfig';
import { Icon } from '../../icons/icons';
import { dashHref } from './route';
import type { Dashboard } from './types';
import './dashboards.css';
import './dash-home.css';

const EXAMPLES = ['AAPL price', 'Yankees scores', 'Weather in Denver', 'Bitcoin price'];

function isLiveWindowNow(d: Dashboard, now: number): boolean {
  const w = d.cadence.window;
  return !!w && now >= w.startAt && now <= w.endAt;
}

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function GhostTile({ eyebrow, sub }: { eyebrow: string; sub: string }): ReactElement {
  return (
    <div className="tile-frame tile-frame--ghost" aria-hidden="true">
      <div className="tile-top">
        <span className="tile-name">{eyebrow}</span>
        <span className="tile-cadence">EXAMPLE</span>
      </div>
      <div className="tile-value-row">
        <span className="tile-value">—</span>
      </div>
      <p className="tile-context">{sub}</p>
    </div>
  );
}

function EmptyHero(): ReactElement {
  return (
    <div className="card dash-empty dash-empty--hero">
      <p className="dash-empty-title">Nothing on watch yet.</p>
      <p className="dash-empty-how">
        Type anything worth following in the bar below — scores, a price, the weather, a story — and
        Mavéa plans the live cards and keeps them current. Or talk it through in{' '}
        <a href="#/live">Live</a> and build one from that conversation instead.
      </p>
      <p className="dash-empty-how">
        New here? <a href={dashHref.overview}>See how it works →</a>
      </p>
      <div className="dash-home-examples">
        {EXAMPLES.map((ex) => (
          <span key={ex} className="dash-home-example-chip">
            {ex}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardHome(): ReactElement {
  const dashboards = useDashboards();
  const ledger = useLedger();
  const settings = useDashSettings();
  const briefing = useBriefing();
  const [liveCfg] = useLiveConfig();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const featured = useMemo(
    () => dashboards.find((d) => isLiveWindowNow(d, now)) ?? null,
    [dashboards, now],
  );
  const showBriefing = briefing !== null && briefing.date === todayISO(now);
  const budget = useMemo(
    () => budgetState(ledger, settings.dailySearchBudget, now),
    [ledger, settings.dailySearchBudget, now],
  );

  const isEmpty = dashboards.length === 0;
  const anyLiveContent = useMemo(() => dashboards.some(hasLiveContent), [dashboards]);
  const modelReady = hasModelConfigured(liveCfg);

  const [toast, setToast] = useState<TripwireToastDetail | null>(null);
  useEffect(() => onTripwireToast(setToast), []);

  // Manual is the default cadence everywhere now, so "check all" is the everyday way anything
  // populates — same routine + budget-exempt billing as a single tile's own "Check now".
  // useDashboardLoop is dynamically imported here, not at module top: this Home surface is
  // eagerly mounted with DashboardsApp, and that module's refresh/provider chain must stay out
  // of its chunk (tests/eager-bundle.test.ts) until a check is actually requested.
  const [checkingAll, setCheckingAll] = useState(false);
  const handleCheckAll = async (): Promise<void> => {
    setCheckingAll(true);
    try {
      const { checkAllDashboardsNow } = await import('./useDashboardLoop');
      await checkAllDashboardsNow();
    } finally {
      setCheckingAll(false);
    }
  };

  // The hero and composer are the useful first paint. The tracking grid and activity rail are
  // independent secondary regions; mounting both in that same commit made Chromium do one large
  // cold-layout task on weak CPUs. Stage them over the next two frames so the page becomes
  // interactive sooner without placeholders, fake values, or a changed final UI.
  const [secondaryStage, setSecondaryStage] = useState(0);
  useEffect(() => {
    let first = 0;
    let second = 0;
    first = requestAnimationFrame(() => {
      setSecondaryStage(1);
      second = requestAnimationFrame(() => setSecondaryStage(2));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  return (
    <div className="dash-home">
      {toast && (
        <DashToast
          key={`${toast.dashboardId}-${toast.tripwireLabel}`}
          kind="danger"
          message={`${toast.dashboardTitle}: ${toast.tripwireLabel} crossed the line you set.`}
          href={dashHref.detail(toast.dashboardId)}
          onDismiss={() => setToast(null)}
        />
      )}
      <div className="dash-home-grid">
        <div className="dash-home-main">
          {!isEmpty && !modelReady && anyLiveContent && (
            <div className="dash-connect-banner">
              <span className="dash-connect-banner-text">
                These trackers can't fetch anything yet — connect a model to start filling them.
              </span>
              <a className="dash-connect-banner-link" href="#/live">
                Connect a model in Live →
              </a>
            </div>
          )}
          {isEmpty ? (
            <EmptyHero />
          ) : (
            <>
              {showBriefing && briefing && <BriefingHero briefing={briefing} />}
              {featured && <FeaturedLiveCard dashboard={featured} now={now} />}
            </>
          )}
          {secondaryStage >= 1 && (
            <section className="dash-track">
              <div className="dash-track-head">
                <span className="dash-track-eyebrow">TRACKING · {dashboards.length}</span>
                <div className="dash-track-head-right">
                  <span className="dash-track-honesty">
                    NOT REAL-TIME — EVERY VALUE IS AS OF ITS LAST WEB SEARCH
                  </span>
                  {modelReady && anyLiveContent && (
                    <button
                      type="button"
                      className="dash-check-all-btn"
                      onClick={() => void handleCheckAll()}
                      disabled={checkingAll}
                      title="Check every tracker with live content now"
                    >
                      <Icon.refresh className={checkingAll ? 'dash-refresh-spin' : undefined} />
                      {checkingAll ? 'Checking…' : 'Check all'}
                    </button>
                  )}
                </div>
              </div>
              <div className="dash-track-grid">
                {isEmpty ? (
                  <>
                    <GhostTile eyebrow="AAPL" sub="Stock price" />
                    <GhostTile eyebrow="Yankees" sub="Latest score" />
                    <GhostTile eyebrow="Denver" sub="This week's forecast" />
                  </>
                ) : (
                  dashboards.map((d) => (
                    <TrackerTile key={d.id} dashboard={d} now={now} paused={budget.paused} />
                  ))
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="dash-home-rail">{secondaryStage >= 2 && <CheckLogRail />}</aside>
      </div>
      <TrackComposer />
    </div>
  );
}

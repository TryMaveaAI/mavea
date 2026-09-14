// DashboardDetail — one dashboard: the honest clocked header, the giant headline read, Mavéa's own
// narrative on the last check, the ordered widget grid, this dashboard's own check log, cadence +
// alert controls, and the talk-to-dashboard panel. Edit mode turns each tile into a reorder target
// (pointer + keyboard) with an S/M/L size control and a remove button, plus an add-widget palette —
// and, while active, simplifies the whole page down to just the grid so rearranging tiles isn't
// fighting narrative chrome shifting around it. Live-updating over the store, so a background
// refresh or an edit reflects immediately. Settings + Share land from the header.
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useDashboards } from './useDashboards';
import { useWidgetReorder } from './useWidgetReorder';
import { removeWidget, setWidgetOrder, setWidgetSpan } from './store';
import { readDashboardNow, refreshDashboardNow, useDataPending } from './useDashboardLoop';
import { useLiveConfig } from '../useLiveConfig';
import {
  searchBlockCta,
  searchBlockHref,
  searchBlockLine,
  searchReadiness,
  type SearchBlock,
} from './searchReadiness';
import { preloadBlockFamilies } from '../../canvas/blocks/loader';
import { WidgetTile } from './WidgetTile';
import { AddWidgetPalette } from './AddWidgetPalette';
import { MetricFill } from './MetricFill';
import { TalkToDashboard } from './TalkToDashboard';
import { DetailHero } from './DetailHero';
import { RememberKeyNudge } from './RememberKeyNudge';
import { LastCheckCard } from './LastCheckCard';
import { CadenceCard } from './CadenceCard';
import { AlertCard } from './AlertCard';
import { CheckLogRail } from './CheckLogRail';
import { CheckRunPanel } from './CheckRunPanel';
import { recordOpen } from './opens';
import { dataStatusLine, hasLiveContent } from './format';
import { dashHref } from './route';
import { Icon } from '../../icons/icons';
import type { WidgetSpan } from './types';
import './dashboards.css';

const SPAN_LABEL: Record<WidgetSpan, string> = { 1: 'S', 2: 'M', 3: 'L' };

/** What the last press of a header action did. `running` is this page's own press still in
 *  flight; every other value is the routine's own terminal answer, kept verbatim rather than
 *  collapsed into `idle`. A press whose outcome resolves to nothing on screen is exactly the
 *  "the buttons don't do anything" report — 'done' and 'busy' used to land there. */
type ActionState = 'idle' | 'running' | 'done' | 'busy' | SearchBlock | 'failed' | 'unverified';

export function DashboardDetail({ id }: { id: string }): ReactElement {
  const dashboards = useDashboards();
  const dashboard = useMemo(() => dashboards.find((d) => d.id === id) ?? null, [dashboards, id]);
  const [editing, setEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const widgetIds = useMemo(() => dashboard?.widgets.map((w) => w.id) ?? [], [dashboard]);
  const reorder = useWidgetReorder(
    widgetIds,
    (next) => dashboard && setWidgetOrder(dashboard.id, next),
  );
  const byId = useMemo(
    () => new Map((dashboard?.widgets ?? []).map((w) => [w.id, w])),
    [dashboard],
  );

  // WidgetTile mounts a fresh, isolated TopicCanvas per tile with no lead time to preload —
  // unlike a Live turn, which kicks off preloadBlockFamilies while the answer is still streaming
  // (useLiveTurn.ts) so the family is already loaded by the time TopicCanvas mounts. Without this,
  // a widget whose block type's family has never loaded in this session (any extended-library type
  // beyond the couple of core ones the switch handles directly) renders as a permanently empty tile:
  // useBlockFamilies' own reactive load-on-mount effect exists as a fallback, but nothing here ever
  // exercises it early enough for the "reveal together" grid gate to unblock on first paint.
  useEffect(() => {
    if (dashboard) preloadBlockFamilies(dashboard.widgets.map((w) => w.block));
  }, [dashboard]);

  // Distinct from the preload effect above, and deliberately keyed on the id alone (not the whole
  // `dashboard` object, which gets a fresh reference on every background refresh): opens.ts feeds
  // the cadence optimizer's "you check this hourly but only opened it twice this week" rule, so it
  // must fire once per genuine navigation to a dashboard's detail page, never once per store write.
  const dashboardId = dashboard?.id;
  useEffect(() => {
    if (dashboardId) recordOpen(dashboardId);
  }, [dashboardId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const [liveCfg] = useLiveConfig();
  const dataChecking = useDataPending(dashboard?.id ?? '');

  // Manual refresh: the only way to update a dashboard on 'manual' cadence (its clock never
  // comes due on its own), and a way to force a fresher read on any other cadence without
  // waiting it out. Shares the exact same routine + billing gate as the automatic loop.
  const [refreshState, setRefreshState] = useState<ActionState>('idle');
  const handleRefresh = async (dashboardId: string): Promise<void> => {
    setRefreshState('running');
    setRefreshState(await refreshDashboardNow(dashboardId));
  };

  // On-demand AI read: fires analyzeMove directly (bypassing the automatic gate) so the user can
  // always see Mavéa's take on the latest numbers land in the card below — no thesis required.
  const [readState, setReadState] = useState<ActionState>('idle');
  const handleRead = async (dashboardId: string): Promise<void> => {
    setReadState('running');
    setReadState(await readDashboardNow(dashboardId));
  };

  if (!dashboard) {
    return (
      <div className="dash-detail">
        <div className="dash-empty">
          <p className="dash-empty-title">That dashboard isn’t here.</p>
          <p className="dash-empty-how">
            It may have been removed. <a href={dashHref.gallery}>Back to your dashboards →</a>
          </p>
        </div>
      </div>
    );
  }

  // What stands between this board and a check: either button's own last answer, or — before any
  // press — the current connection, judged the same way the loop judges it. Both buttons gate on
  // the SAME readiness, so this is one reason for the pair, not one each: printing it twice was
  // what made a sentence about the toolbar read as a label on whichever button it landed beside.
  const readiness = searchReadiness(liveCfg);
  const lastBlock = [refreshState, readState].find(
    (state): state is SearchBlock => state === 'no-model' || state === 'search-off',
  );
  const blocked =
    lastBlock ??
    (!readiness.ok && (hasLiveContent(dashboard) || dashboard.metrics.length > 0)
      ? readiness.reason
      : null);
  // Everything the toolbar has to say, in one place under the buttons instead of wedged between
  // them. A press that cannot go through changes nothing else on screen, so the row is a live
  // region: "nothing happened" is exactly the report this is here to prevent.
  const notices: ReactNode[] = [];
  if (blocked)
    notices.push(
      <p className="dash-detail-notice" key="blocked">
        {searchBlockLine(blocked)} <a href={searchBlockHref(blocked)}>{searchBlockCta(blocked)}</a>
      </p>,
    );
  if (refreshState === 'failed' || readState === 'failed')
    notices.push(
      <p className="dash-detail-notice" key="failed">
        Couldn’t reach your model — check its key or quota, then try again.
      </p>,
    );
  if (refreshState === 'unverified')
    notices.push(
      <p className="dash-detail-notice" key="unverified">
        Checked, but no source could verify new values — keeping the last real ones.
      </p>,
    );
  // A press that WORKED has to say so too. Both actions can finish without moving a pixel — a
  // check whose values came back unchanged, a read that lands in a card below the fold — and
  // silence after a deliberate press is indistinguishable from a dead button.
  if (refreshState === 'done')
    notices.push(
      <p className="dash-detail-notice is-good" key="refreshed">
        Checked. Anything that moved is updated below.
      </p>,
    );
  if (readState === 'done')
    notices.push(
      <p className="dash-detail-notice is-good" key="read">
        Mavéa’s take on the latest values is below.
      </p>,
    );
  // 'busy' is the routine refusing because this board is ALREADY mid-check — the background loop
  // holds it, or the other button does. Nothing is lost and nothing needs pressing again.
  if (refreshState === 'busy' || readState === 'busy')
    notices.push(
      <p className="dash-detail-notice" key="held">
        This board is already being checked — the result will land on its own.
      </p>,
    );

  const cycleSpan = (widgetId: string, span: WidgetSpan): void => {
    setWidgetSpan(dashboard.id, widgetId, (span >= 3 ? 1 : span + 1) as WidgetSpan);
  };

  const tiles: ReactNode[] = reorder.order.map((wid) => {
    const w = byId.get(wid);
    if (!w) return null;
    // A user-supplied metric (its value is yours to give) gets an inline fill control.
    const fillMetric = w.metricId ? dashboard.metrics.find((m) => m.id === w.metricId) : null;
    const fill =
      !editing && fillMetric?.blankKey ? (
        <MetricFill dashboardId={dashboard.id} metric={fillMetric} />
      ) : undefined;
    return (
      <WidgetTile
        key={w.id}
        dashboard={dashboard}
        widget={w}
        editing={editing}
        dragging={reorder.draggingId === w.id}
        footer={fill}
      >
        {editing && (
          <div className="dash-tile-chrome">
            <span className="dash-tile-handle" {...reorder.handleProps(w.id)}>
              ⠿
            </span>
            <div className="dash-tile-ctrls">
              <button
                type="button"
                className="dash-tile-size"
                onClick={() => cycleSpan(w.id, w.span)}
                title="Resize"
              >
                {SPAN_LABEL[w.span]}
              </button>
              <button
                type="button"
                className="dash-tile-x"
                onClick={() => removeWidget(dashboard.id, w.id)}
                aria-label="Remove widget"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </WidgetTile>
    );
  });

  return (
    <div className="dash-detail">
      <header className="dash-detail-head">
        <a className="dash-back" href={dashHref.gallery} aria-label="Back to dashboards">
          ←
        </a>
        <span className="dash-detail-title">{dashboard.title}</span>
        {dashboard.question && (
          <span className="dash-detail-q" title={dashboard.question}>
            “{dashboard.question}”
          </span>
        )}
        <span className="dash-detail-clock">
          <i className="dash-live-dot" />
          {dataChecking ? 'checking for new data…' : dataStatusLine(dashboard, now)}
          {!dataChecking && hasLiveContent(dashboard) && dashboard.cadence.data !== 'manual'
            ? ' · refreshes while open'
            : ''}
        </span>
        <button
          type="button"
          className="dash-edit-btn dash-refresh-btn"
          onClick={() => void handleRefresh(dashboard.id)}
          disabled={refreshState === 'running' || blocked !== null}
          title={
            blocked
              ? searchBlockLine(blocked)
              : 'Search the web for today’s values and update the tiles, regardless of cadence'
          }
        >
          <Icon.refresh className={refreshState === 'running' ? 'dash-refresh-spin' : undefined} />
          {refreshState === 'running' ? 'Checking…' : 'Check for new values'}
        </button>
        {dashboard.metrics.length > 0 && (
          <button
            type="button"
            className="dash-edit-btn dash-read-btn"
            onClick={() => void handleRead(dashboard.id)}
            disabled={readState === 'running' || blocked !== null}
            title={
              blocked
                ? searchBlockLine(blocked)
                : 'Ask Mavéa what the latest values mean — a written take, not new numbers'
            }
          >
            <Icon.sparkle className={readState === 'running' ? 'dash-refresh-spin' : undefined} />
            {readState === 'running' ? 'Thinking…' : 'Ask what it means'}
          </button>
        )}
        <button
          type="button"
          className={'dash-edit-btn' + (editing ? ' is-active' : '')}
          onClick={() => {
            setEditing((e) => !e);
            setPaletteOpen(false);
          }}
        >
          {editing ? 'Done' : 'Edit layout'}
        </button>
        <a
          className="dash-gear"
          href={dashHref.settings(dashboard.id)}
          aria-label="Dashboard settings"
          title="Settings"
        >
          ⚙
        </a>
        {notices.length > 0 && (
          <div className="dash-detail-notices" role="status">
            {notices}
          </div>
        )}
      </header>

      {!editing && <RememberKeyNudge dashboard={dashboard} />}
      {!editing && <DetailHero dashboard={dashboard} now={now} checking={dataChecking} />}
      {!editing && <LastCheckCard dashboard={dashboard} now={now} />}

      {editing && (
        <div className="dash-edit-bar">
          <span className="dash-edit-hint">
            Drag a tile by its <strong>⠿</strong> handle to reorder, tap <strong>S/M/L</strong> to
            resize, <strong>×</strong> to remove.
          </span>
          <button
            type="button"
            className="dash-edit-add"
            onClick={() => setPaletteOpen((o) => !o)}
            aria-expanded={paletteOpen}
          >
            + Add widget
          </button>
          {paletteOpen && (
            <AddWidgetPalette dashboard={dashboard} onClose={() => setPaletteOpen(false)} />
          )}
        </div>
      )}

      {editing ? (
        <div className="dash-grid">{tiles}</div>
      ) : (
        <div className="dash-detail-cols">
          <div className="dash-detail-main">
            {dashboard.widgets.length > 0 && (
              <div className="dash-detail-section">
                <div className="card-eyebrow dash-detail-section-title">Cards</div>
                <div className="dash-grid">{tiles}</div>
              </div>
            )}
            <CheckLogRail dashboardId={dashboard.id} now={now} />
            <CheckRunPanel dashboardId={dashboard.id} />
          </div>
          <div className="dash-detail-side">
            <CadenceCard dashboard={dashboard} now={now} />
            <AlertCard dashboard={dashboard} />
          </div>
        </div>
      )}

      {/* Keyed by dashboard id: this detail view isn't remounted on navigation (same route component,
          just a new `dashboard` prop), so without a key the talk transcript from the PREVIOUS
          dashboard would still be showing under this one. */}
      {!editing && <TalkToDashboard key={dashboard.id} dashboard={dashboard} />}
    </div>
  );
}

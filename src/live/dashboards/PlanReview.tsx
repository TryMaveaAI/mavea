// PlanReview — the shared "review a planned tracker before it goes live" sheet: toggle which
// metrics/cards survive, rename the dashboard, see the cadence and an honest search-volume
// estimate, then create — or fold into a dashboard relate.ts flags as a plausible match. Lifted
// out of NewFromTemplate so the home composer's plan step and the older template modal's plan step
// render from one place instead of drifting apart. Pure UI + assembly glue: the actual plan→
// Dashboard shape comes from templates/instantiate.ts, unchanged.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { relatedDashboard } from './relate';
import {
  foldTemplateIntoDashboard,
  newDashboardFromTemplate,
  planToTemplate,
} from './templates/instantiate';
import { addDashboard, ensureFirstCheck } from './store';
import { boardIds, confirmFailureMessage, confirmRealData, CONFIRM_WAIT_NOTE } from './confirmAdd';
import { estimateSearchesPerMonth } from './cadence';
import type { Dashboard, DataCadenceMode } from './types';
import type { TrackerPlan } from './planTracker';
import './dashboards.css';
import './dash-composer.css';

const CADENCE_LABEL: Record<DataCadenceMode, string> = {
  '15min': 'checks every 15 minutes while open',
  hourly: 'checks hourly while open',
  '6h': 'checks every 6 hours while open',
  daily: 'checks daily while open',
  manual: 'refreshes only when you ask',
};

function toggleAt(flags: boolean[], i: number): boolean[] {
  const next = [...flags];
  next[i] = !next[i];
  return next;
}

export interface PlanReviewProps {
  /** The planned tracker to review — read-only; a rename only touches the local name field until
   *  create time. */
  plan: TrackerPlan;
  /** The user's own words this plan came from — carries into the created dashboard's `question`
   *  and into the fold-match text below. */
  ask: string;
  /** Existing dashboards to check for a plausible fold-target. */
  existing: Dashboard[];
  /** A dashboard was created or folded into (already persisted, first refresh already kicked) —
   *  the caller decides what happens next (navigate, close the sheet, etc). */
  onDone: (dashboardId: string) => void;
}

export function PlanReview({ plan, ask, existing, onDone }: PlanReviewProps): ReactElement {
  const [name, setName] = useState(plan.title);
  const [metricOn, setMetricOn] = useState<boolean[]>(() => plan.metrics.map(() => true));
  const [widgetOn, setWidgetOn] = useState<boolean[]>(() => plan.widgets.map(() => true));
  const [matched, setMatched] = useState<Dashboard | null>(null);
  // Manual is the default everywhere now — the planner's own suggestion is offered, never
  // silently applied, so the estimate below only ever grows past zero when the user opts in.
  const [cadence, setCadence] = useState<DataCadenceMode>('manual');

  const keptCount = metricOn.filter(Boolean).length + widgetOn.filter(Boolean).length;
  const searchesPerMonth = estimateSearchesPerMonth(cadence);

  // The add-time reality gate: the first read runs BEFORE the board is handed over, and an
  // addition whose probe can't ground gets rolled back with an honest line — a tile only joins
  // the board once a real search has returned real data.
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  // The host sheet stays dismissible while the probe runs, so the post-await continuation checks
  // it's still wanted — onDone navigates, and navigating a user who closed this and moved on
  // reads as haunted. The probe settles either way (confirm or roll back).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const create = async (): Promise<void> => {
    if (keptCount === 0 || confirming) return;
    const template = planToTemplate(plan);
    // Widget toggles index the template's widget array: one metric card per metric FIRST (those
    // follow their metric's own toggle), then the plan's rich widgets in order.
    const widgets = [...plan.metrics.map(() => true), ...widgetOn];
    const dash = newDashboardFromTemplate(template, ask.trim(), {
      toggles: { metrics: metricOn, widgets },
      cadence: { data: cadence, ai: 'manual' },
    });
    const title = name.trim() || dash.title;
    dash.title = title;
    dash.question = ask.trim();
    addDashboard(dash);
    // Hand the board over IMMEDIATELY and let the probe run behind it. The gate used to hold this
    // sheet open for the length of a real web search — routinely 30-60s, and longer once the
    // failed-probe retries were added — while the thing the user had just described sat finished
    // and invisible underneath. Creation is now instant because it no longer needs the probe's
    // answer to be honest: the board opens `pending`, showing that nothing is verified yet, and
    // the check fills it in or says why. The probe still runs, still refuses to confirm on
    // nothing, and still writes its outcome to the check log — it just does not block the door.
    onDone(dash.id);
    void confirmRealData(dash.id, null);
  };

  const fold = async (target: Dashboard): Promise<void> => {
    if (confirming) return;
    const before = boardIds(target);
    foldTemplateIntoDashboard(target, planToTemplate(plan), ask.trim());
    // Unlike create(), foldTemplateIntoDashboard doesn't arm a first-check itself — a fold into a
    // manual/parked existing board would otherwise never fetch what it just added.
    ensureFirstCheck(target.id);
    setConfirming(true);
    setConfirmErr(null);
    const outcome = await confirmRealData(target.id, before);
    if (!alive.current) return;
    setConfirming(false);
    if (outcome !== 'confirmed') {
      setConfirmErr(confirmFailureMessage(outcome, false));
      return;
    }
    onDone(target.id);
  };

  // A planned tracker can look a lot like a dashboard you already have (the same ticker, the same
  // team) — check before creating a duplicate, but never fold silently; the user always gets an
  // explicit choice.
  const attemptCreate = (): void => {
    const match = relatedDashboard(existing, { text: `${plan.title} ${ask}` });
    if (match) {
      setMatched(match);
      return;
    }
    void create();
  };

  if (matched) {
    return (
      <div className="tpl-interstitial">
        <p className="tpl-interstitial-text">
          This looks related to your existing “{matched.title}” dashboard — fold this in instead of
          creating a new one?
        </p>
        <div className="tpl-interstitial-actions">
          <button
            type="button"
            className="tpl-fold-btn"
            disabled={confirming}
            onClick={() => void fold(matched)}
          >
            {confirming ? 'Confirming live data…' : `Fold into “${matched.title}”`}
          </button>
          <button
            type="button"
            className="tpl-create-anyway"
            disabled={confirming}
            onClick={() => void create()}
          >
            Create new anyway
          </button>
        </div>
        {confirming && <p className="tpl-cadence-note">{CONFIRM_WAIT_NOTE}</p>}
        {confirmErr && <p className="tpl-cadence-note">{confirmErr}</p>}
      </div>
    );
  }

  return (
    <div className="tpl-form">
      <label className="tpl-field">
        <span className="xt-section-label">Dashboard name</span>
        <input
          className="xt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Dashboard name"
        />
      </label>

      {plan.metrics.length > 0 && (
        <div className="tpl-chip-group">
          <span className="xt-section-label">Numbers to watch</span>
          <div className="tpl-chips">
            {plan.metrics.map((m, i) => (
              <ToggleChip
                key={`m${i}`}
                kind="METRIC"
                label={m.label}
                detail={m.query}
                on={metricOn[i] ?? true}
                onToggle={() => setMetricOn((s) => toggleAt(s, i))}
              />
            ))}
          </div>
        </div>
      )}

      {plan.widgets.length > 0 && (
        <div className="tpl-chip-group">
          <span className="xt-section-label">Live cards</span>
          <div className="tpl-chips">
            {plan.widgets.map((w, i) => (
              <ToggleChip
                key={`w${i}`}
                kind="CARD"
                label={w.query}
                detail={w.blockType}
                on={widgetOn[i] ?? true}
                onToggle={() => setWidgetOn((s) => toggleAt(s, i))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="tpl-chip-group">
        <span className="xt-section-label">How often</span>
        <div className="tpl-chips">
          <button
            type="button"
            className={`tpl-chip xt-comp--goal${cadence === 'manual' ? '' : ' tpl-chip-off'}`}
            aria-pressed={cadence === 'manual'}
            onClick={() => setCadence('manual')}
          >
            <span className="tpl-chip-label">Manual — only when you ask</span>
          </button>
          {plan.cadence !== 'manual' && (
            <button
              type="button"
              className={`tpl-chip xt-comp--metric${cadence === plan.cadence ? '' : ' tpl-chip-off'}`}
              aria-pressed={cadence === plan.cadence}
              onClick={() => setCadence(plan.cadence)}
              title={CADENCE_LABEL[plan.cadence]}
            >
              <span className="tpl-chip-label">Suggested — {CADENCE_LABEL[plan.cadence]}</span>
            </button>
          )}
        </div>
      </div>

      <p className="dash-plan-estimate">
        {searchesPerMonth > 0
          ? `≈ ${searchesPerMonth} searches/mo on your key, at this cadence.`
          : 'No standing searches — this refreshes only when you ask.'}
      </p>

      <div className="xt-build-row">
        <span className="tpl-cadence-note">{CADENCE_LABEL[cadence]}</span>
        <button
          type="button"
          className="tpl-create"
          onClick={attemptCreate}
          disabled={keptCount === 0 || confirming}
        >
          {confirming ? 'Confirming live data…' : 'Create dashboard →'}
        </button>
      </div>
      {confirming && <p className="tpl-cadence-note">{CONFIRM_WAIT_NOTE}</p>}
      {confirmErr && <p className="tpl-cadence-note">{confirmErr}</p>}
    </div>
  );
}

function ToggleChip({
  kind,
  label,
  detail,
  on,
  onToggle,
}: {
  kind: 'METRIC' | 'CARD';
  label: string;
  detail?: string;
  on: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`tpl-chip xt-comp--${kind === 'METRIC' ? 'metric' : 'goal'}${on ? '' : ' tpl-chip-off'}`}
      onClick={onToggle}
      aria-pressed={on}
      title={detail}
    >
      <span className="tpl-chip-kind">{kind}</span>
      <span className="tpl-chip-label">{label}</span>
      <span className="tpl-chip-state">{on ? 'Included ✓' : 'Removed ✕'}</span>
    </button>
  );
}

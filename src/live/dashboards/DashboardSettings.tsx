// DashboardSettings — tune how a dashboard keeps itself current: when Mavéa reads the numbers and
// where alerts go. (Data-refresh cadence lives on the dashboard detail page, where the metrics it
// governs are visible.) The usage panel is AWARENESS, not a price tag: it shows a
// qualitative band + an honest warning to check your model's pricing — never a dollar amount or a
// call count (only you can verify what your connected model costs). Live-updating + persisted via
// the store.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useDashboards } from './useDashboards';
import { removeDashboard, updateCadence, updateDashboard } from './store';
import { USAGE_LABEL, usageEstimate } from './cost';
import { refreshableWidgetCount, searchMetricCount } from './format';
import { dashHref } from './route';
import { notifyTriggered, pushSupported, requestPush } from './notify';
import type { AiCadenceMode, Tripwire } from './types';

// The AI read has ONE honest control: when Mavéa reads the numbers. It folds the old cadence
// segmented + the separate "smart trigger" toggle into a single mutually-exclusive choice, mapped
// onto the store's cadence.ai + smartTrigger fields the refresh loop already reads.
type ReadMode = 'on-cross' | 'daily' | 'weekly' | 'ask';
const READ_MODES: { v: ReadMode; label: string; ai: AiCadenceMode; smart: boolean }[] = [
  { v: 'on-cross', label: 'When a line crosses', ai: 'on-change', smart: true },
  { v: 'daily', label: 'Daily', ai: 'daily', smart: false },
  { v: 'weekly', label: 'Weekly', ai: 'weekly', smart: false },
  { v: 'ask', label: 'Only when I ask', ai: 'manual', smart: false },
];
/** Which read mode the two stored fields represent — incl. legacy combos (a daily+smart dashboard
 *  reads as 'daily'; the dead on-change-without-smart combo honestly reads as 'ask'). */
function readModeOf(ai: AiCadenceMode, smart: boolean): ReadMode {
  if (ai === 'daily') return 'daily';
  if (ai === 'weekly') return 'weekly';
  if (ai === 'on-change' && smart) return 'on-cross';
  return 'ask';
}

export function DashboardSettings({ id }: { id: string }): ReactElement {
  const dashboards = useDashboards();
  const d = useMemo(() => dashboards.find((x) => x.id === id) ?? null, [dashboards, id]);
  // Recompute the usage band live as the controls change (pure, no async, no figures).
  const usage = useMemo(
    () =>
      d
        ? usageEstimate(d.cadence, d.smartTrigger, searchMetricCount(d) + refreshableWidgetCount(d))
        : null,
    [d],
  );
  // Two-tap delete confirm (no blocking dialog): first tap arms, second removes. Auto-disarms after
  // a few seconds so a keyboard user who tabs away doesn't leave the card silently primed to delete.
  const [armDelete, setArmDelete] = useState(false);
  useEffect(() => {
    if (!armDelete) return;
    const t = window.setTimeout(() => setArmDelete(false), 5_000);
    return () => window.clearTimeout(t);
  }, [armDelete]);
  // Push permission can be refused at the browser level; surface that honestly instead of silently
  // leaving the toggle off.
  const [pushHint, setPushHint] = useState<string | null>(null);
  // `pushTested` briefly confirms a test notification was dispatched, then auto-clears so it doesn't
  // linger as a stale "sent" once the user moves on.
  const [pushTested, setPushTested] = useState(false);
  useEffect(() => {
    if (!pushTested) return;
    const t = window.setTimeout(() => setPushTested(false), 4_000);
    return () => window.clearTimeout(t);
  }, [pushTested]);
  // Settings is a sub-view; scroll to top on open so the panel isn't mid-page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!d || !usage) {
    return (
      <div className="dash-settings">
        <div className="dash-empty">
          <p className="dash-empty-title">That dashboard isn’t here.</p>
          <p className="dash-empty-how">
            <a href={dashHref.gallery}>Back to your dashboards →</a>
          </p>
        </div>
      </div>
    );
  }

  const pushAvailable = pushSupported();
  const pushNote = !pushAvailable
    ? 'Not supported in this browser'
    : (pushHint ?? 'A desktop notification while Mavéa is open');

  // Turning Push on prompts for permission; we only flip the stored flag on an explicit grant, so the
  // toggle can never claim it's on while the browser would silently swallow every alert.
  const togglePush = async (): Promise<void> => {
    if (d.alerts.push) {
      updateDashboard(d.id, { alerts: { ...d.alerts, push: false } });
      setPushHint(null);
      return;
    }
    const granted = await requestPush();
    if (granted) {
      updateDashboard(d.id, { alerts: { ...d.alerts, push: true } });
      setPushHint(null);
    } else {
      setPushHint('Blocked — allow notifications for this site in your browser, then try again');
    }
  };

  // Fire one real Notification with a stand-in tripwire so the user can confirm push actually
  // renders — permission alone doesn't prove the OS will show it. notifyTriggered → firePush is
  // doubly gated (toggle + grant), and the button below is enabled only when both hold, so this
  // dispatches exactly one notification and never a stray one.
  const sendPushTest = (): void => {
    const probe: Tripwire = {
      id: 'test',
      label: 'Test alert',
      metricId: '',
      comparator: 'gt',
      threshold: 0,
      state: 'TRIGGERED',
      sourceQuote: { text: '', saidAt: 0 },
    };
    notifyTriggered(d, [probe]);
    setPushTested(true);
  };

  return (
    <div className="dash-settings">
      <header className="dash-detail-head">
        <a className="dash-back" href={dashHref.detail(d.id)} aria-label="Back to dashboard">
          ←
        </a>
        <span className="dash-detail-title">Settings</span>
        <span className="dash-detail-q">{d.title}</span>
      </header>

      <div className="dash-settings-grid">
        <div className="dash-settings-cols">
          <section className="card dash-set-card">
            <div className="card-eyebrow">AI analysis</div>
            <p className="dash-set-blurb">
              Mavéa reads the latest numbers and tells you, briefly and honestly, what they show and
              what’s changed since the last check — grounded in a fresh web search. Its read shows
              up on the dashboard. Each read is one model call on your API key. Choose when it runs:
            </p>
            <Segmented
              options={READ_MODES}
              value={readModeOf(d.cadence.ai, d.smartTrigger)}
              onPick={(v) => {
                const mode = READ_MODES.find((m) => m.v === v);
                if (!mode) return;
                updateCadence(d.id, { ai: mode.ai });
                updateDashboard(d.id, { smartTrigger: mode.smart });
              }}
            />
            <p className="dash-set-blurb">
              Refreshing the numbers themselves — the web searches — is a separate setting on the
              dashboard. Checking whether a line crossed is a free comparison. This read is the one
              model call, and you can trigger it anytime from the dashboard with “Read the numbers
              now.”
            </p>
          </section>

          <section className="card dash-set-card">
            <div className="card-eyebrow">Where alerts go</div>
            <div className="dash-set-alerts">
              <Check
                label="In-app"
                note="A pop-up notice when a line you set is crossed — this dashboard’s own alert list always updates either way"
                on={d.alerts.inApp}
                onToggle={() =>
                  updateDashboard(d.id, { alerts: { ...d.alerts, inApp: !d.alerts.inApp } })
                }
              />
              <Check
                label="Push"
                note={pushNote}
                on={d.alerts.push}
                disabled={!pushAvailable}
                onToggle={() => void togglePush()}
              />
              {pushAvailable && d.alerts.push && (
                <p className="dash-alert-test-row">
                  <button type="button" className="dash-alert-test" onClick={sendPushTest}>
                    Send a test
                  </button>
                  {pushTested && (
                    <span className="dash-alert-test-note" role="status">
                      Sent a test — if nothing appeared, re-check this site’s notification
                      permission.
                    </span>
                  )}
                </p>
              )}
            </div>
          </section>

          <section className="card dash-set-card dash-set-danger">
            <div className="card-eyebrow">Delete this dashboard</div>
            <p className="dash-set-blurb">
              Removes “{d.title}” and everything tracked on it. The conversations it was built from
              are untouched.
            </p>
            <button
              type="button"
              className={'dash-del-btn' + (armDelete ? ' armed' : '')}
              onClick={() => {
                if (!armDelete) {
                  setArmDelete(true);
                  return;
                }
                removeDashboard(d.id);
                window.location.hash = dashHref.gallery;
              }}
              onBlur={() => setArmDelete(false)}
            >
              {armDelete ? 'Tap again to delete' : 'Delete dashboard'}
            </button>
            <span className="dash-sr-only" aria-live="polite">
              {armDelete ? `Tap again to delete ${d.title}` : ''}
            </span>
          </section>
        </div>

        <aside className="card dash-usage" aria-label="Estimated usage">
          <div className="card-eyebrow">On your API key</div>
          <div className={`dash-usage-band dash-usage--${usage.level}`}>
            {USAGE_LABEL[usage.level]}
          </div>
          <div className="dash-usage-rows">
            <div className="dash-usage-row">
              <span>Data refresh</span>
              <span className="dash-usage-val">{usage.dataLabel}</span>
            </div>
            <div className="dash-usage-row">
              <span>AI analysis</span>
              <span className="dash-usage-val">{usage.aiLabel}</span>
            </div>
            <div className="dash-usage-row">
              <span>Adding a conversation</span>
              <span className="dash-usage-val">One model call, each time</span>
            </div>
          </div>
          <p className="dash-usage-warning">{usage.warning}</p>
          <p className="dash-usage-warning">
            The bands above are the AUTOMATIC cadence only. "Refresh now", "Ask", and pulling in
            another conversation are things YOU trigger — each one is a real call on your key,
            regardless of what cadence you've set.
          </p>
          <p className="dash-usage-warning">
            Automatic checks pause for the day once your daily search budget is reached (adjustable
            in your dashboards settings) — manual actions like Refresh now always work.
          </p>
          <a className="dash-usage-done" href={dashHref.detail(d.id)}>
            Done
          </a>
        </aside>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { v: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}): ReactElement {
  return (
    <div className="dash-seg" role="group">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={'dash-seg-opt' + (o.v === value ? ' is-active' : '')}
          aria-pressed={o.v === value}
          onClick={() => onPick(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Check({
  label,
  note,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  note: string;
  on: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className={'dash-check' + (on ? ' on' : '') + (disabled ? ' disabled' : '')}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
    >
      <span className="dash-check-box">{on ? '✓' : ''}</span>
      <span className="dash-check-text">
        <span className="dash-check-label">{label}</span>
        <span className="dash-check-note">{note}</span>
      </span>
    </button>
  );
}

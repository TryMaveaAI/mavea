// NewFromTemplate — the "track anything" path onto a dashboard: type what you want to follow, in
// your own words, and the planner (planTracker.ts, one create-time model call) designs the live
// cards. This step only asks +
// plans; once a plan comes back, everything after it — the review, the toggles, the cadence, the
// fold-into-existing interstitial, create — is PlanReview (also used by the home composer), so the
// two "track anything" entry points render identically instead of drifting apart.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useFocusTrap } from '../useFocusTrap';
import { getDashboards } from './store';
import { dashHref } from './route';
import { getLiveConfigV2, hasModelConfigured, toModelConfig } from '../useLiveConfig';
import { planTracker, type TrackerPlan } from './planTracker';
import { PlanReview } from './PlanReview';
import type { Dashboard } from './types';
import './dashboards.css';

const EXAMPLES = [
  'Yankees scores and standings',
  'AAPL stock price',
  'Weather in Denver',
  'Fed rate-cut odds',
];

export function NewFromTemplate({ onClose }: { onClose: () => void }): ReactElement {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, { onEscape: onClose });
  // Focus the ask box imperatively on mount, not via the autoFocus prop — same pattern the rest
  // of this directory uses, so a screen reader isn't yanked here without the dialog announcing.
  const askRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    askRef.current?.focus();
  }, []);

  const [ask, setAsk] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<TrackerPlan | null>(null);

  // Read once, like ExtractionPreview does — this modal is a single, short-lived review, not a
  // live view that needs to track dashboards created elsewhere while it's open.
  const existing = useMemo<Dashboard[]>(() => getDashboards(), []);
  const hasModel = useMemo(() => hasModelConfigured(getLiveConfigV2()), []);

  const runPlan = async (): Promise<void> => {
    const wish = ask.trim();
    if (!wish || planning) return;
    setPlanning(true);
    // planTracker never throws — no model / a dead call degrades to a plain list tracker that
    // re-asks the user's own words, so creation is never blocked on the planner.
    const p = await planTracker(wish, toModelConfig(getLiveConfigV2()));
    setPlan(p);
    setPlanning(false);
  };

  const onDone = (dashboardId: string): void => {
    onClose();
    window.location.hash = dashHref.detail(dashboardId);
  };

  return (
    <div
      className="xt-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="button"
      tabIndex={0}
      aria-label="Close"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="xt-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Track anything"
      >
        <div className="xt-head">
          {plan ? (
            <button type="button" className="tpl-back" onClick={() => setPlan(null)}>
              ‹ Change what to track
            </button>
          ) : (
            <span className="xt-head-title">Track anything</span>
          )}
          <button type="button" className="xt-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!plan && (
          <div className="tpl-form">
            <form
              className="tpl-ask-row"
              onSubmit={(e) => {
                e.preventDefault();
                void runPlan();
              }}
            >
              <input
                ref={askRef}
                className="xt-name tpl-ask-input"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="What do you want to track?"
                aria-label="What do you want to track?"
                disabled={planning}
              />
              <button type="submit" className="tpl-create" disabled={!ask.trim() || planning}>
                {planning ? 'Planning…' : 'Plan it →'}
              </button>
            </form>
            <div className="tpl-examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="tpl-example-chip"
                  disabled={planning}
                  onClick={() => setAsk(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="tpl-gate-note">
              {hasModel
                ? 'Mavéa plans the live cards — what to watch and how to fetch it — then keeps them current on a schedule you control.'
                : 'No model connected — you can still create a basic tracker; connect a model in Live for a smarter plan.'}
            </p>
          </div>
        )}

        {plan && <PlanReview plan={plan} ask={ask} existing={existing} onDone={onDone} />}
      </div>
    </div>
  );
}

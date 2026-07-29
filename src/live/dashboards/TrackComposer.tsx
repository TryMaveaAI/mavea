// TrackComposer — the home page's "track anything" bar: type what you want to follow, Mavéa plans
// it, and a sheet opens with either the live plan to review or — for a settled fact that isn't
// worth a standing check — a one-time answer. Shares its post-plan UI with the older template
// modal (NewFromTemplate) via PlanReview, so the two entry points never drift apart.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AsyncSurface } from '../../components/AsyncSurface';
import { cachedImport } from '../../lib/cachedImport';
import { createPreloadableLazy, preloadIntentProps } from '../../lib/preloadableLazy';
import { useFocusTrap } from '../useFocusTrap';
import { getDashboards } from './store';
import { dashHref } from './route';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import type { TrackerPlan, StaticAnswer } from './planTracker';
import { AnswerCard } from './AnswerCard';
import './dashboards.css';
import './dash-composer.css';

const loadPlanner = cachedImport(() => import('./planTracker'));

const planReview = createPreloadableLazy(() =>
  import('./PlanReview').then((module) => ({ default: module.PlanReview })),
);
const PlanReview = planReview.Component;

function preloadComposerNextStep(): Promise<void> {
  return Promise.all([loadPlanner(), planReview.preload()]).then(() => undefined);
}

type Sheet =
  | { step: 'answering'; plan: TrackerPlan }
  | { step: 'answer'; plan: TrackerPlan; answer: StaticAnswer | null }
  | { step: 'review'; plan: TrackerPlan };

export function TrackComposer({
  inert = false,
}: {
  /** True while something else already holds focus-trap priority (another modal is open) — the
   *  ⌘K listener stays registered but skips stealing focus, so two overlays never fight for it. */
  inert?: boolean;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState('');
  const [planning, setPlanning] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Bumped on every submit and on dismiss/unmount — an in-flight answerOnce (or a slow planTracker)
  // only lands if it's still the newest request; a fast second query, a closed sheet, or navigating
  // away must not let a stale call's result appear after the fact.
  const gen = useRef(0);

  const dismiss = (): void => {
    gen.current++;
    setSheet(null);
  };

  useFocusTrap(modalRef, { onEscape: dismiss, active: !!sheet });

  useEffect(() => {
    if (inert) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inert]);

  useEffect(
    () => () => {
      gen.current++;
    },
    [],
  );

  const submit = async (): Promise<void> => {
    const wish = ask.trim();
    if (!wish || planning) return;
    setPlanning(true);
    const my = ++gen.current;
    // planTracker never throws — no model / a dead call degrades to a plain list tracker, so
    // submitting is never blocked on the planner.
    const { planTracker, answerOnce } = await loadPlanner();
    const plan = await planTracker(wish, toModelConfig(getLiveConfigV2()));
    if (my !== gen.current) return;
    setPlanning(false);
    if (plan.kind !== 'static') {
      setSheet({ step: 'review', plan });
      return;
    }
    setSheet({ step: 'answering', plan });
    // A second, separate call — a settled fact still costs one honest one-time answer, not a
    // hidden recurring search.
    const answer = await answerOnce(wish, toModelConfig(getLiveConfigV2()));
    if (my !== gen.current) return;
    setSheet({ step: 'answer', plan, answer });
  };

  const onDone = (dashboardId: string): void => {
    gen.current++;
    setSheet(null);
    setAsk('');
    window.location.hash = dashHref.detail(dashboardId);
  };

  return (
    <>
      <form
        className="dash-composer-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={inputRef}
          className="dash-composer-input"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Track anything — Mavéa will suggest what's worth checking, and how often"
          aria-label="Track anything"
          disabled={planning}
          {...preloadIntentProps(preloadComposerNextStep)}
        />
        <kbd className="dash-composer-kbd" aria-hidden="true">
          ⌘K
        </kbd>
        <button type="submit" className="dash-composer-submit" disabled={!ask.trim() || planning}>
          {planning ? 'Planning…' : 'Track'}
        </button>
      </form>

      {sheet && (
        <div
          className="xt-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.key === ' ') e.preventDefault();
              dismiss();
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
              {sheet.step === 'review' ? (
                <button type="button" className="tpl-back" onClick={dismiss}>
                  ‹ Change what to track
                </button>
              ) : (
                <span className="xt-head-title">{sheet.plan.title}</span>
              )}
              <button type="button" className="xt-close" onClick={dismiss} aria-label="Close">
                ×
              </button>
            </div>

            {sheet.step === 'answering' && (
              <div className="xt-loading">Mavéa is checking that…</div>
            )}
            {sheet.step === 'answer' && (
              <AnswerCard
                answer={sheet.answer}
                onTrackAnyway={() => setSheet({ step: 'review', plan: sheet.plan })}
              />
            )}
            {sheet.step === 'review' && (
              <AsyncSurface label="tracker plan">
                <PlanReview
                  plan={sheet.plan}
                  ask={ask}
                  existing={getDashboards()}
                  onDone={onDone}
                />
              </AsyncSurface>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// CheckRunPanel — what the last check actually did, step by step.
//
// "Couldn't verify with sources" was the whole story a reader got, and it is the same sentence
// whether the search never ran, ran and returned nothing, returned pages nothing could be
// extracted from, or extracted values the grounding gate then discarded. Those need four different
// responses from the user and were indistinguishable. This shows the steps as they happened, so a
// failing tracker can be diagnosed from the surface rather than from a network panel.
//
// Collapsed by default: it is an answer to "why", not something to read on every visit.
import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { checkRunsFor, subscribeCheckRuns, type CheckRun, type CheckStep } from './checkRun';
import { failureLine } from './trackerState';
import './check-run.css';

const STEP_LABEL: Record<CheckStep['name'], string> = {
  scheduled: 'Scheduled',
  search: 'Search',
  sources: 'Sources',
  extraction: 'Extraction',
  grounding: 'Grounding',
  saved: 'Saved',
  tripwires: 'Lines checked',
};

const OUTCOME_LABEL: Record<NonNullable<CheckRun['outcome']>, string> = {
  updated: 'New data saved',
  'no-change': 'Checked — nothing new',
  unverified: 'Nothing could be verified',
  failed: 'The check could not run',
};

function ms(run: CheckRun): string {
  if (run.endedAt === undefined) return '…';
  const secs = (run.endedAt - run.startedAt) / 1000;
  return secs < 1 ? `${Math.max(1, Math.round(secs * 1000))}ms` : `${secs.toFixed(1)}s`;
}

export function CheckRunPanel({ dashboardId }: { dashboardId: string }): ReactElement | null {
  const runs = useSyncExternalStore(
    subscribeCheckRuns,
    () => checkRunsFor(dashboardId),
    () => checkRunsFor(dashboardId),
  );
  const [open, setOpen] = useState(false);
  const latest = runs[0];
  if (!latest) return null;

  return (
    <section className="crp">
      <button
        type="button"
        className="crp-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'What happened on the last check?'}
      </button>
      {open && (
        <ol className="crp-steps">
          {latest.steps.map((s, i) => (
            <li key={`${s.name}-${i}`} className={s.ok ? 'crp-step' : 'crp-step is-bad'}>
              <span className="crp-step-mark" aria-hidden="true">
                {s.ok ? '✓' : '✕'}
              </span>
              <span className="crp-step-name">{STEP_LABEL[s.name]}</span>
              {s.count !== undefined && <span className="crp-step-count">{s.count}</span>}
              {s.detail && <span className="crp-step-detail">{s.detail}</span>}
            </li>
          ))}
          <li className="crp-foot">
            <span>{latest.outcome ? OUTCOME_LABEL[latest.outcome] : 'Running…'}</span>
            <span className="crp-foot-time">{ms(latest)}</span>
          </li>
          {latest.failure && <li className="crp-fix">{failureLine(latest.failure)}</li>}
        </ol>
      )}
    </section>
  );
}

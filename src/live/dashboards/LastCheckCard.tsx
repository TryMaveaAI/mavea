// LastCheckCard — Mavéa's own narrative on the last check, folded into one honest card: what it
// found (or the plain data-refresh status when there's no verdict yet to show), any standing
// prediction (nested ExpectsCard), and the sources it grounded in. Absorbs former VerdictCard's
// honesty states verbatim — a pending call reads as pending, a newer failed attempt says so instead
// of silently reshowing a stale success, and a background-knowledge answer carries its own
// qualifier. Takes the whole `dashboard`, not just `lastVerdict` — a verdict ATTEMPT can fail
// without ever producing one (useDashboardLoop's markVerdictFailed), and this is the one place that
// honestly has to say so instead of just keeping whatever stale success it last showed.
import { type ReactElement } from 'react';
import type { Dashboard } from './types';
import { agoLine, dataStatusLine } from './format';
import { safeHttpUrl } from '../../lib/sourceHost';
import { useVerdictPending } from './useDashboardLoop';
import { ExpectsCard } from './ExpectsCard';

export function LastCheckCard({
  dashboard,
  now,
}: {
  dashboard: Dashboard;
  now: number;
}): ReactElement | null {
  const pending = useVerdictPending(dashboard.id);

  // Lean-chrome principle: a plain tracker with no tripwires, verdict, or predictions shouldn't grow
  // narrative chrome it doesn't need — but `pending` folds in so the FIRST on-demand read on an
  // otherwise-bare metric board still surfaces its "Mavéa is reading…" state instead of nothing.
  const hasReasoning =
    dashboard.tripwires.length > 0 || !!dashboard.lastVerdict || !!dashboard.prediction || pending;
  if (!hasReasoning) return null;

  const verdict = dashboard.lastVerdict;
  const tripwire = verdict
    ? (dashboard.tripwires.find((t) => t.id === verdict.tripwireId) ?? null)
    : null;
  // A LATER attempt failed than the verdict shown below — "checked X ago" stays true (that read
  // really did land then), but showing it bare would silently imply Mavéa just reconfirmed it, when
  // the actual last attempt came back empty.
  const failedSinceVerdict =
    !!dashboard.lastVerdictError && (dashboard.lastVerdictAttemptAt ?? 0) > (verdict?.at ?? 0);

  return (
    <section className="dash-lastcheck" aria-label="From the last check">
      <div className="dash-lastcheck-head">
        <span className="card-eyebrow dash-lastcheck-eyebrow">From the last check</span>
        {verdict && (
          <span className="dash-lastcheck-when">
            {agoLine(verdict.at, now).replace(/^updated /, 'checked ')}
          </span>
        )}
      </div>

      {verdict ? (
        <>
          {tripwire && (
            <p className="dash-lastcheck-text dash-lastcheck-about">About: {tripwire.label}</p>
          )}
          {pending ? (
            <p className="dash-lastcheck-text dash-lastcheck-pending">
              Mavéa is reading the latest numbers…
            </p>
          ) : (
            failedSinceVerdict && (
              <p className="dash-lastcheck-text dash-lastcheck-error">
                A newer check just failed: {dashboard.lastVerdictError}
              </p>
            )
          )}
          <p className="dash-lastcheck-text">{verdict.text}</p>
          {verdict.grounded === false && (
            <p className="dash-lastcheck-text dash-lastcheck-qualifier">
              Based on background knowledge, not a fresh search.
            </p>
          )}
          {verdict.sources && verdict.sources.length > 0 && (
            <div className="dash-lastcheck-sources">
              {verdict.sources.map((s) => {
                const url = safeHttpUrl(s.url);
                if (!url) return null;
                return (
                  <a
                    key={s.url}
                    className="dash-lastcheck-source"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                );
              })}
            </div>
          )}
        </>
      ) : pending ? (
        <p className="dash-lastcheck-text dash-lastcheck-pending">
          Mavéa is reading the latest numbers…
        </p>
      ) : failedSinceVerdict ? (
        <p className="dash-lastcheck-text dash-lastcheck-error">{dashboard.lastVerdictError}</p>
      ) : (
        <p className="dash-lastcheck-text dash-lastcheck-muted">{dataStatusLine(dashboard, now)}</p>
      )}

      <ExpectsCard dashboard={dashboard} now={now} />
    </section>
  );
}

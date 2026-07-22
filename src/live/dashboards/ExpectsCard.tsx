// ExpectsCard — the standing "expects by next check" call, plus the most recently graded one. Both
// ride the SAME grounded refresh call that already fetches values (predictions.ts / store.ts's
// applyRefreshResult), never a separate billed call — so this is genuinely free chrome. Nested
// inside LastCheckCard; renders nothing at all when there's no prediction data yet, rather than an
// empty scaffold advertising a feature that hasn't produced anything.
import { type ReactElement } from 'react';
import type { Dashboard, PredictionGrade } from './types';
import { weeklyTally } from './predictions';

const GRADE_META: Record<PredictionGrade['result'], { label: string; className: string }> = {
  hit: { label: 'Called it ✓', className: 'is-hit' },
  miss: { label: 'Missed ✗', className: 'is-miss' },
  unclear: { label: 'Unclear', className: 'is-unclear' },
};

export function ExpectsCard({
  dashboard,
  now,
}: {
  dashboard: Dashboard;
  now: number;
}): ReactElement | null {
  const history = dashboard.predictionHistory ?? [];
  const lastGrade = history.length > 0 ? history[history.length - 1] : null;
  if (!dashboard.prediction && !lastGrade) return null;

  const tally = weeklyTally(dashboard.predictionHistory, now);
  const gradeMeta = lastGrade ? GRADE_META[lastGrade.result] : null;

  return (
    <div className="dash-expects">
      <span className="card-eyebrow dash-expects-eyebrow">Expects by next check</span>
      {dashboard.prediction && <p className="dash-expects-text">{dashboard.prediction.text}</p>}

      {lastGrade && gradeMeta && (
        <div className="dash-expects-grade">
          <span className={`dash-expects-chip ${gradeMeta.className}`}>
            Last call: {gradeMeta.label}
          </span>
          <p className="dash-expects-expected">“{lastGrade.expected}”</p>
          {lastGrade.note && <p className="dash-expects-note">{lastGrade.note}</p>}
        </div>
      )}

      <div className="dash-expects-foot">
        {tally.total > 0 && (
          <span className="dash-expects-tally">
            Calls this week · {tally.hits}/{tally.total}
          </span>
        )}
        <span className="dash-expects-label">
          Predictions are free — written from checks you already paid for
        </span>
      </div>
    </div>
  );
}

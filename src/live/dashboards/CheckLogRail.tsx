// CheckLogRail — the activity stream over the check ledger: every real search, insight, savings
// suggestion, alert, briefing, and goal event, newest-first. Shared between the home surface
// (unfiltered, "N searches used" is the whole day's spend) and a dashboard's detail page
// (`dashboardId` set, scoped to that one dashboard's own activity).
import { useMemo, type ReactElement } from 'react';
import { useLedger } from './useLedger';
import { searchesToday } from './ledger';
import { CheckLogEntry } from './CheckLogEntry';
import './dash-log.css';

const DEFAULT_LIMIT = 100;

export function CheckLogRail({
  dashboardId,
  limit = DEFAULT_LIMIT,
}: {
  /** Scopes the log (and its header count) to one dashboard's own entries — the detail-page use. */
  dashboardId?: string;
  limit?: number;
}): ReactElement {
  const ledger = useLedger();

  const entries = useMemo(
    () => (dashboardId ? ledger.filter((e) => e.dashboardIds.includes(dashboardId)) : ledger),
    [ledger, dashboardId],
  );
  const searches = useMemo(() => searchesToday(entries, Date.now()), [entries]);
  const visible = useMemo(() => entries.slice(0, Math.max(0, limit)), [entries, limit]);

  return (
    <section className="card dash-log-card" aria-label="Check log">
      <div className="card-eyebrow dash-log-head">
        {dashboardId ? 'CHECK LOG · ' : ''}
        TODAY · {searches} SEARCHES USED
      </div>
      {visible.length === 0 ? (
        <p className="dash-log-empty">Your check log will appear here.</p>
      ) : (
        <ul className="dash-log-list" role="log" aria-live="polite" aria-relevant="additions">
          {visible.map((entry) => (
            <CheckLogEntry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

// CheckLogEntry — one row of the check-log rail. Every field it shows comes straight off the
// ledger entry (ledger.ts) or the optimizer (optimizer.ts); nothing here computes a number of its
// own beyond formatting.
import { type ReactElement } from 'react';
import type { LedgerEntry } from './ledger';
import { applySuggestion, dismissSuggestion } from './optimizer';
import { chipForEntry, formatLogTime } from './checkLogModel';

function footerSource(entry: LedgerEntry): string {
  if (entry.domains?.length) return entry.domains.join(', ');
  return entry.manual ? 'MANUAL' : 'MAVÉA';
}

export function CheckLogEntry({ entry }: { entry: LedgerEntry }): ReactElement {
  const chip = chipForEntry(entry);
  const suggestion = entry.kind === 'savings' ? entry.suggestion : undefined;

  return (
    <li className="dash-log-row">
      <div className="dash-log-row-top">
        <span className="dash-log-time">{formatLogTime(entry.at)}</span>
        {chip && <span className={`dash-log-chip dash-log-chip--${chip.tone}`}>{chip.label}</span>}
      </div>
      <p className="dash-log-text">{entry.text}</p>
      {suggestion && suggestion.state === 'open' && (
        <div className="dash-log-suggestion">
          <button
            type="button"
            className="dash-log-apply-btn"
            onClick={() => applySuggestion(entry.id, suggestion.dashboardId, suggestion.to)}
          >
            Apply — save ~{suggestion.savesPerMonth} searches/mo
          </button>
          <button
            type="button"
            className="dash-log-dismiss-btn"
            onClick={() => dismissSuggestion(entry.id)}
          >
            Dismiss
          </button>
        </div>
      )}
      {suggestion && suggestion.state === 'applied' && (
        <div className="dash-log-suggestion">
          <span className="dash-log-applied">Applied ✓</span>
        </div>
      )}
      <div className="dash-log-foot">
        <span className="dash-log-source">{footerSource(entry)}</span>
        <span className="dash-log-dot" aria-hidden="true" />
        <span className="dash-log-cost">
          {entry.searches === 1 ? '1 SEARCH' : 'NO SEARCH SPENT'}
        </span>
      </div>
    </li>
  );
}

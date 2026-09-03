// The session's token ledger, shown where the key that pays for it lives (Settings → Model).
// Mavéa is BYOK: every call on this list was billed to the reader's own account, so "what did
// this session spend, and is prompt caching actually landing?" is a question they are entitled
// to an answer to. Tokens only — never a currency estimate: prices differ per provider and per
// model and change without notice, and a confidently wrong dollar figure is worse than none.
import { useSyncExternalStore, type ReactElement } from 'react';
import { getUsageLedger, subscribeUsage, type UsageEntry } from './ledger';
import './usage.css';

interface Totals {
  calls: number;
  input: number;
  cachedInput: number;
  output: number;
}

function sum(entries: readonly UsageEntry[]): Totals {
  return entries.reduce<Totals>(
    (acc, e) => ({
      calls: acc.calls + 1,
      input: acc.input + e.input,
      cachedInput: acc.cachedInput + e.cachedInput,
      output: acc.output + e.output,
    }),
    { calls: 0, input: 0, cachedInput: 0, output: 0 },
  );
}

/** Thousands separators at every size: a bare 18500 reads as noise beside 1850. */
const NUM = new Intl.NumberFormat();

export function UsagePanel(): ReactElement {
  const entries = useSyncExternalStore(subscribeUsage, getUsageLedger, getUsageLedger);
  if (!entries.length) {
    return (
      <p className="usage-empty">
        No model calls yet this session — the tour and the recorded demos never make one.
      </p>
    );
  }

  const totals = sum(entries);
  // The share of input billed at the cached rate. It is the number every prompt-shape decision in
  // here is judged by, so it gets stated plainly rather than left to be derived from two others.
  const cachedShare = totals.input ? Math.round((totals.cachedInput / totals.input) * 100) : 0;

  // Per call site, biggest first: a turn can bill several passes, and "which pass spent it" is
  // the actionable half of the answer.
  const byLabel = new Map<string, number>();
  for (const e of entries) {
    byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + e.input + e.output);
  }
  const sites = [...byLabel.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="usage-panel">
      <dl className="usage-totals">
        <div>
          <dt>Sent</dt>
          <dd>
            {NUM.format(totals.input)}
            <span className="usage-unit"> in</span>
          </dd>
        </div>
        <div>
          <dt>Cached</dt>
          <dd>
            {cachedShare}
            <span className="usage-unit">% of that</span>
          </dd>
        </div>
        <div>
          <dt>Written</dt>
          <dd>
            {NUM.format(totals.output)}
            <span className="usage-unit"> out</span>
          </dd>
        </div>
        <div>
          <dt>Calls</dt>
          <dd>{NUM.format(totals.calls)}</dd>
        </div>
      </dl>
      <ul className="usage-sites">
        {sites.map(([label, tokens]) => (
          <li key={label}>
            <span className="usage-site-name">{label}</span>
            <span className="usage-site-tokens">{NUM.format(tokens)}</span>
          </li>
        ))}
      </ul>
      <div className="usage-call-log">
        <p className="usage-call-heading">Calls, newest first</p>
        <ul className="usage-calls">
          {[...entries].reverse().map((entry, index) => (
            <li key={`${entry.at}-${entry.label}-${index}`}>
              <span className="usage-site-name">{entry.label}</span>
              <span className="usage-call-tokens">
                {NUM.format(entry.input)} in · {NUM.format(entry.cachedInput)} cached ·{' '}
                {NUM.format(entry.output)} out
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="usage-note">
        Each row is one provider call; retries and follow-on tools appear separately. Counted from
        what each provider reported for this session only — nothing is stored, and nothing leaves
        this device. Output tokens usually cost several times what input does.
      </p>
    </div>
  );
}

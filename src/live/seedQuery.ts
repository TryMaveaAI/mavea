// A one-shot handoff for the landing's hero composer: it stashes the typed question here, then
// routes to #/live. LiveApp reads it once on mount and routes on setup state: a configured user
// gets a FRESH live session that runs the question immediately (no re-ask, prior session NOT
// resumed); an unconfigured user goes through the setup ritual, and the question is forwarded
// automatically the moment they finish. sessionStorage so it survives the hash navigation but
// not a fresh tab; cleared on read so a later refresh never resurrects a stale question. Storage
// failures are swallowed: the seed is a nicety, never load-bearing.
const KEY = 'mavea-live-seed';

export function stashSeedQuery(query: string): void {
  try {
    sessionStorage.setItem(KEY, query);
  } catch {
    /* storage unavailable (private mode / disabled) — fall back to an empty composer */
  }
}

/** Read and consume the pending seed query. Returns '' when there is none. */
export function takeSeedQuery(): string {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value ?? '';
  } catch {
    return '';
  }
}

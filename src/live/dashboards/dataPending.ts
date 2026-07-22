// dashboards/dataPending.ts — the "a data fetch is in flight for this dashboard right now" signal,
// split out of useDashboardLoop.ts so the home grid's tiles (eagerly mounted with DashboardsApp)
// can subscribe to it without statically reaching useDashboardLoop's heavy refresh/provider chain
// (see tests/eager-bundle.test.ts — DashboardsApp must never eagerly pull in every provider
// adapter). useDashboardLoop.ts is the only writer (setDataPending); everyone else only reads.
import { useSyncExternalStore } from 'react';

const dataPending = new Set<string>();
const DATA_PENDING_EVENT = 'mavea-dashboard-data-pending';

/** Flip the pending flag for one or more dashboards and broadcast it, same idiom as store.ts's
 *  persist() — a same-tab CustomEvent a subscribed component re-renders on. */
export function setDataPending(ids: readonly string[], pending: boolean): void {
  for (const id of ids) {
    if (pending) dataPending.add(id);
    else dataPending.delete(id);
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DATA_PENDING_EVENT));
    }
  } catch {
    /* non-browser env */
  }
}

function subscribeDataPending(onStoreChange: () => void): () => void {
  window.addEventListener(DATA_PENDING_EVENT, onStoreChange);
  return () => window.removeEventListener(DATA_PENDING_EVENT, onStoreChange);
}

/** Whether `id`'s dashboard has a data fetch in flight right now. Never true for a keyless tick —
 *  it's only set once the loop has already confirmed a model is connected and is about to spend a
 *  real call, so it can't shimmer over a pass that was always going to be a silent no-op. */
export function useDataPending(id: string): boolean {
  return useSyncExternalStore(
    subscribeDataPending,
    () => dataPending.has(id),
    () => false,
  );
}

// useDashboards — React hook over the dashboards store, re-reading on every broadcast write. Stays
// in sync within the tab (the same-tab CustomEvent) and across tabs (the native `storage` event).
// Its own file so the surface components stay component-only (fast-refresh friendly).
//
// useSyncExternalStore, not useState+useEffect: the store's first hydrate is ASYNC (dashboards
// are encrypted at rest — see store.ts's hydrateAsync), so its one-time "ready" event can land
// between a component's initial render and its effect actually subscribing. A useState+useEffect
// listener that misses that narrow window never gets another chance and is stuck showing empty
// forever — this is exactly the "torn snapshot" bug useSyncExternalStore exists to close: it
// re-checks the snapshot itself at subscribe time, so a same-tick update can never be missed.
import { useSyncExternalStore } from 'react';
import {
  DASHBOARDS_EVENT,
  DASHBOARDS_QUOTA_EVENT,
  getDashboards,
  hasDroppedWrite,
  invalidate,
} from './store';
import type { Dashboard } from './types';

function subscribe(onStoreChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    // `key` is null on localStorage.clear(); STORAGE_KEY === DASHBOARDS_EVENT.
    if (e.key !== null && e.key !== DASHBOARDS_EVENT) return;
    invalidate();
    onStoreChange();
  };
  window.addEventListener(DASHBOARDS_EVENT, onStoreChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(DASHBOARDS_EVENT, onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Every dashboard, live-updating as they're created/edited/refreshed (most-recent first). */
export function useDashboards(): Dashboard[] {
  return useSyncExternalStore(subscribe, getDashboards);
}

function subscribeQuota(onStoreChange: () => void): () => void {
  window.addEventListener(DASHBOARDS_QUOTA_EVENT, onStoreChange);
  return () => window.removeEventListener(DASHBOARDS_QUOTA_EVENT, onStoreChange);
}

/** True once this browser's storage has refused a dashboards write. The store keeps working from
 *  memory, so nothing breaks until a reload throws the change away — which is exactly why the
 *  surface says so rather than letting it fail silently. */
export function useQuotaDropped(): boolean {
  return useSyncExternalStore(subscribeQuota, hasDroppedWrite, () => false);
}

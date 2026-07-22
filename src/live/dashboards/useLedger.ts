// useLedger — React hook over the check-ledger store, live-updating on every write (same-tab
// CustomEvent) and cross-tab (native `storage` event). See useDashboards.ts for why this is
// useSyncExternalStore rather than useState+useEffect: the ledger is encrypted at rest, so its
// first hydrate is async and a plain effect-listener can miss that one-time "ready" event.
import { useSyncExternalStore } from 'react';
import { LEDGER_EVENT, getLedger, invalidate } from './ledger';
import type { LedgerEntry } from './ledger';

function subscribe(onStoreChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== null && e.key !== LEDGER_EVENT) return;
    invalidate();
    onStoreChange();
  };
  window.addEventListener(LEDGER_EVENT, onStoreChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LEDGER_EVENT, onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Every ledger entry, live-updating, newest-first. */
export function useLedger(): LedgerEntry[] {
  return useSyncExternalStore(subscribe, getLedger);
}

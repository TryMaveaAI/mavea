// DashboardLoopGate — the single place the background refresh loop is mounted, app-wide.
//
// The loop used to live inside DashboardsApp, which meant trackers only checked while the user was
// looking at #/dashboards — and never at all in Present mode, whose route returns before the mount.
// A tracker on a cadence is a promise the app keeps while it is open, not while one tab is focused,
// so ownership moved to the root. One mount point is load-bearing: the module-level in-flight set in
// useDashboardLoop dedupes billable calls, but two mounted hooks would run two intervals.
//
// Two conditions gate the runtime, and both keep the loop from costing anyone anything:
//  · legal acceptance — the loop previously sat inside <LegalGate>, so this preserves an invariant
//    that used to come free from where it was mounted: nothing spends on a user's key before they
//    have accepted.
//  · at least one dashboard — a visitor who has never made a tracker never downloads the engine
//    chunk at all. The store's first read is async (encrypted at rest), so an empty first render is
//    expected; the hydrate broadcast re-runs this and mounts the runtime if boards turn up.
import { Suspense, useSyncExternalStore, type ReactElement } from 'react';
import { createPreloadableLazy } from '../../lib/preloadableLazy';
import { hasLegalAcceptance, subscribeLegalAcceptance } from '../../legal/acceptance';
import { useDashboards } from './useDashboards';

const dashboardLoop = createPreloadableLazy(() =>
  import('./DashboardLoopRuntime').then((m) => ({ default: m.DashboardLoopRuntime })),
);
const DashboardLoopRuntime = dashboardLoop.Component;

export function DashboardLoopGate(): ReactElement | null {
  const accepted = useSyncExternalStore(subscribeLegalAcceptance, hasLegalAcceptance, () => false);
  const dashboards = useDashboards();
  if (!accepted || dashboards.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <DashboardLoopRuntime />
    </Suspense>
  );
}

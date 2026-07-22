import type { ReactElement } from 'react';
import { useDashboardLoop } from './useDashboardLoop';

/** Background refresh ownership, split from the route shell so it cannot delay first paint. */
export function DashboardLoopRuntime(): ReactElement | null {
  useDashboardLoop();
  return null;
}

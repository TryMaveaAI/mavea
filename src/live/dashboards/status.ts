// dashboards/status.ts — the gallery status badge, derived purely from tripwire states (no I/O, fully
// testable). A triggered tripwire is your own stated reversal condition breaking — that genuinely
// needs you. An awaiting tripwire means we have no real value yet, so the dashboard can't actually
// watch — honest "at risk" rather than a false "all clear". Otherwise it's tracking.
import type { Dashboard, DashboardStatus } from './types';

export function deriveStatus(d: Dashboard): DashboardStatus {
  if (d.tripwires.some((t) => t.state === 'TRIGGERED')) return 'needs-attention';
  if (d.tripwires.some((t) => t.state === 'AWAITING')) return 'at-risk';
  return 'tracking';
}

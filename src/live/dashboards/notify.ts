// dashboards/notify.ts — honest, client-side delivery for the Push alert channel. The loop hands us
// exactly the tripwires that JUST transitioned to TRIGGERED, so we alert on the move and never
// re-alert a still-breached line. Nothing is sent the user hasn't switched on:
//   • Push — a native browser Notification, shown only after an explicit permission grant AND with
//            the per-dashboard Push toggle on. There is no push subscription or background listener:
//            this fires only while Mavéa is open, matching the "refreshes while you're here" promise.
import type { Dashboard, Tripwire } from './types';

/** Whether the browser exposes the Notifications API at all. */
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current grant state, or 'unsupported' where the API is absent (older browsers, SSR, tests). */
export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

/** Prompt for notification permission. Resolves true ONLY on an explicit grant. */
export async function requestPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** One line of alert copy: the line that moved + the value that broke it. */
function alertLine(t: Tripwire): string {
  const v = typeof t.brokenValue === 'number' ? ` — now ${t.brokenValue}${t.unit ?? ''}` : '';
  return `${t.label}${v}`;
}

function firePush(d: Dashboard, triggered: Tripwire[]): void {
  // Two gates, both required: the user turned Push ON for this dashboard, and the browser granted
  // permission. Checking only permission (the old bug) kept firing after the toggle was switched off.
  if (!d.alerts.push || pushPermission() !== 'granted') return;
  for (const t of triggered) {
    try {
      const n = new Notification(`${d.title} — a line you set was crossed`, {
        body: alertLine(t),
        // Same tag collapses a repeat of the same break instead of stacking duplicates.
        tag: `mavea-dash-${d.id}-${t.id}`,
      });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          /* nothing focusable */
        }
        n.close();
      };
    } catch {
      /* Notification can still throw on some platforms even when granted — never break the loop. */
    }
  }
}

/** Deliver the Push channel for the lines that just broke. No-ops on an empty list. Synchronous — a
 *  granted `Notification()` call fires immediately with nothing to await (no network) — and safe to
 *  call fire-and-forget from the refresh loop. `firePush` itself is doubly gated (toggle + grant),
 *  so this always respects the user's per-dashboard Push setting. */
export function notifyTriggered(d: Dashboard, triggered: Tripwire[]): void {
  if (!triggered.length) return;
  firePush(d, triggered);
}

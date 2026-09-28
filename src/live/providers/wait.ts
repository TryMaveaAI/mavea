// wait.ts — the one app-level channel for a provider backoff that no surface is showing.
//
// When a provider answers 429/503/529 the adapter sleeps and re-sends (see http.ts). A request that
// carries its own `onWait` — the Live turn, the world — says so inline. Every other feature (Prism,
// Ripple, dashboards, courses, …) used to sleep in silence, which reads as the app hanging. Rather
// than wire each caller, the adapter asks for a reporter here: the caller's own when it has one,
// otherwise this shared channel, which the app shell renders as one polite status line.
//
// A leaf with no imports, so the shell can subscribe without pulling a provider into first paint.

export type WaitReason = 'rate-limit' | 'overload';
export type WaitReporter = (ms: number | null, reason?: WaitReason) => void;

export interface ProviderWait {
  /** Epoch ms the re-send is due. */
  until: number;
  reason: WaitReason;
}

type Listener = (wait: ProviderWait | null) => void;

const active = new Map<symbol, ProviderWait>();
const listeners = new Set<Listener>();

/** The wait to show: of the requests backing off right now, the one that resumes last. */
function current(): ProviderWait | null {
  let latest: ProviderWait | null = null;
  for (const wait of active.values()) if (!latest || wait.until > latest.until) latest = wait;
  return latest;
}

function publish(): void {
  const wait = current();
  for (const listener of listeners) listener(wait);
}

/** Hear every change to the shared wait, starting with the current one. Returns the unsubscribe. */
export function subscribeProviderWait(listener: Listener): () => void {
  listeners.add(listener);
  listener(current());
  return () => {
    listeners.delete(listener);
  };
}

/** The reporter one request's backoff should use: the caller's own when it shows the wait itself
 *  (so nothing is shown twice), otherwise the shared channel. */
export function waitReporter(own?: WaitReporter): WaitReporter {
  if (own) return own;
  const id = Symbol('provider-wait');
  return (ms, reason = 'rate-limit') => {
    if (ms == null) active.delete(id);
    else active.set(id, { until: Date.now() + ms, reason });
    publish();
  };
}

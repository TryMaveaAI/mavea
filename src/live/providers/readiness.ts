// readiness.ts — what this session already knows about a provider's PAID readiness check.
//
// Anthropic can only prove a key works by generating (one token on /v1/messages), and Settings and
// the Connect step re-check every time they open. So a combination of endpoint + model + key that
// has been checked is remembered for the session, pass or fail, and later checks run only the free
// models request. An explicit Recheck asks again; a turn refused for its key or credit forgets the
// pass, so a verdict of "Ready" can never outlive the evidence behind it. A failed verdict is kept
// because asking again on its own would bill the same doomed request every time a panel opens.
//
// A leaf with no imports from the adapters, so the device sweep can clear it without pulling a
// provider (and the catalog behind it) into its chunk. Combinations are held as SHA-256
// fingerprints, never as a second copy of the key.
import type { ModelConfig } from '../../types/mavea';
import type { LiveProbe } from './types';

const verified = new Set<string>();
const failed = new Map<string, LiveProbe>();
const inFlight = new Map<string, Promise<LiveProbe>>();
/** Bumped by forgetReadiness, so a check still in flight when everything is forgotten cannot
 *  write its verdict back afterwards. */
let epoch = 0;

/** Hash of the three things a verdict depends on, or null without WebCrypto (then every check is
 *  a real one rather than a trust in an unverified pairing). */
export async function readinessFingerprint(base: string, cfg: ModelConfig): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(`${base}\n${cfg.model}\n${cfg.apiKey ?? ''}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function isVerified(fingerprint: string): boolean {
  return verified.has(fingerprint);
}

/** The verdict of this session's failed paid check for the combination, if it had one. Returned
 *  without its usage: that call was ledgered when it ran. */
export function failedVerdict(fingerprint: string): LiveProbe | undefined {
  const verdict = failed.get(fingerprint);
  return verdict && withoutUsage(verdict);
}

/** One paid check per combination at a time. The Connect step and Settings can overlap, and a
 *  debounce can fire twice; they share the request already in flight rather than each paying for
 *  it. Only the caller that started it gets the usage back, so the ledger counts it once. The
 *  verdict is remembered either way (a request that never answered counts as a failure); the
 *  entry leaves the map once the check settles. */
export function sharedPaidCheck(
  fingerprint: string,
  run: () => Promise<LiveProbe>,
): Promise<LiveProbe> {
  const pending = inFlight.get(fingerprint);
  if (pending) return pending.then(withoutUsage);
  const started = epoch;
  const record = (verdict: LiveProbe): void => {
    if (started !== epoch) return;
    if (verdict.ok) {
      verified.add(fingerprint);
      failed.delete(fingerprint);
    } else {
      verified.delete(fingerprint);
      failed.set(fingerprint, verdict);
    }
  };
  const check = run()
    .then(
      (verdict) => {
        record(verdict);
        return verdict;
      },
      (err: unknown) => {
        record({ ok: false, model: false });
        throw err;
      },
    )
    .finally(() => {
      if (inFlight.get(fingerprint) === check) inFlight.delete(fingerprint);
    });
  inFlight.set(fingerprint, check);
  return check;
}

function withoutUsage(verdict: LiveProbe): LiveProbe {
  const shared = { ...verdict };
  delete shared.usage;
  return shared;
}

/** A turn was refused for this combination's key or credit: the next check must really check. */
export function forgetVerified(fingerprint: string | null): void {
  if (fingerprint) verified.delete(fingerprint);
}

/** Forget every verdict and every check in flight: the device sweep, and tests starting cold. */
export function forgetReadiness(): void {
  epoch++;
  verified.clear();
  failed.clear();
  inFlight.clear();
}

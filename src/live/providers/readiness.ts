// readiness.ts — what this session already knows about a provider's PAID readiness check.
//
// Anthropic can only prove a key works by generating (one token on /v1/messages), and Settings and
// the Connect step re-check every time they open. So a combination of endpoint + model + key that
// has passed is remembered for the session, and later checks run only the free models request. An
// explicit Recheck asks again; a turn refused for its key or credit forgets the pass, so a verdict
// of "Ready" can never outlive the evidence behind it.
//
// A leaf with no imports from the adapters, so the device sweep can clear it without pulling a
// provider (and the catalog behind it) into its chunk. Combinations are held as SHA-256
// fingerprints, never as a second copy of the key.
import type { ModelConfig } from '../../types/mavea';

const verified = new Set<string>();

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

export function markVerified(fingerprint: string): void {
  verified.add(fingerprint);
}

/** A turn was refused for this combination's key or credit: the next check must really check. */
export function forgetVerified(fingerprint: string | null): void {
  if (fingerprint) verified.delete(fingerprint);
}

/** Forget every verdict — used by tests to start each case cold. */
export function forgetReadiness(): void {
  verified.clear();
}

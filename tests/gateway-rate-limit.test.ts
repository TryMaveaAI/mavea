import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs gateway module, no types
import { createRateLimiter } from '../gateway/actions-gateway.mjs';
// @ts-expect-error — plain .mjs gateway module, no types
import { tokenPermWarning } from '../gateway/tokenStore.mjs';

describe('gateway rate limiter (per-client sliding window)', () => {
  it('allows hits up to the limit, then blocks within the window', () => {
    const t = 0;
    const limiter = createRateLimiter(3, 1000, () => t);
    expect(limiter.take('ip-a').allowed).toBe(true);
    expect(limiter.take('ip-a').allowed).toBe(true);
    expect(limiter.take('ip-a').allowed).toBe(true);
    const blocked = limiter.take('ip-a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('reports a Retry-After until the oldest hit ages out of the window', () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    limiter.take('ip-a'); // hit at t=0
    t = 400;
    limiter.take('ip-a'); // hit at t=400 → window now full
    t = 500;
    const blocked = limiter.take('ip-a');
    expect(blocked.allowed).toBe(false);
    // Oldest hit (t=0) ages out at t=1000, i.e. 500ms away → ceil to 1s.
    expect(blocked.retryAfter).toBe(1);
  });

  it('lets the client through again once the window slides past its hits', () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    limiter.take('ip-a');
    limiter.take('ip-a');
    expect(limiter.take('ip-a').allowed).toBe(false);
    t = 1001; // both earlier hits are now older than the window
    expect(limiter.take('ip-a').allowed).toBe(true);
  });

  it('tracks each client independently', () => {
    const t = 0;
    const limiter = createRateLimiter(1, 1000, () => t);
    expect(limiter.take('ip-a').allowed).toBe(true);
    expect(limiter.take('ip-a').allowed).toBe(false);
    // A different client is unaffected by ip-a's budget.
    expect(limiter.take('ip-b').allowed).toBe(true);
  });

  it('prunes fully-aged clients so the map stays bounded', () => {
    let t = 0;
    const limiter = createRateLimiter(5, 1000, () => t);
    for (let i = 0; i < 50; i++) limiter.take(`ip-${i}`); // many one-shot clients at t=0
    t = 2000; // every earlier hit is now stale
    // A fresh hit triggers the sweep; the formerly-busy clients are gone, so the new client
    // gets a clean budget rather than colliding with stale state.
    expect(limiter.take('ip-new').allowed).toBe(true);
    expect(limiter.take('ip-new').allowed).toBe(true);
  });
});

describe('tokenStore permission verification', () => {
  it('does not warn when the file is owner-only (0600)', () => {
    // statSync returns st_mode with the file-type bits set; mask must ignore them.
    expect(tokenPermWarning(0o100600)).toBeNull();
  });

  it('warns loudly when the token file is group/world-readable', () => {
    const warning = tokenPermWarning(0o100644);
    expect(warning).toMatch(/SECURITY/);
    expect(warning).toContain('644');
    expect(warning).toContain('expected 600');
  });

  it('warns when permissions are too open in any direction (e.g. 0644 raw)', () => {
    expect(tokenPermWarning(0o644)).toMatch(/SECURITY/);
  });
});

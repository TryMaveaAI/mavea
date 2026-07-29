// cachedImport — the one property that matters is asymmetric caching: success is fetched once
// and shared forever, failure is surfaced but never pinned, so the next call is a genuine retry.
// (The regression this guards: a transient chunk failure permanently breaking a lazy feature —
// every "Try again" used to replay the cached rejection until a full page reload.)
import { describe, expect, it, vi } from 'vitest';
import { cachedImport } from '../src/lib/cachedImport';

describe('cachedImport', () => {
  it('loads once and shares the resolved module across calls', async () => {
    const load = vi.fn(() => Promise.resolve({ ok: true }));
    const get = cachedImport(load);
    await expect(get()).resolves.toEqual({ ok: true });
    await expect(get()).resolves.toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers share one in-flight request', async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const get = cachedImport(load);
    const [a, b] = [get(), get()];
    resolve('mod');
    await expect(a).resolves.toBe('mod');
    await expect(b).resolves.toBe('mod');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a rejection surfaces to the caller but is NOT cached — the next call retries for real', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk dropped'))
      .mockResolvedValueOnce('recovered');
    const get = cachedImport(load);
    await expect(get()).rejects.toThrow('chunk dropped');
    await expect(get()).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
    // And the recovery is itself cached from here on.
    await expect(get()).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

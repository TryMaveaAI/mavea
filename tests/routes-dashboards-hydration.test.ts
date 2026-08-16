// #/dashboards waits for what decrypts asynchronously before it mounts, exactly as #/live does.
// Without that wait the surface flashed "these trackers can't fetch anything yet" over a key that
// was merely still decrypting — and worse, a tracker created inside that window failed its add-time
// reality probe with "no model", which rolls the new dashboard back and deletes it outright. The
// wait is bounded so a hung decrypt degrades to the old behaviour instead of a route that never
// resolves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveDashboards: (() => void) | null = null;
let resolveSecrets: (() => void) | null = null;

vi.mock('../src/live/dashboards/DashboardsApp', () => ({ DashboardsApp: () => null }));

vi.mock('../src/live/dashboards/store', () => ({
  whenDashboardsHydrated: () =>
    new Promise<void>((resolve) => {
      resolveDashboards = resolve;
    }),
}));

vi.mock('../src/live/useLiveConfig', () => ({
  whenSecretPersistenceSettled: () =>
    new Promise<void>((resolve) => {
      resolveSecrets = resolve;
    }),
}));

/** Let the route's import chain settle: a macrotask, plus the microtasks it queues. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  resolveDashboards = null;
  resolveSecrets = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('#/dashboards route — hydration barrier', () => {
  it('does not mount until both the dashboards and the keys have settled', async () => {
    const { preloadRoute } = await import('../src/routes');
    let mounted = false;
    void preloadRoute('#/dashboards')?.then(() => {
      mounted = true;
    });

    await flush();
    expect(mounted).toBe(false);

    resolveDashboards?.();
    await flush();
    expect(mounted).toBe(false); // keys still outstanding

    resolveSecrets?.();
    await flush();
    expect(mounted).toBe(true);
  });

  it('mounts anyway once the bounded wait elapses, so a hung decrypt cannot strand the route', async () => {
    vi.useFakeTimers();
    const { preloadRoute } = await import('../src/routes');
    let mounted = false;
    void preloadRoute('#/dashboards')?.then(() => {
      mounted = true;
    });

    await vi.advanceTimersByTimeAsync(1200);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(mounted).toBe(true);
  });
});

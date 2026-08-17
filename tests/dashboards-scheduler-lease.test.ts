// Only one tab may run the automatic refresh loop. The loop's in-flight guard is module-scope, so
// it dedupes within a runtime and knows nothing about a second tab: two open Mavéa tabs each ran
// their own 15s scheduler over the same trackers and each spent on the user's key. The data stayed
// correct while the cost silently doubled per extra tab, which is why it went unnoticed.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { withSchedulerLease } from '../src/live/dashboards/schedulerLease';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A Web Locks stand-in where `held` decides whether this "tab" can take the lease. */
function stubLocks(held: boolean, onRequest?: (name: string) => void) {
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        _opts: { ifAvailable: boolean },
        cb: (lock: unknown) => Promise<void>,
      ) => {
        onRequest?.(name);
        await cb(held ? null : { name }); // null = someone else holds it
      },
    },
  });
}

describe('withSchedulerLease', () => {
  it('runs the tick when this tab can take the lease', async () => {
    stubLocks(false);
    const tick = vi.fn(async () => {});
    await withSchedulerLease(tick);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('SKIPS the tick when another tab already holds it — the second tab never spends', async () => {
    stubLocks(true);
    const tick = vi.fn(async () => {});
    await withSchedulerLease(tick);
    expect(tick).not.toHaveBeenCalled();
  });

  it('asks for the lease by a stable name, so every tab contends for the same one', async () => {
    const names: string[] = [];
    stubLocks(false, (n) => names.push(n));
    await withSchedulerLease(async () => {});
    await withSchedulerLease(async () => {});
    expect(new Set(names).size).toBe(1);
  });

  it('runs unconditionally where Web Locks does not exist — never checking is the worse failure', async () => {
    vi.stubGlobal('navigator', {});
    const tick = vi.fn(async () => {});
    await withSchedulerLease(tick);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('falls back to running when the lock manager itself rejects', async () => {
    vi.stubGlobal('navigator', {
      locks: {
        request: async () => {
          throw new Error('policy');
        },
      },
    });
    const tick = vi.fn(async () => {});
    await withSchedulerLease(tick);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('surfaces a throwing tick to its caller rather than swallowing it', async () => {
    stubLocks(false);
    const tick = vi.fn(async () => {
      throw new Error('tick blew up');
    });
    // The lease does NOT swallow: hiding a real failure would leave the loop looking healthy while
    // it checked nothing. The caller (useDashboardLoop's leasedTick) attaches the .catch that logs
    // it, because that call is fire-and-forget and an escaping throw is an unhandled rejection.
    await expect(withSchedulerLease(tick)).rejects.toThrow('tick blew up');
  });
});

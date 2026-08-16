// Dashboards are encrypted at rest, so another tab's write lands as ciphertext the synchronous
// read cannot parse. invalidate() used to drop the cache outright on that event, which emptied the
// list in every OTHER open tab — "Nothing on watch yet" over a full set of trackers — until the
// decrypt landed, and forever if this device's content key had been rotated and the decrypt failed.
// The cache now survives that window; only a genuinely cleared store empties.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveDecrypt: ((value: unknown) => void) | null = null;
let rejectDecrypt: ((reason?: unknown) => void) | null = null;
vi.mock('../src/live/contentVault', () => ({
  encryptContent: async (value: unknown) => `ENC:${JSON.stringify(value)}`,
  decryptContent: () =>
    new Promise((resolve, reject) => {
      resolveDecrypt = resolve;
      rejectDecrypt = reject;
    }),
}));

const storedDashboard = (id: string) => ({
  id,
  title: id,
  question: '',
  thesis: { text: '', saidAt: 0 },
  tripwires: [],
  metrics: [],
  sources: [],
  widgets: [],
  cadence: { data: 'manual', ai: 'manual' },
  alerts: { inApp: true, push: false },
  createdAt: 1,
  updatedAt: 1,
  nextDataAt: 0,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
});

async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  resolveDecrypt = null;
  rejectDecrypt = null;
});

afterEach(() => {
  localStorage.clear();
});

describe('invalidate — a cross-tab encrypted write must not blank the list', () => {
  it('keeps showing the current boards until the decrypt lands, then swaps in the new ones', async () => {
    const store = await import('../src/live/dashboards/store');
    store.addDashboard(storedDashboard('mine') as never);
    expect(store.getDashboards().map((d) => d.id)).toEqual(['mine']);

    // The other tab writes — ciphertext this tab cannot read synchronously.
    localStorage.setItem('mavea-dashboards-v1', 'ENC:from-the-other-tab');
    store.invalidate();
    expect(store.getDashboards().map((d) => d.id)).toEqual(['mine']);

    resolveDecrypt?.([storedDashboard('theirs')]);
    await store.whenDashboardsHydrated();
    expect(store.getDashboards().map((d) => d.id)).toEqual(['theirs']);
  });

  it('holds the last good list when the decrypt fails outright', async () => {
    const store = await import('../src/live/dashboards/store');
    store.addDashboard(storedDashboard('mine') as never);

    localStorage.setItem('mavea-dashboards-v1', 'ENC:unreadable');
    store.invalidate();
    rejectDecrypt?.(new Error('content key rotated'));
    await store.whenDashboardsHydrated();

    // Stale but real beats a permanently empty gallery over trackers that still exist.
    expect(store.getDashboards().map((d) => d.id)).toEqual(['mine']);
  });

  it('still empties when the other tab genuinely cleared the store', async () => {
    const store = await import('../src/live/dashboards/store');
    store.addDashboard(storedDashboard('mine') as never);

    localStorage.clear();
    store.invalidate();
    await nextTask();
    expect(store.getDashboards()).toEqual([]);
  });
});

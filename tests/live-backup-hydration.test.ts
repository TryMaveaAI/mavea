import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveDecrypt: ((value: unknown) => void) | null = null;
vi.mock('../src/live/contentVault', () => ({
  encryptContent: async (value: unknown) => `ENC:${JSON.stringify(value)}`,
  decryptContent: () =>
    new Promise((resolve) => {
      resolveDecrypt = resolve;
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

const backupWithDashboard = (dashboard: unknown) =>
  JSON.stringify({
    app: 'mavea',
    kind: 'backup',
    version: 1,
    exportedAt: 1,
    data: { dashboards: [dashboard] },
  });

async function nextTask(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  resolveDecrypt = null;
  localStorage.setItem('mavea-dashboards-v1', 'ENC:existing');
});

afterEach(() => {
  localStorage.clear();
});

describe('whole backup — encrypted hydration barrier', () => {
  it('does not export the temporary empty cache while decryption is pending', async () => {
    const { buildBackup } = await import('../src/live/backup/backup');
    let finished = false;
    const pending = buildBackup().then((value) => {
      finished = true;
      return value;
    });

    await nextTask();
    expect(finished).toBe(false);
    resolveDecrypt?.([storedDashboard('existing')]);

    const snapshot = await pending;
    expect(snapshot.data.dashboards).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'existing' })]),
    );
  });

  it('hydrates before import so a late decrypt cannot erase the merge baseline', async () => {
    const { importBackup } = await import('../src/live/backup/backup');
    const pending = importBackup(backupWithDashboard(storedDashboard('incoming')));
    await nextTask();
    resolveDecrypt?.([storedDashboard('existing')]);

    const summary = await pending;
    expect(summary.dashboards).toBe(1);
    const { getDashboards } = await import('../src/live/dashboards/store');
    expect(getDashboards().map((dashboard) => dashboard.id)).toEqual(
      expect.arrayContaining(['existing', 'incoming']),
    );
  });
});

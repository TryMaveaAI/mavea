// A dropped write used to fail in total silence: the store dispatched a quota event that nothing
// in the app listened to, so on a full localStorage every edit lived in memory only and vanished on
// the next reload, with the surface still showing it as saved. The dashboards surface now says so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Make the write the store actually performs fail with a quota error — the same shim the store's
 *  own canary test uses, since jsdom's localStorage inherits setItem from the prototype. The
 *  encrypted write is async, so the patch has to stay in place until `settled` observes it land. */
async function withFullStorage(
  run: () => void,
  settled: () => void | Promise<void>,
): Promise<void> {
  const holder = (
    Object.prototype.hasOwnProperty.call(localStorage, 'setItem')
      ? localStorage
      : Object.getPrototypeOf(localStorage)
  ) as { setItem: Storage['setItem'] };
  const original = holder.setItem;
  holder.setItem = () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  };
  try {
    run();
    await settled();
  } finally {
    holder.setItem = original;
  }
}

const makeDash = (id: string) =>
  ({
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
  }) as never;

describe('useQuotaDropped', () => {
  it('flips once a real write is refused, driven through the store', async () => {
    vi.stubGlobal('indexedDB', undefined); // force the vault's documented plaintext fallback
    const { useQuotaDropped } = await import('../src/live/dashboards/useDashboards');
    const { addDashboard } = await import('../src/live/dashboards/store');

    const { result } = renderHook(() => useQuotaDropped());
    expect(result.current).toBe(false);

    await act(async () => {
      await withFullStorage(
        () => addDashboard(makeDash('d1')),
        () => vi.waitFor(() => expect(result.current).toBe(true)),
      );
    });

    expect(result.current).toBe(true);
  });
});

describe('DashboardsApp — the dropped-write note', () => {
  it('stays quiet while storage is healthy', async () => {
    const { DashboardsApp } = await import('../src/live/dashboards/DashboardsApp');
    const { queryByRole } = render(<DashboardsApp />);
    expect(queryByRole('status')).toBeNull();
  });

  it('says a change may not survive a reload once storage refuses a write', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { DashboardsApp } = await import('../src/live/dashboards/DashboardsApp');
    const { addDashboard } = await import('../src/live/dashboards/store');

    const { findByRole, queryByRole } = render(<DashboardsApp />);

    await act(async () => {
      await withFullStorage(
        () => addDashboard(makeDash('d1')),
        () => vi.waitFor(() => expect(queryByRole('status')).not.toBeNull()),
      );
    });

    const note = await findByRole('status');
    expect(note.textContent).toContain('may not survive a reload');
  });
});

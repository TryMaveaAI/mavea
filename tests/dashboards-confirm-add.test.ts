// @vitest-environment jsdom
// The add-time reality gate (confirmAdd.ts): a live-flavored tile only stays on the board once
// the grounded probe confirmed IT — specifically — returns real data. Confirmation is per added
// metric, not per pass: the probe refreshes the whole board, so on a fold into a healthy board a
// pre-existing metric could carry the pass while the new tile got nothing. An unconfirmed CREATE
// removes the whole dashboard again; an unconfirmed FOLD strips everything the fold added
// (metrics, widgets, tripwires, the "Added: …" source row) and nothing that was already there;
// static boards (nothing to ground) confirm without spending a call; a busy refresh slot is
// waited out, never counted as confirmation.
//
// A CREATE that cannot confirm is KEPT and marked pending — deleting a board the user just made
// over a provider hiccup was honest about the data and brutal about the work. Nothing unverified
// is ever displayed either way: values only persist from a grounded pass.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../src/live/dashboards/types';

const probe =
  vi.fn<(id: string) => Promise<'done' | 'busy' | 'no-model' | 'failed' | 'unverified'>>();
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => probe(id),
}));

import { boardIds, confirmRealData } from '../src/live/dashboards/confirmAdd';
import {
  addDashboard,
  getDashboard,
  removeDashboard,
  updateDashboard,
} from '../src/live/dashboards/store';
import { clearLedger, getLedger } from '../src/live/dashboards/ledger';
import { trackerState } from '../src/live/dashboards/trackerState';

const dash = (over: Partial<Dashboard> = {}): Dashboard => ({
  id: 'd1',
  title: 'Test',
  question: 'mlb scores today',
  thesis: { text: 'the season is on', saidAt: 1 },
  tripwires: [],
  metrics: [],
  sources: [],
  widgets: [],
  cadence: { data: 'manual', ai: 'manual' },
  smartTrigger: false,
  alerts: { inApp: true, push: false },
  createdAt: 1,
  updatedAt: 1,
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
  ...over,
});

const metric = (over: Partial<Dashboard['metrics'][number]> = {}): Dashboard['metrics'][number] =>
  ({
    id: 'm1',
    label: 'MLB scores',
    query: 'MLB scores today',
    sourceQuote: { text: 'MLB scores', saidAt: 1 },
    lastValue: null,
    origin: 'empty',
    ...over,
  }) as Dashboard['metrics'][number];

/** A probe whose grounded pass fills the named metrics — what the real engine does on success. */
const groundingProbe = (...metricIds: string[]) =>
  probe.mockImplementation(async (id) => {
    const cur = getDashboard(id);
    if (cur) {
      updateDashboard(id, {
        metrics: cur.metrics.map((m) =>
          metricIds.includes(m.id) ? { ...m, lastValue: 3, origin: 'search' as const } : m,
        ),
      });
    }
    return 'done';
  });

beforeEach(() => {
  localStorage.clear();
  probe.mockReset();
  removeDashboard('d1');
  clearLedger();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('confirmRealData — create (whole board is the addition)', () => {
  it('keeps a board whose probe grounded its metric', async () => {
    addDashboard(dash({ metrics: [metric()] }));
    groundingProbe('m1');
    await expect(confirmRealData('d1', null)).resolves.toBe('confirmed');
    expect(getDashboard('d1')).not.toBeNull();
  });

  it("keeps a board whose pass 'landed' but never filled the tile, marked pending", async () => {
    // The engine can answer 'done' off a grounded no-change pass; a metric search cannot answer
    // stays empty forever. The tile is not CONFIRMED — but the board is not destroyed either.
    addDashboard(dash({ metrics: [metric()] }));
    probe.mockResolvedValue('done');
    await expect(confirmRealData('d1', null)).resolves.toBe('unverified');
    const kept = getDashboard('d1');
    expect(kept).not.toBeNull();
    expect(trackerState(kept!).status).toBe('pending');
    expect(kept!.metrics[0].lastValue).toBeNull(); // nothing unverified is ever shown
  });

  it('keeps a board whose probe could not verify with sources, and says what it waits on', async () => {
    addDashboard(dash({ metrics: [metric()] }));
    probe.mockResolvedValue('unverified');
    await expect(confirmRealData('d1', null)).resolves.toBe('unverified');
    const kept = getDashboard('d1');
    expect(kept).not.toBeNull();
    const st = trackerState(kept!);
    expect(st.status).toBe('pending');
    expect(st.status === 'pending' && st.failure?.kind).toBe('ungrounded');
  });

  it('keeps a board when there is no model to confirm with — the work is not the failure', async () => {
    addDashboard(dash({ metrics: [metric()] }));
    probe.mockResolvedValue('no-model');
    await expect(confirmRealData('d1', null)).resolves.toBe('no-model');
    const kept = getDashboard('d1');
    expect(kept).not.toBeNull();
    const st = trackerState(kept!);
    expect(st.status === 'pending' && st.failure?.kind).toBe('no-model');
  });

  it('confirms a STATIC board immediately — nothing to ground, no call spent', async () => {
    addDashboard(dash());
    await expect(confirmRealData('d1', null)).resolves.toBe('confirmed');
    expect(probe).not.toHaveBeenCalled();
    expect(getDashboard('d1')).not.toBeNull();
  });
});

describe('confirmRealData — the busy slot is waited out, never trusted', () => {
  it('a pass already in flight cannot confirm: the gate waits, then probes for real', async () => {
    vi.useFakeTimers();
    addDashboard(dash({ metrics: [metric()] }));
    groundingProbe('m1');
    probe.mockResolvedValueOnce('busy'); // the once-queue answers call 1; the grounding impl takes over after
    const result = confirmRealData('d1', null);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toBe('confirmed');
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('a slot that never frees refuses to confirm blind, and keeps the board pending', async () => {
    vi.useFakeTimers();
    addDashboard(dash({ metrics: [metric()] }));
    probe.mockResolvedValue('busy');
    const result = confirmRealData('d1', null);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toBe('unverified');
    const kept = getDashboard('d1');
    expect(kept).not.toBeNull();
    expect(trackerState(kept!).status).toBe('pending');
  });
});

describe('confirmRealData — fold (everything the fold added rolls back, nothing else)', () => {
  const existingWidget = {
    id: 'w-old',
    block: { type: 'insight', col: 12, id: 'b1', num: '1', props: { title: 'Old' } },
    span: 1,
    fromSource: 'manual',
  } as Dashboard['widgets'][number];
  const oldTripwire = {
    id: 't-old',
    label: 'old alert',
    metricId: 'm-old',
    comparator: 'gt',
    threshold: 1,
    sourceQuote: { text: 'x', saidAt: 1 },
    state: 'WATCHING',
  } as Dashboard['tripwires'][number];
  const oldSource = {
    kind: 'ORIGIN',
    conversationId: 'conv-old',
    title: 'Original ask',
    contributed: 'Seeded the board',
    at: 1,
  } as Dashboard['sources'][number];

  it('strips the folded metric, widget, tripwire, AND source row; keeps all originals', async () => {
    const beforeBoard = dash({
      widgets: [existingWidget],
      tripwires: [oldTripwire],
      sources: [oldSource],
    });
    const before = boardIds(beforeBoard);
    addDashboard(
      dash({
        metrics: [metric()],
        widgets: [
          existingWidget,
          { ...existingWidget, id: 'w-new', block: { ...existingWidget.block, id: 'b2' } },
        ],
        tripwires: [
          oldTripwire,
          { ...oldTripwire, id: 't-new', label: 'new alert', metricId: 'm1' },
        ],
        sources: [oldSource, { ...oldSource, conversationId: 'conv-new', at: 2 }],
      }),
    );
    probe.mockResolvedValue('unverified');
    await expect(confirmRealData('d1', before)).resolves.toBe('unverified');
    const after = getDashboard('d1');
    expect(after).not.toBeNull();
    expect(after!.metrics).toHaveLength(0); // the unconfirmed addition is gone
    expect(after!.widgets.map((w) => w.id)).toEqual(['w-old']);
    expect(after!.tripwires.map((t) => t.id)).toEqual(['t-old']); // no orphaned alert row
    expect(after!.sources.map((s) => s.conversationId)).toEqual(['conv-old']); // no phantom lineage
  });

  it("a healthy board's own metric cannot confirm an unanswerable new tile", async () => {
    // The high-severity hole: the probe refreshes the WHOLE board, and the old metric grounds —
    // pass says 'done' — while the new tile stays empty. Per-tile confirmation must reject it.
    const oldMetric = metric({ id: 'm-old', label: 'BTC', query: 'BTC price', lastValue: 60000 });
    const before = boardIds(dash({ metrics: [oldMetric] }));
    addDashboard(dash({ metrics: [oldMetric, metric({ id: 'm-new', label: 'invented' })] }));
    groundingProbe('m-old'); // the pass grounds ONLY the pre-existing metric
    await expect(confirmRealData('d1', before)).resolves.toBe('unverified');
    const after = getDashboard('d1');
    expect(after!.metrics.map((m) => m.id)).toEqual(['m-old']); // invented tile rolled back
  });

  it('a fold whose new tile actually grounds confirms and keeps both', async () => {
    const oldMetric = metric({ id: 'm-old', label: 'BTC', query: 'BTC price', lastValue: 60000 });
    const before = boardIds(dash({ metrics: [oldMetric] }));
    addDashboard(dash({ metrics: [oldMetric, metric({ id: 'm-new', label: 'ETH price' })] }));
    groundingProbe('m-old', 'm-new');
    await expect(confirmRealData('d1', before)).resolves.toBe('confirmed');
    expect(getDashboard('d1')!.metrics.map((m) => m.id)).toEqual(['m-old', 'm-new']);
  });
});

// A rollback is silent by construction: the sheet that started the probe stays dismissible for the
// up-to-45s it can run, and its caller drops the inline error when the user has moved on. So the
// board simply vanished, with nothing anywhere to say why. The check log is the durable record.
describe('confirmRealData — a rollback is never silent', () => {
  it('logs an unconfirmed create where check outcomes already live, without deleting it', async () => {
    addDashboard(dash({ title: 'Yankees', metrics: [metric()] }));
    probe.mockResolvedValue('unverified');

    await expect(confirmRealData('d1', null)).resolves.toBe('unverified');

    expect(getDashboard('d1')).not.toBeNull();
    const entry = getLedger().find((e) => e.text.includes('Yankees'));
    expect(entry?.kind).toBe('alert');
    expect(entry?.text).toContain('waiting on its first check');
    expect(entry?.searches).toBe(0);
  });

  it('names the board when a FOLD is rolled back, and points the entry at it', async () => {
    const oldMetric = metric({ id: 'm-old', label: 'BTC', query: 'BTC price', lastValue: 60000 });
    const before = boardIds(dash({ metrics: [oldMetric] }));
    addDashboard(
      dash({ title: 'Crypto', metrics: [oldMetric, metric({ id: 'm-new', label: 'invented' })] }),
    );
    groundingProbe('m-old');

    await expect(confirmRealData('d1', before)).resolves.toBe('unverified');

    const entry = getLedger().find((e) => e.text.includes('Crypto'));
    expect(entry?.kind).toBe('alert');
    expect(entry?.dashboardIds).toEqual(['d1']);
  });

  it('says nothing when the addition confirmed', async () => {
    addDashboard(dash({ title: 'Fine', metrics: [metric()] }));
    groundingProbe('m1');

    await expect(confirmRealData('d1', null)).resolves.toBe('confirmed');
    expect(getLedger().some((e) => e.text.includes('Fine'))).toBe(false);
  });
});

// Creating a board arms its first check, so the automatic loop usually claims the very dashboard
// the gate is about to probe. The gate used to wait that pass out and then fire an identical second
// search — two web searches billed per addition, and the user watching "Confirming live data…" for
// the length of both. It now takes the result the concurrent pass just landed.
describe('confirmRealData — a concurrent pass is used, not duplicated', () => {
  it('confirms off the in-flight pass instead of paying for a second search', async () => {
    addDashboard(dash({ metrics: [metric()] }));
    // Busy at first: the loop holds this dashboard. While we wait, its pass lands and grounds.
    probe.mockImplementation(async (id) => {
      const cur = getDashboard(id);
      updateDashboard(id, {
        metrics: (cur?.metrics ?? []).map((m) => ({
          ...m,
          lastValue: 3,
          origin: 'search' as const,
        })),
        lastRefreshedAt: Date.now(),
      });
      return 'busy';
    });

    await expect(confirmRealData('d1', null)).resolves.toBe('confirmed');
    // One call — the initial 'busy' answer, which spends nothing. No second search was issued.
    expect(probe).toHaveBeenCalledTimes(1);
    expect(getDashboard('d1')).not.toBeNull();
  });

  it('still refuses when that concurrent pass grounded nothing for the added tile', async () => {
    addDashboard(dash({ title: 'Ungrounded', metrics: [metric()] }));
    // The pass completes (lastRefreshedAt moves) but the added metric never fills in.
    probe.mockImplementation(async (id) => {
      updateDashboard(id, { lastRefreshedAt: Date.now() });
      return 'busy';
    });

    await expect(confirmRealData('d1', null)).resolves.toBe('unverified');
    const kept = getDashboard('d1');
    expect(kept).not.toBeNull();
    // A pass DID complete for this board (that is what we were waiting on), it just grounded
    // nothing for the added tile — so the tracker is not active, and the tile stays empty.
    expect(trackerState(kept!).status).not.toBe('active');
    expect(kept!.metrics[0].lastValue).toBeNull();
    expect(getLedger().some((e) => e.text.includes('Ungrounded'))).toBe(true);
  });
});

// The log entry has to name the actual cause. "No live source could confirm it" sends the reader to
// reword their ask; an unreachable model sends them to their key. Logging every refusal as the
// former pointed people at the wrong fix — including for a rollback caused by a missing key.
describe('confirmRealData — the log says WHY it was refused', () => {
  it('an ungrounded search reads as a source problem', async () => {
    addDashboard(dash({ title: 'Ungroundable', metrics: [metric()] }));
    probe.mockResolvedValue('unverified');

    await expect(confirmRealData('d1', null)).resolves.toBe('unverified');
    const entry = getLedger().find((e) => e.text.includes('Ungroundable'));
    expect(entry?.text).toContain('no live source could confirm');
  });

  it('a missing model reads as a model problem, not a source one', async () => {
    addDashboard(dash({ title: 'Keyless', metrics: [metric()] }));
    probe.mockResolvedValue('no-model');

    await expect(confirmRealData('d1', null)).resolves.toBe('no-model');
    const entry = getLedger().find((e) => e.text.includes('Keyless'));
    expect(entry?.text).toContain('no model was connected');
    expect(entry?.text).not.toContain('no live source');
  });

  it('an unreachable model reads as a reachability problem (after the bounded retries)', async () => {
    vi.useFakeTimers();
    addDashboard(dash({ title: 'Unreachable', metrics: [metric()] }));
    probe.mockResolvedValue('failed');

    const result = confirmRealData('d1', null);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('failed');
    expect(probe).toHaveBeenCalledTimes(3); // the first probe + two bounded retries
    expect(getLedger().find((e) => e.text.includes('Unreachable'))?.text).toContain(
      'could not be reached',
    );
  });

  // The failure that reaches the gate is usually a rate window that outlived the adapter's own
  // retry-after retries — a per-minute token cap saturated by a burst, which drains on its own in
  // seconds. Rolling the board back over that read as "adding never works" when nothing was wrong
  // with the tracker at all.
  it('a transient failure (rate window) recovers instead of rolling the board back', async () => {
    vi.useFakeTimers();
    addDashboard(dash({ title: 'RateLimited', metrics: [metric()] }));
    probe.mockResolvedValueOnce('failed');
    groundingProbe('m1'); // the retry gets through and grounds
    probe.mockResolvedValueOnce('failed'); // ...but only on the SECOND retry
    // (mockResolvedValueOnce entries consume before the grounding implementation takes over)

    const result = confirmRealData('d1', null);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('confirmed');
    expect(getDashboard('d1')).not.toBeNull();
    expect(getLedger().some((e) => e.text.includes('RateLimited'))).toBe(false);
  });
});

// pin.ts — the ONE shared path an answer takes onto a dashboard (PinToDashboard's sheet and
// Talk-to-dashboard's add both route through it). The properties that matter: a pin persists
// SYNCHRONOUSLY with the raw ask as each widget's standing refreshQuery (no UI ever blocks on
// the refine call again), the refine runs once per confirmed pin in the background and upgrades
// the stored query in place, a fresh card lands ahead of older content but behind the board's
// reasoning chrome, and the first check fires unless the caller says the data is already fresh.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from '../src/data/conversation';
import type { DataCadenceMode, Widget } from '../src/live/dashboards/types';

const h = vi.hoisted(() => ({
  apiKey: 'k' as string | undefined,
  refine: vi.fn<(ask: string, blockType: string, cfg: unknown) => Promise<string>>(),
  refresh: vi.fn((_id: string) => Promise.resolve('done' as const)),
}));

vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ provider: 'openai', models: {}, keys: {} }),
  toModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: h.apiKey }),
}));
vi.mock('../src/live/dashboards/useDashboardLoop', () => ({
  refreshDashboardNow: (id: string) => h.refresh(id),
}));
vi.mock('../src/live/dashboards/refineQuery', () => ({
  refineRefreshQuery: (ask: string, blockType: string, cfg: unknown) =>
    h.refine(ask, blockType, cfg),
}));

import { pinBlockToDashboard } from '../src/live/dashboards/pin';
import {
  addDashboard,
  addWidget,
  clearDashboards,
  createBlankDashboard,
  getDashboard,
  getDashboards,
  setWidgetRefreshQuery,
} from '../src/live/dashboards/store';

const block = (id: string, type = 'insight'): Block =>
  ({ id, type, col: 12, num: '1', props: { title: id } }) as Block;

const widget = (id: string, type = 'insight'): Widget => ({
  id,
  block: block(id, type),
  span: 1,
  fromSource: 'origin',
});

/** Flush the detached refine `.then` chain (two microtask hops covers mock resolve + setter). */
async function flushRefine(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  clearDashboards();
  localStorage.clear();
  h.apiKey = 'k';
  h.refine.mockReset();
  h.refine.mockResolvedValue('');
  h.refresh.mockClear();
});

describe('pinBlockToDashboard — new-board path', () => {
  const target = { new: { title: 'Rates watch', cadence: 'hourly' as DataCadenceMode } };

  it('creates the board with the chosen cadence, a wound clock, and the widget', () => {
    const res = pinBlockToDashboard({
      block: block('b1'),
      question: 'what is the 10-year yield today',
      target,
      now: 50_000,
    });
    expect(res).not.toBeNull();
    expect(res!.title).toBe('Rates watch');
    const dash = getDashboard(res!.dashboardId)!;
    expect(dash.cadence).toEqual({ data: 'hourly', ai: 'manual' });
    // An hourly board must actually come due — never parked at the blank-board sentinel.
    expect(dash.nextDataAt).toBe(50_000 + 60 * 60_000);
    expect(dash.question).toBe('what is the 10-year yield today');
    expect(dash.widgets).toHaveLength(1);
    expect(dash.widgets[0].fromSource).toBe('pin');
    // The raw ask serves as the standing query until the background refine lands.
    expect(dash.widgets[0].refreshQuery).toBe('what is the 10-year yield today');
    expect(h.refresh).toHaveBeenCalledWith(res!.dashboardId);
    // The durable first-check one-shot is armed too — survives refreshDashboardNow being a
    // no-op with no key, independent of whatever the cadence clock already says.
    expect(dash.oneShotAt).toBe(50_000);
    expect(dash.oneShotLabel).toBe('first check');
  });

  it('upgrades the stored refreshQuery once the background refine resolves', async () => {
    h.refine.mockResolvedValue('current US 10-year treasury yield');
    const res = pinBlockToDashboard({
      block: block('b1'),
      question: 'what is the 10-year yield today',
      target,
    })!;
    // Synchronous return — the refine must not have gated the pin.
    expect(getDashboard(res.dashboardId)!.widgets[0].refreshQuery).toBe(
      'what is the 10-year yield today',
    );
    await flushRefine();
    expect(getDashboard(res.dashboardId)!.widgets[0].refreshQuery).toBe(
      'current US 10-year treasury yield',
    );
    expect(h.refine).toHaveBeenCalledTimes(1);
  });

  it('never refines without a key — the raw ask simply stands', async () => {
    h.apiKey = undefined;
    const res = pinBlockToDashboard({ block: block('b1'), question: 'eth price', target })!;
    await flushRefine();
    expect(h.refine).not.toHaveBeenCalled();
    expect(getDashboard(res.dashboardId)!.widgets[0].refreshQuery).toBe('eth price');
  });

  it('a refine that falls back to the raw ask leaves the stored query untouched', async () => {
    h.refine.mockResolvedValue('eth price'); // refineRefreshQuery's own failure fallback
    const res = pinBlockToDashboard({ block: block('b1'), question: 'eth price', target })!;
    await flushRefine();
    expect(getDashboard(res.dashboardId)!.widgets[0].refreshQuery).toBe('eth price');
  });
});

describe('pinBlockToDashboard — existing-board path', () => {
  it('pins after the leading reasoning chrome, ahead of older content', () => {
    const dash = createBlankDashboard({ title: 'Macro', now: 1000 });
    dash.widgets = [
      {
        id: 'w-th',
        block: { type: 'thesis', col: 12, props: { reasoning: 'r' } },
        span: 2,
        fromSource: 'o',
      },
      {
        id: 'w-al',
        block: { type: 'alignmentgauge', col: 12, props: { pct: null } },
        span: 1,
        fromSource: 'o',
      },
      widget('w-old'),
    ];
    addDashboard(dash);
    const res = pinBlockToDashboard({ block: block('fresh'), question: 'q', target: dash.id })!;
    expect(res.title).toBe('Macro');
    expect(getDashboard(dash.id)!.widgets.map((w) => w.block.id ?? w.block.type)).toEqual([
      'thesis',
      'alignmentgauge',
      'fresh',
      'w-old',
    ]);
    expect(getDashboards()).toHaveLength(1); // pinned onto it, not a new board
    expect(h.refresh).toHaveBeenCalledWith(dash.id);
    // createBlankDashboard's parked board (manual, no clock) gets its first-check armed too —
    // otherwise a keyless pin onto it would never fetch, ever.
    expect(getDashboard(dash.id)!.oneShotAt).toBeDefined();
  });

  it('pins several blocks with ONE refine, one lineage row, and refreshQuery on all of them', async () => {
    h.refine.mockResolvedValue('live yankees results');
    const dash = createBlankDashboard({ title: 'Yankees', now: 1000 });
    addDashboard(dash);
    pinBlockToDashboard({
      block: [block('a', 'scoreboard'), block('b'), block('c')],
      question: 'add yankees scores',
      target: dash.id,
      fromSource: 'talk',
      firstCheck: false,
      source: { kind: 'ADDED', conversationId: 'talk', title: 'Asked', contributed: 'x', at: 1 },
    });
    const saved = getDashboard(dash.id)!;
    expect(saved.widgets.map((w) => w.block.id)).toEqual(['a', 'b', 'c']);
    expect(saved.widgets.every((w) => w.fromSource === 'talk')).toBe(true);
    expect(saved.sources.map((s) => s.kind)).toContain('ADDED');
    // Fresh-from-a-grounded-turn blocks: no immediate re-search, and no first-check one-shot
    // either — the content just came out of a grounded turn seconds ago, nothing to verify yet.
    expect(h.refresh).not.toHaveBeenCalled();
    expect(getDashboard(dash.id)!.oneShotAt).toBeUndefined();
    await flushRefine();
    expect(h.refine).toHaveBeenCalledTimes(1);
    expect(
      getDashboard(dash.id)!.widgets.every((w) => w.refreshQuery === 'live yankees results'),
    ).toBe(true);
  });

  it('returns null (and touches nothing) when the chosen board vanished mid-pick', () => {
    const res = pinBlockToDashboard({ block: block('b1'), question: 'q', target: 'gone' });
    expect(res).toBeNull();
    expect(h.refresh).not.toHaveBeenCalled();
    expect(getDashboards()).toHaveLength(0);
  });
});

describe('store — the pin path’s write primitives', () => {
  it('addWidget inserts at a position, clamped, defaulting to append', () => {
    const dash = createBlankDashboard({ title: 'T', now: 1 });
    dash.widgets = [widget('a'), widget('b')];
    addDashboard(dash);
    addWidget(dash.id, widget('front'), { at: 0 });
    addWidget(dash.id, widget('tail'));
    addWidget(dash.id, widget('clamped'), { at: 99 });
    expect(getDashboard(dash.id)!.widgets.map((w) => w.id)).toEqual([
      'front',
      'a',
      'b',
      'tail',
      'clamped',
    ]);
  });

  it('a positioned insert on a full board keeps the new card and drops the overflow, not the pin', () => {
    const dash = createBlankDashboard({ title: 'T', now: 1 });
    dash.widgets = Array.from({ length: 12 }, (_, i) => widget('w' + i));
    addDashboard(dash);
    addWidget(dash.id, widget('fresh'), { at: 0 });
    const ids = getDashboard(dash.id)!.widgets.map((w) => w.id);
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe('fresh');
    expect(ids).not.toContain('w11');
  });

  it('addWidget records provenance in the same write when given a source', () => {
    const dash = createBlankDashboard({ title: 'T', now: 1 });
    addDashboard(dash);
    addWidget(dash.id, [widget('a'), widget('b')], {
      source: { kind: 'ADDED', conversationId: 'talk', title: 'Asked', contributed: 'x', at: 2 },
    });
    const saved = getDashboard(dash.id)!;
    expect(saved.widgets).toHaveLength(2);
    expect(saved.sources.map((s) => s.kind)).toEqual(['ORIGIN', 'ADDED']);
  });

  it('setWidgetRefreshQuery touches only the named widgets and ignores empty text', () => {
    const dash = createBlankDashboard({ title: 'T', now: 1 });
    dash.widgets = [
      { ...widget('a'), refreshQuery: 'original a' },
      { ...widget('b'), refreshQuery: 'original b' },
    ];
    addDashboard(dash);
    setWidgetRefreshQuery(dash.id, ['a'], 'fresh standing query');
    setWidgetRefreshQuery(dash.id, ['b'], '   '); // blank never clobbers a working query
    const saved = getDashboard(dash.id)!;
    expect(saved.widgets.find((w) => w.id === 'a')!.refreshQuery).toBe('fresh standing query');
    expect(saved.widgets.find((w) => w.id === 'b')!.refreshQuery).toBe('original b');
  });
});

// A "blanks" block is a form asking the USER for values — legitimate on a canvas, a contradiction
// on a dashboard, whose premise is that values arrive from live search. One ungrounded turn
// auto-pinned its "paste the exact prices" scaffolding onto a board as trackable content.
describe('pinBlockToDashboard — never pins an ask-the-user form', () => {
  it('filters blanks blocks out of a pin, keeping the real content', () => {
    const dash = createBlankDashboard({ title: 'B', now: 1000 });
    addDashboard(dash);
    const res = pinBlockToDashboard({
      block: [block('real', 'insight'), block('form', 'blanks')],
      question: 'scores',
      target: dash.id,
    });
    expect(res).not.toBeNull();
    const types = getDashboard(dash.id)!.widgets.map((w) => w.block.type);
    expect(types).toContain('insight');
    expect(types).not.toContain('blanks');
  });

  it('a pin that was ONLY a form pins nothing at all', () => {
    const dash = createBlankDashboard({ title: 'B2', now: 1000 });
    addDashboard(dash);
    const before = getDashboard(dash.id)!.widgets.length;
    const res = pinBlockToDashboard({ block: block('form', 'blanks'), target: dash.id });
    expect(res).toBeNull();
    expect(getDashboard(dash.id)!.widgets).toHaveLength(before);
  });
});

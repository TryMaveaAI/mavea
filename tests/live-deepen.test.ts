// "Go deeper" drawers are authored ON OPEN, not eagerly (see live/depth/deepen):
//  • the eager turn asks only for section/order grouping tags — never for depth≥2 drawer
//    blocks — and parks a deepen context for the sections it produced;
//  • the drawer call is content-gated (deepenOffered), deduped in flight, cached across
//    opens, slim (minimal thinking, tier-standard block enum, no menu), and a failure is
//    NEVER memoised;
//  • a spec no live turn produced (a baked demo, the tour, a restored session) matches no
//    parked context, so it can never fire a call — the zero-call guarantee is structural.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';
import type { Block } from '../src/data/conversation';

const fake = {
  raw: '' as string | object,
  calls: 0,
  shouldThrow: false,
  lastReq: null as LiveRequest | null,
};

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    id: 'openrouter',
    capabilities: {
      constrainedDecoding: false,
      streaming: true,
      vision: false,
      contextWindow: 8192,
      strengthTier: 'mid' as const,
      nativeWebSearch: false,
    },
    probe: async () => ({ ok: true, model: true }),
    generate: async (req: LiveRequest): Promise<{ raw: string | object }> => {
      fake.calls += 1;
      fake.lastReq = req;
      if (fake.shouldThrow) throw new Error('rate limited');
      return { raw: fake.raw };
    },
  }),
}));

import { generateLive } from '../src/live/generateLive';
import { deepenSection } from '../src/live/depth/deepen';
import {
  rememberDeepenTurn,
  deepenOffered,
  __resetDeepenForTests,
} from '../src/live/depth/deepenStore';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

/** A standard section card, shaped like what depthLens hands SectionGroup. */
function card(type: string, title: string, extra: object = {}): Block {
  return {
    type,
    col: 6,
    delay: 0,
    id: 'live-1',
    num: '1',
    section: 'Flow control',
    order: 1,
    props: { title, ...extra },
  } as unknown as Block;
}

/** What the drawer call returns: a small, valid canvas of tier-standard blocks. */
const DRAWER_RAW = JSON.stringify({
  title: 'Flow control',
  narration: 'A worked window in action.',
  blocks: [
    { type: 'insight', props: { title: 'Worked example: a 4-packet window' } },
    { type: 'list', props: { title: 'Edge cases', items: ['zero window', 'silly window'] } },
  ],
});

beforeEach(() => {
  fake.raw = '';
  fake.calls = 0;
  fake.shouldThrow = false;
  fake.lastReq = null;
  __resetDeepenForTests();
});

describe('the eager turn no longer requests drawer blocks', () => {
  it('asks for section/order tags only — no depth≥2, no facet, no "add generously"', async () => {
    fake.raw = JSON.stringify({
      title: 'T',
      narration: 'A line.',
      blocks: [{ type: 'insight', props: { title: 'Point' } }],
    });
    await generateLive('explain how TCP works', [], cfg, undefined, { repair: false });
    const system = fake.lastReq!.system;
    expect(system).toContain('CONCEPT SECTIONS');
    expect(system).toContain('"section"');
    expect(system).toContain('"order"');
    // The drawer-content instructions are gone from the eager prompt entirely.
    expect(system).not.toContain('Add depth≥2 blocks GENEROUSLY');
    expect(system).not.toContain('"facet"');
    expect(system).not.toContain('"depth": 1');
  });

  it('parks a deepen context for the sections a live turn actually produced', async () => {
    fake.raw = JSON.stringify({
      title: 'TCP',
      narration: 'Here is TCP.',
      blocks: [
        { type: 'insight', section: 'Flow control', order: 1, props: { title: 'Windows' } },
        {
          type: 'list',
          section: 'Flow control',
          order: 1,
          props: { title: 'Terms', items: ['rwnd', 'cwnd'] },
        },
        { type: 'insight', section: 'Handshake', order: 2, props: { title: 'SYN, SYN-ACK, ACK' } },
      ],
    });
    await generateLive('explain how TCP works', [], cfg, undefined, { repair: false });
    expect(
      deepenOffered('Flow control', [
        card('insight', 'Windows'),
        card('list', 'Terms', { items: ['rwnd', 'cwnd'] }),
      ]),
    ).toBe(true);
    // A different label, or cards the turn never produced, match nothing.
    expect(deepenOffered('Congestion', [card('insight', 'Windows')])).toBe(false);
    expect(deepenOffered('Flow control', [card('insight', 'From a baked demo')])).toBe(false);
  });
});

describe('deepenSection — the on-open drawer call', () => {
  const standard = [card('insight', 'Windows'), card('chart', 'Window size over time')];

  function park(ask = 'explain how TCP works'): void {
    rememberDeepenTurn({ ask, cfg, tier: 'mid', blocks: standard });
  }

  it('resolves null with ZERO calls when no live turn parked a context (demo/tour/restored)', async () => {
    const blocks = await deepenSection('Flow control', standard);
    expect(blocks).toBeNull();
    expect(fake.calls).toBe(0);
  });

  it('resolves null with ZERO calls when the section does not match the parked turn', async () => {
    park();
    const blocks = await deepenSection('Flow control', [card('insight', 'From a baked demo')]);
    expect(blocks).toBeNull();
    expect(fake.calls).toBe(0);
  });

  it('requests once, slim: minimal thinking, tier-standard enum, no menu, bounded budget', async () => {
    park('deepen-slim');
    fake.raw = DRAWER_RAW;
    const blocks = await deepenSection('Flow control', standard);
    expect(fake.calls).toBe(1);
    expect(blocks?.length).toBe(2);
    // Drawer blocks live in their own id namespace so card chrome never aliases the canvas.
    expect(blocks![0].id).toMatch(/^deep-/);
    const req = fake.lastReq!;
    expect(req.thinkingLevel).toBe('minimal');
    expect(req.maxTokens).toBeLessThanOrEqual(1300);
    expect(req.system).toContain('GO DEEPER DRAWER');
    expect(req.system).not.toContain('CONCEPT SECTIONS'); // no per-turn suffix, no menu
    expect(req.tools).toBeUndefined();
    expect(req.blockTypes).toContain('insight');
    expect(req.blockTypes).not.toContain('sankey'); // tier-standard only, never the catalog
    // Bounded context: the ask, the section, and the cards it already shows.
    expect(req.user).toContain('Flow control');
    expect(req.user).toContain('Windows');
  });

  it('dedupes concurrent opens and serves later opens from cache — one call total', async () => {
    park('deepen-dedupe');
    fake.raw = DRAWER_RAW;
    const [a, b] = await Promise.all([
      deepenSection('Flow control', standard),
      deepenSection('Flow control', standard),
    ]);
    expect(fake.calls).toBe(1);
    expect(a).toEqual(b);
    // A later open (a remount, a re-expand) rides the first call.
    const again = await deepenSection('Flow control', standard);
    expect(fake.calls).toBe(1);
    expect(again).toEqual(a);
  });

  it('never memoises a failure — the next press gets a real attempt', async () => {
    park('deepen-retry');
    fake.shouldThrow = true;
    expect(await deepenSection('Flow control', standard)).toBeNull();
    expect(fake.calls).toBe(1);
    fake.shouldThrow = false;
    fake.raw = DRAWER_RAW;
    const blocks = await deepenSection('Flow control', standard);
    expect(fake.calls).toBe(2);
    expect(blocks?.length).toBe(2);
  });
});

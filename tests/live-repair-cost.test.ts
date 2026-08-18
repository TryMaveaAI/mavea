// The consistency repair's COST contract (see generateLive's repair pass):
//  • a lone 'low-variety' — the dominant trigger, a stylistic collapse rather than a wrong
//    answer — never buys a model round trip on its own;
//  • when a repair IS bought (a real hard issue like two blocks disagreeing on one number),
//    the request is SLIM: the system collapses to the stable cached base (no per-turn
//    component menu, no directive suffix), tools and attachments stay home, and only the
//    prior answer + the named issues travel. blockTypes stays so constrained-decoding
//    adapters keep their full enum.
// What counts as a hard issue (verify.ts) and which response wins (hardAfter < hardBefore)
// are deliberately NOT changed — these tests pin only the cost of asking.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

const fake = {
  raw: '' as string | object,
  rawByCall: null as (string | object)[] | null,
  calls: 0,
  /** Every request the adapter received, in order — the repair pins assert on reqs[1]. */
  reqs: [] as LiveRequest[],
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
      fake.reqs.push(req);
      const raw = fake.rawByCall ? (fake.rawByCall[fake.calls - 1] ?? fake.raw) : fake.raw;
      return { raw };
    },
  }),
}));

import { generateLive } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'openrouter', model: 'meta-llama/llama-3.3-8b', apiKey: 'k' };

beforeEach(() => {
  fake.raw = '';
  fake.rawByCall = null;
  fake.calls = 0;
  fake.reqs = [];
});

/** Eight clean staple blocks: consistent numbers, a real visual, ≥3 blocks — the ONLY hard
 *  issue checkConsistency finds is 'low-variety' (a ≥8-block canvas with zero specialized
 *  types). Before the gate, this bought a full repair round trip that was usually discarded. */
const STAPLES_ONLY = JSON.stringify({
  title: 'Jazz, mapped',
  narration: 'A quick tour of a century of jazz.',
  blocks: [
    { type: 'insight', props: { title: 'Jazz began in New Orleans', conf: 'strong' } },
    { type: 'list', props: { title: 'Eras', items: ['Swing', 'Bebop', 'Cool'] } },
    {
      type: 'kpi',
      props: { title: 'Milestones', kpis: [{ label: 'First recording', val: '1917' }] },
    },
    {
      type: 'chart',
      props: {
        title: 'Popularity over time',
        labels: ['1920', '1950', '1980'],
        series: [{ name: 'Listeners', color: 'var(--presence)', data: [3, 9, 5] }],
      },
    },
    {
      type: 'breakdown',
      props: {
        title: 'Subgenre share',
        rows: [
          { name: 'Swing era', val: '40', pct: 40 },
          { name: 'Bebop era', val: '35', pct: 35 },
          { name: 'Cool era', val: '25', pct: 25 },
        ],
      },
    },
    {
      type: 'timeline',
      props: {
        title: 'Key moments',
        events: [
          { time: '1917', title: 'First jazz record' },
          { time: '1959', title: 'Kind of Blue' },
        ],
      },
    },
    {
      type: 'compare',
      props: {
        options: [{ name: 'Bebop' }, { name: 'Cool' }],
        criteria: [{ label: 'Tempo', cells: [{ v: 'fast' }, { v: 'relaxed' }] }],
      },
    },
    {
      type: 'ring',
      props: { title: 'Improvisation share', rings: [{ label: 'Improvised', pct: 0.7 }] },
    },
  ],
});

/** Three blocks where the SAME labeled quantity carries two different values — a genuine
 *  'value-conflict' hard issue only a model can reconcile. */
const CONFLICTED = JSON.stringify({
  title: 'Savings plan',
  narration: 'Your future fund is on track.',
  blocks: [
    { type: 'insight', props: { title: 'You can hit the target', conf: 'inferred' } },
    { type: 'kpi', props: { title: 'Targets', kpis: [{ label: 'Future fund', val: '$1,800' }] } },
    {
      type: 'breakdown',
      props: {
        title: 'Allocation',
        rows: [
          { name: 'Future fund', val: '$1,100', pct: 60 },
          { name: 'Now fund', val: '$700', pct: 40 },
        ],
      },
    },
  ],
});

/** The reconciled version the repair returns: one consistent figure everywhere. */
const RECONCILED = JSON.stringify({
  title: 'Savings plan',
  narration: 'Your future fund is on track.',
  blocks: [
    { type: 'insight', props: { title: 'You can hit the target', conf: 'inferred' } },
    { type: 'kpi', props: { title: 'Targets', kpis: [{ label: 'Future fund', val: '$1,800' }] } },
    {
      type: 'breakdown',
      props: {
        title: 'Allocation',
        rows: [
          { name: 'Future fund', val: '$1,800', pct: 72 },
          { name: 'Now fund', val: '$700', pct: 28 },
        ],
      },
    },
  ],
});

describe('generateLive — a lone soft-in-cost issue never buys a repair round trip', () => {
  it('does NOT fire the repair call for low-variety alone (the dominant, oft-discarded trigger)', async () => {
    fake.raw = STAPLES_ONLY;
    const { spec } = await generateLive('tell me about the history of jazz', [], cfg);
    expect(fake.calls).toBe(1);
    // The answer itself is untouched — all eight staples render.
    expect(spec.blocks.length).toBeGreaterThanOrEqual(8);
  });
});

describe('generateLive — when a repair IS bought, the request is slim', () => {
  it('fires on a real hard issue, drops the menu/tools/attachments, keeps the block enum', async () => {
    fake.rawByCall = [CONFLICTED, RECONCILED];
    await generateLive('how should I split my savings this year', [], cfg, undefined, {
      attachments: [{ name: 'notes.txt', mime: 'text/plain', data: 'aGk=', size: 2 }],
    });
    expect(fake.calls).toBe(2);

    const first = fake.reqs[0];
    const repair = fake.reqs[1];
    // The MAIN call still carries the full per-turn prompt (menu + directives past the base).
    expect(first.system.length).toBeGreaterThan(first.systemBase!.length);
    expect(first.attachments?.length).toBe(1);
    // The repair collapses to the stable cached base: no per-turn suffix at all.
    expect(repair.systemBase).toBe(first.systemBase);
    expect(repair.system).toBe(repair.systemBase);
    expect(repair.system).not.toContain('BLOCK COUNT');
    expect(repair.system).not.toContain('CONCEPT SECTIONS');
    // No re-billed search, no resent files — the prior JSON already carries the answer.
    expect(repair.tools).toBeUndefined();
    expect(repair.attachments).toBeUndefined();
    // Constrained-decoding adapters still need the full enum for a rebuilt block to survive.
    expect(repair.blockTypes).toEqual(first.blockTypes);
    // The instruction names the defect; the prior answer rides as history, not as a re-ask.
    expect(repair.user).toContain('previous answer had these problems');
    expect(repair.history.some((m) => m.role === 'assistant' && m.content.includes('$1,100'))).toBe(
      true,
    );
  });
});

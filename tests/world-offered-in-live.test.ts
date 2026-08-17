// The one thing no other suite proved: a real Live turn actually ATTACHES a world to the answer.
//
// Every part of this chain was unit-tested and green while the feature was invisible in the app,
// because the decision sat in generateLive between them: the gate ran BEFORE the model answered, so
// it could only judge the question's wording, and the capability it read defaulted off. This test
// runs the real generateLive against a stub adapter and asserts on the blocks that come out.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const generated = vi.fn();

vi.mock('../src/live/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/providers')>();
  return {
    ...actual,
    getAdapter: () => ({
      id: 'anthropic',
      capabilities: { strengthTier: 'frontier', nativeSearch: false },
      generate: generated,
    }),
  };
});

import { generateLive, type LiveCaps } from '../src/live/generateLive';
import { liveJsonSchema } from '../src/live/providers/schema';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

/** A minimal well-formed answer. `causal` is what the model says about the answer it just wrote. */
const answer = (causal?: boolean): string =>
  JSON.stringify({
    title: 'The 2008 crisis',
    sub: 'What happened',
    narration: 'Cheap credit and loose lending built a bubble.',
    ...(causal === undefined ? {} : { causal }),
    blocks: [
      { type: 'insight', props: { title: 'Cheap credit', summary: 'Rates were held low.' } },
      { type: 'insight', props: { title: 'Loose lending', summary: 'Standards fell away.' } },
    ],
  });

/** A canvas thick enough that no recovery or repair pass fires — and that says nothing about
 *  whether the answer is causal, which is what a rewrite pass actually returns. */
const richAnswer = (): string =>
  JSON.stringify({
    title: 'The 2008 crisis',
    sub: 'What happened',
    narration: 'Cheap credit and loose lending built a bubble.',
    blocks: [
      { type: 'insight', props: { title: 'Cheap credit', summary: 'Rates were held low.' } },
      {
        type: 'chart',
        props: {
          title: 'Home prices',
          unit: 'index',
          labels: ['2004', '2006', '2008'],
          series: [{ name: 'Index', color: 'var(--insight)', data: [100, 140, 95] }],
        },
      },
      {
        type: 'kpi',
        props: {
          title: 'The scale',
          items: [
            { label: 'Peak', value: '140', sub: 'index, 2006' },
            { label: 'Trough', value: '95', sub: 'index, 2008' },
          ],
        },
      },
      {
        type: 'timeline',
        props: {
          eyebrow: 'How it unfolded',
          events: [
            { time: '2004', title: 'Rates held low', detail: 'Credit got cheap.' },
            { time: '2006', title: 'Prices peak', detail: 'Lending standards had fallen away.' },
            { time: '2008', title: 'Defaults cascade', detail: 'Payments reset upward.' },
          ],
        },
      },
    ],
  });

/** Thick enough to skip recovery, but carrying a one-point "trend" — the semantic mistake only a
 *  model can fix, which is what earns the consistency repair call. */
const brokenChartAnswer = (causal: boolean): string =>
  JSON.stringify({
    title: 'The 2008 crisis',
    sub: 'What happened',
    narration: 'Cheap credit and loose lending built a bubble.',
    causal,
    blocks: [
      { type: 'insight', props: { title: 'Cheap credit', summary: 'Rates were held low.' } },
      {
        type: 'chart',
        props: {
          title: 'Home prices',
          unit: 'index',
          labels: ['2006'],
          series: [{ name: 'Index', color: 'var(--insight)', data: [140] }],
        },
      },
      {
        type: 'kpi',
        props: {
          title: 'The scale',
          items: [
            { label: 'Peak', value: '140', sub: 'index, 2006' },
            { label: 'Trough', value: '95', sub: 'index, 2008' },
          ],
        },
      },
      {
        type: 'timeline',
        props: {
          eyebrow: 'How it unfolded',
          events: [
            { time: '2004', title: 'Rates held low', detail: 'Credit got cheap.' },
            { time: '2006', title: 'Prices peak', detail: 'Lending standards had fallen away.' },
            { time: '2008', title: 'Defaults cascade', detail: 'Payments reset upward.' },
          ],
        },
      },
    ],
  });

const worldBlocks = (blocks: readonly { type: string }[]) =>
  blocks.filter((b) => b.type === 'world');

async function run(ask: string, caps: LiveCaps, body: string) {
  generated.mockResolvedValue({ raw: body });
  const result = await generateLive(ask, [], cfg, undefined, { caps });
  return worldBlocks(result.spec.blocks as { type: string }[]);
}

describe('a Live turn attaches a world to its answer', () => {
  beforeEach(() => generated.mockReset());

  it('offers one when the model says the answer it wrote is causal', async () => {
    const worlds = await run(
      'why did the 2008 financial crisis happen',
      { worldEnabled: true },
      answer(true),
    );
    expect(worlds).toHaveLength(1);
  });

  it("offers one on the model's word even when the question does not LOOK causal", async () => {
    // The whole point of moving the decision after the answer: the model knows it explained a
    // mechanism, and no pattern over "tell me about Kodak" could have known that.
    const worlds = await run('tell me about Kodak', { worldEnabled: true }, answer(true));
    expect(worlds).toHaveLength(1);
  });

  it('falls back to the ANSWER when the model omits the field', async () => {
    // Not to the question. An answer that states two distinct causal relations has a web in it, and
    // that is what earns the card — see world-fitness for the reading itself.
    const explained = JSON.stringify({
      title: 'Why Kodak failed',
      sub: 'The mechanism',
      narration: 'Film margins collapsed because digital arrived, which drove the write-downs.',
      blocks: [
        { type: 'insight', props: { title: 'Digital arrived', summary: 'Sensors got cheap.' } },
        { type: 'insight', props: { title: 'Margins fell', summary: 'Film revenue went.' } },
      ],
    });
    expect(await run('why did Kodak fail', { worldEnabled: true }, explained)).toHaveLength(1);
  });

  it('offers nothing when the model omits the field and the answer explains nothing', async () => {
    // The regression this closes. The old fallback read the reader's words and refused only
    // lookups, artifact asks, procedures, comparisons and arithmetic — so a descriptive answer to
    // "tell me about elephants" got a world card that could only ever open onto nothing.
    const described = JSON.stringify({
      title: 'Elephants',
      sub: 'The largest land animals',
      narration: 'Elephants live in matriarchal herds across Africa and Asia.',
      blocks: [
        { type: 'insight', props: { title: 'Herds', summary: 'Led by the oldest female.' } },
        { type: 'insight', props: { title: 'Range', summary: 'Africa and Asia.' } },
      ],
    });
    expect(await run('tell me about elephants', { worldEnabled: true }, described)).toHaveLength(0);
  });

  it('stays out of the way when the model says the answer is not causal', async () => {
    const worlds = await run('why did Kodak fail', { worldEnabled: true }, answer(false));
    expect(worlds).toHaveLength(0);
  });

  it('offers nothing at all when the capability is off', async () => {
    const worlds = await run(
      'why did the 2008 financial crisis happen',
      { worldEnabled: false },
      answer(true),
    );
    expect(worlds).toHaveLength(0);
  });

  it('costs the turn no extra model call — the world is built when a reader opens it', async () => {
    // `repair: false` isolates what is being measured: a thin stub answer legitimately trips
    // verify's visual-presence floor and earns generateLive's ONE self-correct call, which has
    // nothing to do with the world. What must hold is that offering a world adds no call of its own.
    generated.mockResolvedValue({ raw: answer(true) });
    await generateLive('why did the 2008 financial crisis happen', [], cfg, undefined, {
      caps: { worldEnabled: true },
      repair: false,
    });
    expect(generated).toHaveBeenCalledTimes(1);
  });

  it('carries only the question until it is opened, so the card is free', async () => {
    generated.mockResolvedValue({ raw: answer(true) });
    const result = await generateLive('why did Kodak fail', [], cfg, undefined, {
      caps: { worldEnabled: true },
    });
    const card = (
      result.spec.blocks as unknown as { type: string; props: Record<string, unknown> }[]
    ).find((b) => b.type === 'world');
    expect(card?.props.title).toBe('why did Kodak fail');
    expect(card?.props.world).toBeUndefined();
  });
});

/** A definition ask, which the word-shape fallback refuses outright. Only the model's own verdict
 *  can earn this turn a world — so if a rewrite pass drops the verdict, the world disappears. */
const DEFINITION_ASK = 'what is a credit default swap';

describe('the causal verdict survives the response schema and every rewrite', () => {
  beforeEach(() => generated.mockReset());

  // A field the prompt asks for but the schema never declares is guided away by a constrained
  // sampler — the same failure the `sources` field hit before it was declared.
  it('is a field the model is allowed to emit', () => {
    const schema = liveJsonSchema() as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(schema.properties.causal?.type).toBe('boolean');
    expect(schema.required).not.toContain('causal');
  });

  it('survives a recovery pass that restructures the answer', async () => {
    // Two blocks on a substantive ask collapses, so generateLive re-asks for the whole answer.
    // The recovery instruction asks for blocks, not a causal judgement, so its silence must not
    // withdraw the world the first pass earned.
    generated
      .mockResolvedValueOnce({ raw: answer(true) })
      .mockResolvedValueOnce({ raw: richAnswer() });
    const result = await generateLive(DEFINITION_ASK, [], cfg, undefined, {
      caps: { worldEnabled: true },
    });
    expect(generated).toHaveBeenCalledTimes(2);
    expect(worldBlocks(result.spec.blocks as { type: string }[])).toHaveLength(1);
  });

  it('survives a consistency repair that rewrites the blocks', async () => {
    // The repair pass rebuilds the response from the repaired one; it is never asked to re-emit
    // the verdict, so the first pass's word has to be carried across.
    generated
      .mockResolvedValueOnce({ raw: brokenChartAnswer(true) })
      .mockResolvedValueOnce({ raw: richAnswer() });
    const result = await generateLive(DEFINITION_ASK, [], cfg, undefined, {
      caps: { worldEnabled: true },
    });
    expect(generated).toHaveBeenCalledTimes(2);
    // The repaired canvas is the one that shipped — otherwise this proves nothing about carrying
    // the verdict ACROSS a repair.
    const chart = (
      result.spec.blocks as unknown as { type: string; props: Record<string, unknown> }[]
    ).find((b) => b.type === 'chart');
    expect((chart?.props.labels as string[])?.length).toBe(3);
    expect(worldBlocks(result.spec.blocks as { type: string }[])).toHaveLength(1);
  });
});

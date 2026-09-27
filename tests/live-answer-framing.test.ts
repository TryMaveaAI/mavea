// generateLive's onFraming: the answer's narration, title and continuity hint, named once as its
// first card validates, so a follow-up can say what it is doing to the board before the cards
// land. What it names has to be what the finished answer carries, and asking for it must not
// change what the turn does with a stream it never painted.
import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';
import type { AnswerFraming } from '../src/live/generateLive';

const generated = vi.fn();

vi.mock('../src/live/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/providers')>();
  return {
    ...actual,
    getAdapter: () => ({
      id: 'openrouter',
      capabilities: { strengthTier: 'frontier', nativeSearch: false },
      generate: generated,
    }),
  };
});

import { generateLive } from '../src/live/generateLive';

const cfg: ModelConfig = { provider: 'openrouter', model: 'vendor/big', apiKey: 'k' };

const HEAD = `{"narration":"More on the leaf.","title":"Photosynthesis, Deeper","sub":"","continuity":"augment","blocks":[
  {"type":"list","props":{"title":"Inputs","items":["light","water","carbon dioxide"]}},
  {"type":"list","props":{"title":"Outputs","items":["glucose","oxygen"]}}`;
const WHOLE = `${HEAD}]}`;
/** The same answer cut off by the output ceiling: two finished cards and a third half-written. */
const CUT = `${HEAD},{"type":"list","props":{"title":"Ste`;

type Delta = (chunk: string, meta?: { reasoning?: boolean }) => void;
const streams = (text: string, end: 'return' | 'die' = 'return') =>
  generated.mockImplementation(async (_req: unknown, _cfg: unknown, onDelta?: Delta) => {
    for (let i = 0; i < text.length; i += 40) onDelta?.(text.slice(i, i + 40));
    if (end === 'die') throw new Error('stream stalled');
    return { raw: text };
  });

async function follow(text: string, end: 'return' | 'die' = 'return') {
  streams(text, end);
  const framings: AnswerFraming[] = [];
  const result = await generateLive('tell me more about the leaf', [], cfg, undefined, {
    onFraming: (f) => framings.push(f),
    repair: false,
  });
  return { result, framings };
}

describe('onFraming', () => {
  it('names the framing as the first card lands, and what the finished answer carries', async () => {
    const { result, framings } = await follow(WHOLE);
    const [f] = framings;
    expect(f.continuity).toBe('augment');
    expect(f.continuity).toBe(result.continuity);
    expect(f.title).toBe(result.spec.title);
    expect(f.narration).toBe(result.narration);
    expect(f.tier).toBe(result.tier);
    expect(result.spec.blocks.length).toBeLessThanOrEqual(f.ceiling);
  });

  it('tightens the ceiling to the final count once the blocks array closes', async () => {
    const { result, framings } = await follow(WHOLE);
    expect(framings).toHaveLength(2);
    // Two cards, plus the one world card that may still join.
    expect(framings[1].ceiling).toBe(3);
    expect(framings[1].ceiling).toBeLessThan(framings[0].ceiling);
    expect(result.spec.blocks.length).toBeLessThanOrEqual(framings[1].ceiling);
    // A reply cut off before the array closed never claims a final count.
    expect((await follow(CUT)).framings).toHaveLength(1);
  });

  it('holds back until a capable model has written its continuity hint', async () => {
    const { framings } = await follow(WHOLE.replace('"continuity":"augment",', ''));
    expect(framings).toHaveLength(0);
  });

  it('a reply cut off by the output ceiling keeps the hint the framing named', async () => {
    const { result, framings } = await follow(CUT);
    expect(framings[0]?.continuity).toBe('augment');
    expect(result.continuity).toBe('augment');
  });

  it('asking for the framing does not salvage a dead stream the reader never saw', async () => {
    const { result } = await follow(CUT, 'die');
    expect(result.error).toBeDefined();
  });

  it('names a hint the model wrote after the blocks, not the silence before it', async () => {
    // No tail is left to validate once the blocks close, so a framing read off the last validated
    // tail named no hint here — the cue said "adding" and the settle then replaced the board.
    const late = `${HEAD.replace('"continuity":"augment",', '')}],"chips":["a follow-up chip long enough to span several forty-character deltas"],"continuity":"replace"}`;
    const { result, framings } = await follow(late);
    expect(result.continuity).toBe('replace');
    expect(framings.map((f) => f.continuity)).toEqual(['replace']);
  });

  it("names the answer's title, not its first card's, when the title follows the blocks", async () => {
    // The framing's title reaches the cue's topic check; a card's title there can make the early
    // cue disagree with the settle.
    const late = `${HEAD.replace('"title":"Photosynthesis, Deeper",', '')}],"title":"Photosynthesis, Deeper"}`;
    const { result, framings } = await follow(late);
    expect(result.spec.title).toBe('Photosynthesis, Deeper');
    expect(framings.map((f) => f.title)).toEqual(['Photosynthesis, Deeper']);
  });

  it('names the title and narration as the finished answer shows them', async () => {
    // The narration arrives after the blocks, and both fields carry markup the screen must
    // never show.
    const late = `{"title":"[[CUDA|kooda]] Cores","continuity":"augment","sub":"","blocks":[
      {"type":"list","props":{"title":"Inputs","items":["light","water","carbon dioxide"]}}],
      "narration":"It runs on [[CUDA|kooda]], see [docs](https://example.com)."}`;
    const { result, framings } = await follow(late);
    expect(framings[0]?.title).toBe('CUDA Cores');
    expect(framings[0]?.title).toBe(result.spec.title);
    expect(framings[0]?.narration).toBe(result.narration);
    expect(framings[0]?.narration).not.toMatch(/\[|https/);
  });
});

// live-turn-salvage.test.ts — a stream that dies mid-answer must keep the blocks it already
// delivered.
//
// The failure this locks against, reported against OpenRouter `:free` routes: the adapter caps a
// whole turn's stream, and a slow route regularly outran that cap. generateLive's progressive
// parse had already validated a dozen blocks and painted them on the canvas — and then the abort
// threw every one of them away and replaced the answer the reader was reading with an error card.
// The blocks are real, validated model output; a turn that produced them is not a failed turn, it
// is a truncated one, and it now says so instead of vanishing.
import { describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

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

const cfg: ModelConfig = { provider: 'openrouter', model: 'vendor/big:free', apiKey: 'k' };

/** The head of a well-formed answer, cut off exactly where a capped stream would cut it: three
 *  complete blocks and a fourth left half-written, with no closing brace anywhere. */
const TRUNCATED = `{"title":"Photosynthesis","sub":"","narration":"Light becomes sugar.","blocks":[
  {"type":"insight","props":{"title":"Light arrives","summary":"Photons hit the leaf."}},
  {"type":"list","props":{"title":"Inputs","items":["light","water","carbon dioxide"]}},
  {"type":"list","props":{"title":"Outputs","items":["glucose","oxygen"]}},
  {"type":"list","props":{"title":"Ste`;

/** An adapter that streams `text` to the turn's partial parser and then dies, the way the total-
 *  stream cap kills a slow route: the deltas landed, the call never returned. */
const streamsThenDies = (text: string, message = 'stream stalled') =>
  generated.mockImplementation(
    async (
      _req: unknown,
      _cfg: unknown,
      onDelta?: (chunk: string, meta?: { reasoning?: boolean }) => void,
    ) => {
      // Delivered in chunks, so the scanner has to survive a split mid-token — the real thing.
      for (let i = 0; i < text.length; i += 40) onDelta?.(text.slice(i, i + 40));
      throw new Error(message);
    },
  );

/** The partial-render callback is what makes the turn buffer the stream at all, so every case
 *  here supplies one exactly as the surface does. */
const run = (opts: Record<string, unknown> = {}) =>
  generateLive('how does photosynthesis work', [], cfg, undefined, {
    onPartial: () => {},
    repair: false,
    ...opts,
  });

describe('a turn whose stream dies mid-answer', () => {
  it('keeps the blocks that already streamed instead of showing an error card', async () => {
    streamsThenDies(TRUNCATED);
    const result = await run();

    expect(result.error).toBeUndefined();
    expect(result.spec.blocks.length).toBeGreaterThanOrEqual(3);
    expect(result.spec.title).toBe('Photosynthesis');
  });

  it('says plainly that the answer was cut short', async () => {
    streamsThenDies(TRUNCATED);
    expect((await run()).spec.sub).toMatch(/cut short/i);
  });

  it('drops the half-written trailing block rather than rendering a fragment', async () => {
    streamsThenDies(TRUNCATED);
    const titles = (await run()).spec.blocks.map(
      (b) => (b as unknown as { props?: { title?: string } }).props?.title,
    );
    expect(titles).toContain('Outputs');
    expect(titles.some((t) => t?.startsWith('Ste'))).toBe(false);
  });

  // Counted as a delta rather than cleared between cases: clearing a mock that is holding a
  // rejected-promise result makes the runner re-surface that rejection as a failure of whichever
  // test is running next.
  it('never bills a recovery call for a route that just ran out of time', async () => {
    streamsThenDies(TRUNCATED);
    const before = generated.mock.calls.length;
    await run({ repair: undefined }); // repair/recovery ENABLED — they must still decline to fire
    expect(generated.mock.calls.length - before).toBe(1);
  });

  it('still surfaces the error when nothing streamed — there is no answer to keep', async () => {
    streamsThenDies('', 'openrouter 401 — invalid key');
    const result = await run();

    expect(result.error).toBeDefined();
    expect(result.spec.blocks).toHaveLength(0);
  });

  it('does not salvage a turn the USER cancelled — that one was superseded', async () => {
    streamsThenDies(TRUNCATED);
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await run({ signal: ctrl.signal });

    expect(result.error).toBeDefined();
    expect(result.spec.blocks).toHaveLength(0);
  });
});

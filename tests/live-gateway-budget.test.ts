// live-gateway-budget.test.ts — a gateway route must be budgeted as if it thinks.
//
// The failure this locks against, measured against OpenRouter's
// dots-studio/dots-3-note-preview:free: 2,806 reasoning tokens spent out of a 2,680-token
// completion budget, finish_reason 'length', and ZERO content tokens emitted. The turn never
// timed out and never truncated — the model simply spent the entire answer budget deliberating
// and wrote nothing, then the canvas collapsed to the "Here's what I can say" card.
//
// generateLive already reserved thinking room for the reasoning families it can NAME (the
// o-series, gpt-5). A gateway fronts every vendor, and reasoning models arrive there under names
// no pattern can predict, so the reservation has to be unconditional for the gateway.
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

const ANSWER = JSON.stringify({
  title: 'Jet engines',
  sub: '',
  narration: 'Air in, hot gas out.',
  blocks: [
    { type: 'insight', props: { title: 'Intake', summary: 'Air is drawn in.' } },
    { type: 'insight', props: { title: 'Compress', summary: 'Blades squeeze it.' } },
    { type: 'insight', props: { title: 'Burn', summary: 'Fuel ignites.' } },
  ],
});

/** Run one turn and report the output budget the adapter was handed. */
async function budgetFor(provider: ModelConfig['provider'], model: string): Promise<number> {
  generated.mockReset();
  generated.mockResolvedValue({ raw: ANSWER });
  await generateLive(
    'explain how a jet engine produces thrust',
    [],
    { provider, model, apiKey: 'k' },
    undefined,
    {
      repair: false,
    },
  );
  const [req] = generated.mock.calls[0] as unknown as [{ maxTokens: number }];
  return req.maxTokens;
}

describe('output budget on a gateway route', () => {
  it('reserves thinking room the way a named reasoning model does', async () => {
    // Enough for the JSON *plus* a real hidden pass — thousands, not the few hundred a
    // non-reasoning provider gets. 2,806 tokens of thinking were measured in the wild.
    expect(await budgetFor('openrouter', 'dots-studio/dots-3-note-preview:free')).toBeGreaterThan(
      2806,
    );
  });

  it('reserves it for a paid gateway route too — the id never says whether it thinks', async () => {
    expect(await budgetFor('openrouter', 'nvidia/nemotron-3-ultra-550b-a55b')).toBeGreaterThan(
      2806,
    );
  });

  it('leaves a provider that needs no headroom alone', async () => {
    const gateway = await budgetFor('openrouter', 'vendor/anything:free');
    const direct = await budgetFor('grok', 'grok-4.3');
    expect(direct).toBeLessThan(gateway);
    // The gateway's extra is the reasoning reservation, not a bigger canvas.
    expect(gateway - direct).toBeGreaterThanOrEqual(2000);
  });
});

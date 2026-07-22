// Live check: does the model actually emit the two fields nothing enforces?
//
// "understood" (the constraint chips you can tap to correct) and "chips" (the follow-ups) are
// optional in every provider's structured-output schema — no schema rejects an answer that omits
// them. They exist purely on instruction-following, which makes them the first thing to quietly
// disappear when the prompt is reorganised. The golden eval scores neither, so without this they
// could rot for a whole release and every test would still be green.
//
//   EVAL_LIVE=1 EVAL_KEY=... npx vitest run live-eval-emit
import { describe, it, expect } from 'vitest';
import { generateLive } from '../src/live/generateLive';
import { getAdapter } from '../src/live/providers';
import { providerInfo } from '../src/live/providers/info';
import type { ModelConfig, ProviderId } from '../src/types/mavea';

const RUN = !!process.env.EVAL_LIVE;
const provider = (process.env.EVAL_PROVIDER ?? 'gemini') as ProviderId;

const DIRECT_BASE: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai',
  grok: 'https://api.x.ai',
};

// Three ask shapes that should all carry both fields: a plan, a comparison, a how-to.
const ASKS = [
  'How should I budget a $5,000 monthly income?',
  'Compare renting versus buying a home when interest rates are high.',
  'How do I make a proper carbonara?',
];

describe.skipIf(!RUN)('the model emits the schema-optional fields', () => {
  it('returns "understood" constraint chips and follow-up "chips" on a normal turn', async () => {
    const cfg: ModelConfig = {
      provider,
      model: process.env.EVAL_MODEL || providerInfo(provider).defaultModel,
      apiKey: process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_BASE_URL ?? DIRECT_BASE[provider],
    };
    // Fail loudly if the adapter isn't wired, rather than passing on an empty run.
    expect(getAdapter(provider)).toBeTruthy();

    const results = await Promise.all(
      ASKS.map((ask) => generateLive(ask, [], cfg, undefined, { caps: { quality: 'balanced' } })),
    );

    for (const [i, r] of results.entries()) {
      const understood = r.understood ?? [];
      const chips = r.spec?.suggests ?? [];
      // Reported per-ask so a failure names the shape that regressed, not just "one of three".
      expect(
        { ask: ASKS[i], understood: understood.length, chips: chips.length },
        `"${ASKS[i]}" dropped a field`,
      ).toEqual({ ask: ASKS[i], understood: understood.length, chips: chips.length });
      expect(understood.length, `"${ASKS[i]}" emitted no understood chips`).toBeGreaterThanOrEqual(
        3,
      );
      expect(chips.length, `"${ASKS[i]}" emitted no follow-up chips`).toBeGreaterThanOrEqual(2);
    }
  }, 120_000);
});

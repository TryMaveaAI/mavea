// live-smoke.test.ts — exercises the FULL generateLive() path (adapter streaming →
// validate → autoFix → repair → spec) against a real model. Normally skipped; runs
// only with EVAL_LIVE=1. This is the closest thing to the browser turn, minus the
// dev-server proxy (we point baseUrl straight at the provider API).
import { generateLive } from '../src/live/generateLive';
import type { ModelConfig, ProviderId } from '../src/types/mavea';

const RUN = !!process.env.EVAL_LIVE;

// Direct API bases (no proxy in Node), mirroring the structural eval. Override via EVAL_BASE_URL.
const DIRECT_BASE: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai',
  grok: 'https://api.x.ai',
};

describe.skipIf(!RUN)('live smoke — full generateLive path', () => {
  it('produces a renderable multi-block spec for a real prompt', async () => {
    const provider = (process.env.EVAL_PROVIDER ?? 'gemini') as ProviderId;
    const cfg: ModelConfig = {
      provider,
      model: process.env.EVAL_MODEL || 'gemini-3.1-flash-lite',
      apiKey: process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_BASE_URL ?? DIRECT_BASE[provider],
    };
    const q = process.env.SMOKE_Q || 'plan me three days in tokyo';
    const res = await generateLive(q, [], cfg);

    console.log(
      `\nQ: ${q}\nNARRATION: ${res.narration}\nTITLE: ${res.spec.title}\nBLOCKS: [${res.spec.blocks.map((b) => b.type).join(', ')}]\nDETAIL: ${JSON.stringify(res.spec.blocks, null, 1).slice(0, 700)}`,
    );
  }, 120000);
});

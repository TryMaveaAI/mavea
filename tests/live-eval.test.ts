// live-eval.test.ts — the `npm run eval` entry. NORMALLY SKIPPED (no network in
// the default suite); runs only when EVAL_LIVE=1. It scores the connected model
// on the golden set through the REAL adapter + validation core, then prints a
// scorecard of accuracy AND latency — the artifact behind any "it's accurate /
// it's fast" claim.
//
// Run, e.g.:
//   EVAL_LIVE=1 EVAL_PROVIDER=anthropic EVAL_KEY=sk-ant-... npm run eval
//   EVAL_LIVE=1 EVAL_PROVIDER=gemini    EVAL_KEY=AIza...     npm run eval
import { select as selectComponents } from './helpers/select';
import { liveSystemPrompt, blockTypesForTier } from '../src/engine/liveSchema';
import { runEval } from '../src/live/eval/run';
import { GOLDEN } from '../src/live/eval/golden';
import { formatScorecard } from '../src/live/eval/score';
import { classifyAsk, isTeachingAsk } from '../src/live/select';

import { targetBlockCount, countDirective } from '../src/live/screen';
import { NARRATION_FIRST_LINE, spokenLineDirective } from '../src/live/effort';
import { getAdapter, providerInfo } from '../src/live/providers';
import type { ModelConfig, ProviderId } from '../src/types/mavea';

const RUN = !!process.env.EVAL_LIVE;
const provider = (process.env.EVAL_PROVIDER ?? 'gemini') as ProviderId;

// Direct API bases (no proxy in Node). Override any with EVAL_BASE_URL.
const DIRECT_BASE: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  // openrouter's adapter appends apiBase '/api', so the host alone is the base.
  openrouter: 'https://openrouter.ai',
  grok: 'https://api.x.ai',
};

describe.skipIf(!RUN)('live accuracy + speed eval', () => {
  it('scores the connected model on the golden set', async () => {
    const model = process.env.EVAL_MODEL || providerInfo(provider).defaultModel;
    const cfg: ModelConfig = {
      provider,
      model,
      apiKey: process.env.EVAL_KEY,
      baseUrl: process.env.EVAL_BASE_URL ?? DIRECT_BASE[provider],
    };
    const adapter = getAdapter(provider);
    const tier = adapter.capabilities.strengthTier;

    const only = process.env.EVAL_ONLY ? process.env.EVAL_ONLY.split(',') : undefined;
    const limit = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : undefined;
    const reps = process.env.EVAL_REPS ? Number(process.env.EVAL_REPS) : 1;
    const base = only
      ? GOLDEN.filter((c) => only.includes(c.id))
      : limit
        ? GOLDEN.slice(0, limit)
        : GOLDEN;
    // EVAL_REPS repeats the set — useful for catching non-deterministic flakes.
    const cases = Array.from({ length: reps }, () => base).flat();

    const card = await runEval(
      `${provider}:${model}`,
      async (ask) => {
        // Show the model the SAME per-turn hero menu the real app builds. Without it the eval
        // only ever exposes the base eight, so the model can't reach a specialized component and
        // any diversity number would be a meaningless zero. Validate against the SAME exposed set
        // (selection.allowed + the tier's standard dozen) so those picks survive into the score.
        const complexity = classifyAsk(ask);
        const selection = selectComponents({ userText: ask, tier, complexity });
        // liveSystemPrompt is complexity-aware (see liveSchema.ts) — pass it through so a
        // 'brief' golden case is scored against the SAME trimmed prompt production sends it,
        // not the always-rich prompt this eval used to hand-build.
        const baseSystem = selection.promptSnippet
          ? `${liveSystemPrompt(tier, complexity)}\n\n${selection.promptSnippet}`
          : liveSystemPrompt(tier, complexity);
        // The rest of the always-on, ask-driven per-turn directives generateLive.ts sends on
        // every real turn (block-count target and narration-length rule) — reusing its exact
        // exported builders rather than a hand-rolled, always-loose approximation, so a prompt
        // change to either can't silently drift the eval out of sync with production again.
        const target = targetBlockCount(complexity, { teaching: isTeachingAsk(ask) });
        const system = [
          baseSystem,
          countDirective(complexity, target),
          NARRATION_FIRST_LINE,
          spokenLineDirective(complexity),
        ].join('\n\n');
        const allowed = new Set([...selection.allowed, ...blockTypesForTier(tier)]);
        const out = await adapter.generate(
          { system, history: [], user: ask, blockTypes: selection.types, complexity },
          cfg,
        );

        if (process.env.EVAL_DUMP)
          console.log(
            `\n  Q: ${ask}\n  RAW: ${typeof out.raw === 'string' ? out.raw : JSON.stringify(out.raw)}`,
          );
        return { raw: out.raw, allowed, usage: out.usage };
      },
      {
        cases,
        onCase: (s, i, n) =>
          console.log(
            `  [${i + 1}/${n}] ${s.pass ? '✓' : '✗'} ${s.id}  [${s.produced.join(', ')}]` +
              (s.tokensOut != null ? `  ${s.tokensIn}→${s.tokensOut}tok` : ''),
          ),
      },
    );

    console.log(formatScorecard(card));
  }, 600_000);
});

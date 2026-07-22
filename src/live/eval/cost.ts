// cost.ts — dollar pricing for the models the eval actually runs, kept OUT of score.ts.
//
// score.ts is the pure structural scorer (unit-tested, no I/O); prices are volatile and
// provider-specific, so they don't belong there. The eval entry points and the A/B compare
// script import this to turn the token counts score.ts records into a real $/case number —
// the honest cost side of "answer fully at least cost". Numbers mirror providers/info.ts
// model blurbs ($input/$output per 1M tokens); cached input is billed ~10% of normal (Gemini
// implicit caching, OpenAI prefix caching), the payoff of a stable prompt prefix.
export interface ModelPrice {
  /** USD per 1M input tokens (uncached). */
  inPerM: number;
  /** USD per 1M output tokens. */
  outPerM: number;
  /** USD per 1M input tokens served from cache. */
  cachedInPerM: number;
}

/** $/1M tokens for the models the eval touches (answers + judge + the OpenAI cross-check).
 *  Keyed by the canonical model id; priceFor also matches a provider-prefixed id (OpenRouter). */
export const EVAL_PRICES: Record<string, ModelPrice> = {
  'gemini-3.1-flash-lite': { inPerM: 0.25, outPerM: 1.5, cachedInPerM: 0.025 },
  'gemini-3.5-flash': { inPerM: 1.5, outPerM: 9, cachedInPerM: 0.15 },
  'claude-haiku-4-5': { inPerM: 1, outPerM: 5, cachedInPerM: 0.1 },
  'claude-sonnet-5': { inPerM: 2, outPerM: 10, cachedInPerM: 0.2 },
  'gpt-5.4': { inPerM: 2.5, outPerM: 15, cachedInPerM: 0.25 },
  'gpt-5.4-mini': { inPerM: 0.75, outPerM: 4.5, cachedInPerM: 0.075 },
  'gpt-5.4-nano': { inPerM: 0.2, outPerM: 1.25, cachedInPerM: 0.02 },
  'gpt-5.6-luna': { inPerM: 1, outPerM: 6, cachedInPerM: 0.1 },
  'grok-4.3': { inPerM: 1.25, outPerM: 2.5, cachedInPerM: 0.31 },
  'grok-4.5': { inPerM: 2, outPerM: 6, cachedInPerM: 0.5 },
};

/** The price for a model id, tolerant of a provider prefix ('google/gemini-3.1-flash-lite') or a
 *  version suffix — returns the entry whose key the id ends with, or undefined when unpriced. */
export function priceFor(model: string): ModelPrice | undefined {
  if (EVAL_PRICES[model]) return EVAL_PRICES[model];
  const hit = Object.keys(EVAL_PRICES).find((k) => model.endsWith(k) || model.includes(k));
  return hit ? EVAL_PRICES[hit] : undefined;
}

/** USD for one turn's token counts. `cached` is the slice of `in` billed at the cheap rate — it is
 *  charged once at cachedInPerM, and the remaining (in − cached) at the full input rate. */
export function costUSD(t: { in: number; out: number; cached: number }, p: ModelPrice): number {
  const uncachedIn = Math.max(0, t.in - t.cached);
  return (uncachedIn * p.inPerM + t.cached * p.cachedInPerM + t.out * p.outPerM) / 1_000_000;
}

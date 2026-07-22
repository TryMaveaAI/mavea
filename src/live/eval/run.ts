// run.ts — the eval loop. Provider-agnostic: hand it a `generate` function and a
// model label, it runs every golden case through the REAL validation core
// (validateLiveResponse) and the pure scorer, then aggregates a Scorecard.
//
// Phase 0 ships this loop + the pure scorer + unit tests. Phase 1 supplies a real
// `generate` (a ProviderAdapter bound to a ModelConfig) so `npm run eval` can
// score llama3.2:3b vs qwen2.5:3b vs Claude Haiku vs GPT vs Gemini on identical
// inputs. The loop never throws: a thrown/failed generation scores as invalid.
import { validateLiveResponse, type LiveResponse } from '../../engine/liveSchema';
import { autoFix } from '../verify';
import { GOLDEN, type GoldenCase } from './golden';
import { aggregate, scoreCase, type Scorecard, type CaseScore } from './score';
import type { TokenUsage } from '../providers/types';

/** What a generate call yields: raw model output, optionally wrapped with the per-ask `allowed`
 *  block set the prompt actually exposed (and, when the adapter reports it, the turn's token
 *  `usage`). Without the `allowed` set the eval would validate against the base eight and drop
 *  every specialized block BEFORE scoring — so a diversity number would always read zero. A bare
 *  string/object still works (validates against default, no usage). */
type Wrapped = { raw: string | object; allowed?: ReadonlySet<string>; usage?: TokenUsage };
export type GenResult = string | object | Wrapped;
export type GenerateFn = (ask: string) => Promise<GenResult>;

/** Normalize a GenResult to { raw, allowed, usage }. A wrapped result carries `raw` (+ optional
 *  `allowed`/`usage`) and never `blocks`; a bare PARSED model response is a LiveResponse-shaped
 *  object (it has `blocks`/`narration`, not `raw`), so the `!('blocks' in g)` guard keeps a
 *  response that happens to carry a top-level `raw` key from being mistaken for the wrapper. */
function unwrap(g: GenResult): Wrapped {
  return g !== null && typeof g === 'object' && 'raw' in g && !('blocks' in g)
    ? (g as Wrapped)
    : { raw: g as string | object };
}

export interface RunOptions {
  /** Cases to run (defaults to the full GOLDEN set). */
  cases?: GoldenCase[];
  /** Called after each case — lets a CLI stream progress. */
  onCase?: (score: CaseScore, index: number, total: number) => void;
}

/**
 * Run `generate` over the golden set and aggregate a Scorecard.
 * Sequential by design — a single local model has one slot, and an eval is not
 * latency-sensitive. (Hosted providers could parallelize; not worth it for ~25.)
 */
export async function runEval(
  model: string,
  generate: GenerateFn,
  opts: RunOptions = {},
): Promise<Scorecard> {
  const cases = opts.cases ?? GOLDEN;
  const scores: CaseScore[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    let resp: LiveResponse | null;
    let usage: TokenUsage | undefined;
    const start = performance.now();
    try {
      const unwrapped = unwrap(await generate(c.ask));
      usage = unwrapped.usage;
      const validated = validateLiveResponse(unwrapped.raw, unwrapped.allowed);
      // Reflect the shipped path: deterministic autoFix runs on every turn.
      resp = validated ? autoFix(validated) : null;
    } catch {
      resp = null; // network/parse failure → scored as invalid, never throws
    }
    const score = scoreCase(c, resp);
    score.latencyMs = Math.round(performance.now() - start);
    if (usage) {
      score.tokensIn = usage.input;
      score.tokensOut = usage.output;
      score.tokensCached = usage.cachedInput;
    }
    scores.push(score);
    opts.onCase?.(score, i, cases.length);
  }
  return aggregate(model, scores);
}

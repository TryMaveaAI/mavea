// speed.ts — learn how FAST each connected model actually is, so a slow one gets a leaner answer.
//
// Capability tier (ProviderCapabilities.strengthTier) says how WELL a model fills components; it says
// nothing about how LONG it takes. A capable-but-slow hosted model (some OpenRouter routes run ~14s a
// turn) is handed the same 30-component menu and 8-18 block target as a 2s model, so it's pushed to
// emit a big JSON — which IS the wait. This module measures a per-model throughput (output tokens per
// second, smoothed) from real turns and classifies it into a SPEED tier. The generation path then
// shrinks the menu + block count + token budget for a 'slow' model, so it emits less and finishes
// sooner. Pure + storage-backed: it never blocks, and a missing/again-broken store degrades to
// 'standard'.
//
// Measurement alone was not enough, because it could only ever learn from a turn that SUCCEEDED —
// see KNOWN_SLOW_ROUTE_RE and recordTurnStall below for the two holes that left, and why the
// models that most need the lean treatment were the ones structurally unable to earn it.
import { isFreeRoute } from './providers/route';

const KEY = 'mavea.live.modelSpeed.v1';

export type SpeedTier = 'fast' | 'standard' | 'slow';

interface Rec {
  /** Smoothed output tokens per second (EWMA). */
  tps: number;
  /** How many turns have contributed — used to require a little evidence before we act. */
  n: number;
}

// Tokens/sec thresholds. A snappy hosted model runs well above FAST; a sluggish route sits below
// SLOW. The band between is 'standard' (today's behaviour). Deliberately conservative so we only ever
// trim a model that is genuinely, repeatedly slow — never a fast one having one bad turn.
const SLOW_TPS = 28;
const FAST_TPS = 75;
/** Need at least this many measured turns before trusting the average enough to change behaviour. */
const MIN_SAMPLES = 2;

/** A turn that ended with NO answer is only evidence of slowness if we actually waited. A rejected
 *  key, an unsupported parameter, or a bad model id comes back in well under a second — that is a
 *  broken request, not a slow model, and folding it in would libel a fast one. */
const STALL_MS = 20_000;

function load(): Record<string, Rec> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Rec>) : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, Rec>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota — speed adaptation is best-effort, never required */
  }
}

/**
 * Fold one finished turn into the model's throughput estimate. `outChars` is the length of the raw
 * model output (tokens ≈ chars/4 — exact count isn't needed, only the relative rate); `genMs` is the
 * wall time the generation took. Ignores turns too small or too quick to measure reliably.
 */
export function recordTurnSpeed(model: string, outChars: number, genMs: number): void {
  if (!model || genMs < 400 || outChars < 200) return;
  fold(model, outChars / 4 / (genMs / 1000));
}

/**
 * Fold a turn that produced NO usable answer — a time-out, a mid-stream stall, an abort at the
 * adapter's total-stream cap — into the same estimate, using whatever did stream (`outChars`, often
 * zero) over the time we waited.
 *
 * This exists because recordTurnSpeed ran only after a successful `generate`, so a model that timed
 * out every single turn was never measured, stayed 'standard' forever, and kept being handed the
 * full-size ask that was timing it out. A failure after `STALL_MS` is the strongest speed evidence
 * a turn can produce; discarding it made the adaptation unreachable for exactly the models it was
 * written for. The caller must not report a turn the USER cancelled — that measures the reader.
 */
export function recordTurnStall(model: string, outChars: number, genMs: number): void {
  if (!model || genMs < STALL_MS) return;
  // Nothing streamed in three minutes is a rate of zero, and the average has to stay a positive
  // finite number to keep classifying — so the sample floors just above zero rather than at it.
  fold(model, Math.max(outChars / 4 / (genMs / 1000), 0.1));
}

/** Fold one throughput sample into the model's smoothed average. */
function fold(model: string, tps: number): void {
  if (!Number.isFinite(tps) || tps <= 0) return;
  const all = load();
  const cur = all[model];
  // Weight new evidence at 0.4 so the tier tracks a real shift (a model getting slower under load)
  // without lurching on a single outlier.
  all[model] = { tps: cur ? cur.tps * 0.6 + tps * 0.4 : tps, n: (cur?.n ?? 0) + 1 };
  save(all);
}

/**
 * The model's measured speed tier — or, until we've seen enough turns to judge, the prior its route
 * id implies.
 *
 * A free route starts at 'slow' rather than 'standard'. Handed the full frontier treatment (a
 * ~8k-token system prompt, a 30-component menu, an 18-block target, a ~5k-token output budget) it
 * routinely could not finish inside the adapter's total-stream cap: the canvas rendered the blocks
 * that streamed, then the abort threw the answer away. Measurement alone could never fix that,
 * because a turn had to SUCCEED to be measured. The prior is only a starting point — real turns
 * overrule it in BOTH directions, so a free route that proves fast earns 'fast' on the same
 * evidence as any other model.
 */
export function speedTierFor(model: string): SpeedTier {
  const r = load()[model];
  if (!r || r.n < MIN_SAMPLES) return isFreeRoute(model) ? 'slow' : 'standard';
  if (r.tps < SLOW_TPS) return 'slow';
  if (r.tps > FAST_TPS) return 'fast';
  return 'standard';
}

/** Test seam: forget all learned speeds. */
export function resetModelSpeedForTest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}

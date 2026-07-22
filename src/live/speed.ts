// speed.ts — learn how FAST each connected model actually is, so a slow one gets a leaner answer.
//
// Capability tier (ProviderCapabilities.strengthTier) says how WELL a model fills components; it says
// nothing about how LONG it takes. A capable-but-slow hosted model (some OpenRouter routes run ~14s a
// turn) is handed the same 30-component menu and 8-18 block target as a 2s model, so it's pushed to
// emit a big JSON — which IS the wait. This module measures a per-model throughput (output tokens per
// second, smoothed) from real turns and classifies it into a SPEED tier. The generation path then
// shrinks the menu + block count + token budget for a 'slow' model, so it emits less and finishes
// sooner. Pure + storage-backed: it never blocks, the first turn for an unseen model is 'standard'
// (no penalty until we've actually measured it), and a missing/again-broken store degrades to that.
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
  const tps = outChars / 4 / (genMs / 1000);
  if (!Number.isFinite(tps) || tps <= 0) return;
  const all = load();
  const cur = all[model];
  // Weight new evidence at 0.4 so the tier tracks a real shift (a model getting slower under load)
  // without lurching on a single outlier.
  all[model] = { tps: cur ? cur.tps * 0.6 + tps * 0.4 : tps, n: (cur?.n ?? 0) + 1 };
  save(all);
}

/** The model's measured speed tier, or 'standard' until we've seen enough turns to judge. */
export function speedTierFor(model: string): SpeedTier {
  const r = load()[model];
  if (!r || r.n < MIN_SAMPLES) return 'standard';
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

// screen.ts — how many blocks an answer should produce.
//
// A RICH answer fills the screen: a fixed count leaves a big monitor half-empty and crams a
// laptop, so the density is derived from the actual viewport — roughly one card per ~150k
// px² of viewport area, calibrated so a typical laptop fills with ~9-10 blocks and a large
// display with up to ~18. Used at conversation start (the opening seed) and on every wipe
// (a replace turn) so a fresh canvas always reaches the bottom of the screen.
//
// A LEAN answer is the exception: a genuinely trivial ask ("what is 1+1") deserves a couple
// of focused blocks, not a wall of charts — so its count is small and viewport-independent.
import type { AskComplexity } from './select';

const PX_PER_CARD = 150_000;
const MIN_BLOCKS = 8;
const MAX_BLOCKS = 18;
/** A teaching/learning ask lands a COMPLETE first lesson (definition → mechanism → worked example
 *  → variants → pitfalls), so its floor is higher than a generic rich ask — the learner should
 *  never have to say "more in depth". Only the floor is lifted; a big monitor already exceeds it
 *  from the viewport and the MAX_BLOCKS ceiling still caps it. */
const TEACH_MIN_BLOCKS = 11;
/** A trivial ask still gets a small, complete spread — never a lone card. We give it the
 *  direct answer PLUS a couple of related/adjacent visuals (like a demo answer), so "1+1"
 *  shows the result and a beat of context, not one number floating in space. Viewport-aware
 *  within a tight band: a laptop fills with ~4-5, a big display up to the ceiling. */
const LEAN_MIN_BLOCKS = 3;
const LEAN_MAX_BLOCKS = 9;
const LEAN_PX_PER_CARD = 320_000; // sparser than a rich canvas, but never a single card

/** A deliberately BRIEF answer (the user asked for "short" / "one line") is a couple of blocks,
 *  viewport-independent — screen size must never inflate an answer the user wanted tight. */
const BRIEF_BLOCKS = 3;

/** Extra block budget for depth≥2 "Go deeper" drawer content on teaching answers.
 *  These blocks live in collapsible drawers and do NOT appear on the main canvas,
 *  so they don't inflate the visible floor or slow first paint. */
export const DEEP_BLOCKS = 6;

/** Target block count for an answer of the given complexity. A 'rich' (default) answer
 *  fills the current viewport; a 'lean' one stays small; a 'brief' one is tight regardless of
 *  screen. Falls back to a sensible count off-DOM (e.g. the Node eval runner), so callers never
 *  need to guard. */
export function targetBlockCount(
  complexity: AskComplexity = 'rich',
  opts: { teaching?: boolean } = {},
): number {
  if (complexity === 'brief') return BRIEF_BLOCKS;
  const w = typeof window === 'undefined' ? 1440 : window.innerWidth || 1440;
  const h = typeof window === 'undefined' ? 900 : window.innerHeight || 900;
  if (complexity === 'lean') {
    const n = Math.round((w * h) / LEAN_PX_PER_CARD);
    return Math.max(LEAN_MIN_BLOCKS, Math.min(LEAN_MAX_BLOCKS, n));
  }
  // A teaching ask raises only the floor — a big viewport already aims higher, and MAX_BLOCKS caps it.
  const floor = opts.teaching ? TEACH_MIN_BLOCKS : MIN_BLOCKS;
  if (typeof window === 'undefined') return opts.teaching ? TEACH_MIN_BLOCKS : 10;
  const n = Math.round((w * h) / PX_PER_CARD);
  return Math.max(floor, Math.min(MAX_BLOCKS, n));
}

/** The per-turn BLOCK COUNT directive for the system prompt — sized to the ask's depth. Shared
 *  by generateLive (the live path) and the eval harness, so the eval measures the SAME prompt the
 *  app sends rather than the bare static one. `target` is the viewport-derived count for the tier.
 *
 *  The rich copy is deliberately CONTENT-DRIVEN, not "exactly N or it's a failure": go rich when
 *  the topic has the substance (it usually does), but never pad with filler to hit a number and
 *  never cut real content to look tidy — completeness decides the count. The brief copy honors an
 *  explicit short-answer request; the lean copy keeps a trivial ask focused. */
export function countDirective(complexity: AskComplexity, target: number): string {
  if (complexity === 'brief')
    return `BLOCK COUNT — override any number above: the user explicitly asked for a SHORT answer, so give a TIGHT reply of 1 to 3 blocks. Lead with the single direct answer (an insight, or the one visual that fits it), add at most one supporting block, and STOP. Do NOT expand it into a dashboard or pre-answer extra questions — brevity is what they asked for, and a tight, complete answer is the GOAL here, not a failure.`;
  if (complexity === 'lean')
    return `BLOCK COUNT — override any number above: this is a simple question, so keep it focused — about ${target} blocks, and ALWAYS at least 3 (never a single lone card). Lead with the direct answer, then add a couple of RELATED or adjacent visuals that give it context — the way a good explainer doesn't just state a fact but shows a beat around it (e.g. for "1+1" → the result, then a tiny number-line or a related-facts strip; for "capital of France" → the answer, then a key-stats kpi and a related-places list). Keep it small and clean — NOT a full dashboard — but never bare.`;
  return `BLOCK COUNT — override any number above: size the canvas to the answer's REAL SUBSTANCE, not to a fixed number. This is a substantive question, so go rich and wide — aim for around ${target} blocks when the topic genuinely has that much to show (it usually does), filling the screen with varied, real visuals. But never pad with filler just to hit a number, and never cut real content to look tidy: if the COMPLETE answer needs more than ${target}, add them. HARD FLOOR: always emit at least 3 blocks — never 1 or 2, even for a simple topic. A good answer is the direct answer block PLUS supporting context and a related visual.`;
}

// screen.ts — how many blocks an answer should produce.
//
// A RICH answer fills the screen: a fixed count leaves a big monitor half-empty and crams a
// laptop, so the density is derived from the actual viewport — roughly one card per ~175k
// px² of viewport area, so a typical laptop lands ~7 blocks and a large display ~9. Used at
// conversation start (the opening seed) and on every wipe (a replace turn) so a fresh canvas
// always reaches the bottom of the screen.
//
// The ceiling is a READING limit, not a screen one, and it is measured rather than picked: across
// the recorded sessions this repo ships, a real answer lands between four and twelve blocks with a
// median of seven — and twelve is where the canvas stops reading as one answer. Past nine cards the
// spotlight walk (a handful of leads) never points at the tail, the narration — one paragraph,
// however many cards — finishes while blocks are still arriving, and every extra card is billed
// output the reader pays for on their own key. So the density fills the viewport up to the point a
// person can still take the whole answer in, and stops there: nine.
//
// A LEAN answer is the exception: a genuinely trivial ask ("what is 1+1") deserves a couple
// of focused blocks, not a wall of charts — so its count is small and viewport-independent.
import type { AskComplexity } from './select';

const PX_PER_CARD = 175_000;
const MIN_BLOCKS = 5;
export const MAX_BLOCKS = 9;
/** A teaching/learning ask lands a COMPLETE first lesson (definition → mechanism → worked example
 *  → variants → pitfalls), so its floor is higher than a generic rich ask — the learner should
 *  never have to say "more in depth". Seven is that arc plus a beat of room: pinning it against
 *  the ceiling would leave a lesson no band to size itself inside. Only the floor is lifted; a big
 *  monitor already exceeds it from the viewport and the MAX_BLOCKS ceiling still caps it. */
const TEACH_MIN_BLOCKS = 7;
/** A trivial ask still gets a small, complete spread — never a lone card. We give it the
 *  direct answer PLUS a couple of related/adjacent visuals (like a demo answer), so "1+1"
 *  shows the result and a beat of context, not one number floating in space. Viewport-aware
 *  within a tight band: a laptop fills with ~4, a big display up to six. The ceiling has to stay
 *  clearly UNDER the rich one — at nine, a large display answered "what is 1+1" with as much
 *  canvas as a substantive question, which is the screen inflating an answer nobody asked for. */
export const LEAN_MIN_BLOCKS = 3;
export const LEAN_MAX_BLOCKS = 6;
const LEAN_PX_PER_CARD = 320_000; // sparser than a rich canvas, but never a single card

/** The floor a RICH ask states in its prompt. Deliberately well above the schema's `minItems`:
 *  the schema number REJECTS an answer (which costs the reader the recovery re-ask), while this
 *  one only shapes what the model aims for. Models differ here — one will happily overshoot the
 *  target while another lands short of it on the same ask — so a stated floor is what pulls the
 *  short one up, and it is a no-op for a model already clearing it. 5 is not a new number: it is
 *  the floor generateLive's collapse recovery has always demanded of a rich ask. */
export const RICH_FLOOR_BLOCKS = 5;

/** A deliberately BRIEF answer (the user asked for "short" / "one line") is a couple of blocks,
 *  viewport-independent — screen size must never inflate an answer the user wanted tight. */
const BRIEF_BLOCKS = 3;

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
  if (typeof window === 'undefined') return opts.teaching ? TEACH_MIN_BLOCKS : 7;
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
    return `BLOCK COUNT — override any number above: this is a simple question, so keep it focused — between ${LEAN_MIN_BLOCKS} and ${LEAN_MAX_BLOCKS} blocks, aiming for about ${target} on this screen. ${LEAN_MIN_BLOCKS} is a hard floor (never a single lone card). Lead with the direct answer, then add a couple of RELATED or adjacent visuals that give it context — the way a good explainer doesn't just state a fact but shows a beat around it (e.g. for "1+1" → the result, then a tiny number-line or a related-facts strip; for "capital of France" → the answer, then a key-stats kpi and a related-places list). Keep it small and clean — NOT a full dashboard — but never bare.`;
  return `BLOCK COUNT — override any number above: size the canvas to the answer's REAL SUBSTANCE, not to a fixed number. This is a substantive question, so go rich and wide — emit between ${RICH_FLOOR_BLOCKS} and ${MAX_BLOCKS} blocks, aiming for around ${target} on this screen when the topic genuinely has that much to show (it usually does), filling the screen with varied, real visuals. Choose the number inside that range from the content: never pad with filler just to hit it, and never cut real content to look tidy. ${RICH_FLOOR_BLOCKS} is a HARD FLOOR — never fewer, even for a simple topic — and ${MAX_BLOCKS} is a hard ceiling. A good answer is the direct answer block PLUS supporting context and a related visual.`;
}

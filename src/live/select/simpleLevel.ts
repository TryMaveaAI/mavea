// simpleLevel.ts — per-turn explanation-level override.
//
// The persisted setting (config.explainLevel) is the baseline, but a turn can ask for a
// different level in plain language: "explain like I'm 5", "simpler", "eli5" force 'simple';
// "go deeper", "more detail", "normal" force back to 'standard'. Pure detectors, mirroring
// isTeachAsk — word-bounded, zero-dependency, never throw. The un-simple trigger lets a user
// climb back out mid-conversation without opening settings.
export type ExplainLevel = 'standard' | 'simple';

// "like i'm 5/10/five/ten", "explain simply/simpler", "in simple terms", "dumb it down",
// "eli5"/"eli10", "keep it simple".
const SIMPLE_ASK =
  /\b(like i'?m (5|10|five|ten)|explain (it )?simpl(y|er)|in simple terms|simpl(er|y)|dumb it down|eli ?(5|10)|keep it simple)\b/i;

// "go deeper", "more detail/depth/advanced/technical/rigorous", "in depth", "normal/standard level".
const STANDARD_ASK =
  /\b(go deeper|more (detail|depth|advanced|technical|rigorous)|in[- ]depth|normal (level|mode)|standard (level|mode))\b/i;

/** True when the ask explicitly requests the simplest explanation. */
export function simpleAsk(text: string | null | undefined): boolean {
  return !!text && SIMPLE_ASK.test(text);
}

/** True when the ask explicitly requests the normal / deeper explanation. */
export function standardAsk(text: string | null | undefined): boolean {
  return !!text && STANDARD_ASK.test(text);
}

/** The effective level for THIS turn: a voice/text trigger overrides the persisted base for one
 *  turn. If a user contradicts themselves in one line, 'simple' wins (the safer surprise — a
 *  too-simple answer is friendlier than an unexpectedly dense one). No trigger → the base. */
export function effectiveExplainLevel(
  text: string | null | undefined,
  base: ExplainLevel,
): ExplainLevel {
  if (simpleAsk(text)) return 'simple';
  if (standardAsk(text)) return 'standard';
  return base;
}

/** The prompt fragment for SIMPLE level — appended to the system prompt only on a simple turn.
 *  Plainer words AND simpler visuals, but orthogonal to block count: the canvas can still be
 *  full; it's the language and the visual choices that get simpler, never the correctness. */
export function simpleLevelMenu(): string {
  return (
    'EXPLANATION LEVEL — SIMPLE: explain this as you would to a curious beginner. ' +
    'WORDS: short sentences, everyday words, and a concrete real-world analogy for any hard idea; ' +
    'spell out jargon the first time or avoid it. The "narration", every tour "say", and every ' +
    'block "note" follow this — warm and plain, never a lecture. ' +
    'VISUALS: prefer FEWER, SIMPLER blocks over dense or specialized ones — reach for kpi, list, ' +
    'timeline, breakdown, a single labelled diagram, or one clear chart rather than stacking ' +
    'advanced components; cap any one figure to a handful of parts. Give EVERY block a one-line ' +
    'plain-language "note", and add short captions/labels so nothing needs prior knowledge to ' +
    'read. Still ANSWER fully and correctly — simpler, not thinner or vaguer.'
  );
}

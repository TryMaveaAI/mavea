// simpleLevel.ts — per-turn explanation-level override.
//
// The persisted setting (config.explainLevel) is the baseline, but a turn can ask for a
// different level in plain language: "explain like I'm 5", "simpler", "eli5" force 'simple';
// "go deeper", "more detail", "the technical version" force 'deep'; "normal/standard mode"
// returns to 'standard'. Pure detectors, mirroring isTeachAsk — word-bounded, zero-dependency,
// never throw. The triggers let a user move between levels mid-conversation without settings.
export type ExplainLevel = 'standard' | 'simple' | 'deep';

// "like i'm 5/10/five/ten", "explain simply/simpler", "in simple terms", "dumb it down",
// "eli5"/"eli10", "keep it simple".
const SIMPLE_ASK =
  /\b(like i'?m (5|10|five|ten)|explain (it )?simpl(y|er)|in simple terms|simpl(er|y)|dumb it down|eli ?(5|10)|keep it simple)\b/i;

// "go deeper", "more detail/depth/advanced/technical/rigorous", "in depth", "expert level",
// "full detail" — the vocabulary of wanting the whole picture.
const DEEP_ASK =
  /\b(go deeper|more (detail|depth|advanced|technical|rigorous)|in[- ]depth|expert (level|mode|version)|full detail|the technical version)\b/i;

// "normal/standard level/mode" — an explicit return to the middle from either end.
const STANDARD_ASK = /\b(normal (level|mode)|standard (level|mode))\b/i;

/** True when the ask explicitly requests the simplest explanation. */
export function simpleAsk(text: string | null | undefined): boolean {
  return !!text && SIMPLE_ASK.test(text);
}

/** True when the ask explicitly requests the in-depth treatment. */
export function deepAsk(text: string | null | undefined): boolean {
  return !!text && DEEP_ASK.test(text);
}

/** True when the ask explicitly requests the normal middle level. */
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
  if (deepAsk(text)) return 'deep';
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
    'block "note" and "study" margin note follow this — warm and plain, never a lecture. A ' +
    'simple "study" still teaches: keep the outside fact in "pattern", just say it in plain words. ' +
    'VISUALS: prefer FEWER, SIMPLER blocks over dense or specialized ones — reach for kpi, list, ' +
    'timeline, breakdown, a single labelled diagram, or one clear chart rather than stacking ' +
    'advanced components; cap any one figure to a handful of parts. Give EVERY block a one-line ' +
    'plain-language "note", and add short captions/labels so nothing needs prior knowledge to ' +
    'read. Still ANSWER fully and correctly — simpler, not thinner or vaguer.'
  );
}

/** The prompt fragment for IN-DEPTH level — the full-rigor treatment. More mechanism and
 *  precision, never padding: depth is extra substance on top of a complete answer. */
export function deepLevelMenu(): string {
  return (
    'EXPLANATION LEVEL — IN-DEPTH: the user wants the full-depth treatment. Assume a smart, ' +
    'motivated reader after the real mechanics, not a survey. ' +
    'WORDS: name the actual mechanisms, formulas, trade-offs, edge cases, and failure modes; ' +
    'quantify wherever you honestly can; use the precise domain terms (define one once in ' +
    'passing, then use it freely). Every block "study" carries that rigor too — a real ' +
    'assumption an expert would challenge, a "pattern" that adds the mechanism or the benchmark ' +
    'behind the number, and a "test" a practitioner would actually run. ' +
    'VISUALS: reach for the substantive specialized components when they carry the detail ' +
    'better than the simple ones, and let the canvas run toward the larger end of the block ' +
    'budget when the topic genuinely warrants it. Depth is EXTRA rigor and coverage on top of ' +
    'a complete answer — never padding, repetition, or hedging; every added block must earn ' +
    'its place with real content.'
  );
}

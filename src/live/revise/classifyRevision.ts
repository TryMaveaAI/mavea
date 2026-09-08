// classifyRevision.ts — does this ask REVISE what is already on the board?
//
// The canvas can update cards in place ('refine'), but that mode was unreachable in practice: the
// prompt tells the model to prefer 'augment' whenever a follow-up could go either way, and the
// local classifier can only ever emit replace or augment on its own. Measured across every
// recorded session this repo ships — four demo personas and the tour corpus — the modes were 26
// replace, 2 augment, 0 refine. So an answer that says "make it $2,000" appended a second budget
// card beside the first instead of changing the one the reader was looking at.
//
// This is the missing half of the signal, and it comes from the reader's OWN words rather than
// from the model: a revision ask names something on screen and tells it to be different.
//
// Deliberately conservative, and asymmetric on purpose. A missed revision costs an extra card the
// reader can ignore; a wrong one silently rewrites a card they were reading and loses their place.
// So everything uncertain is NOT a revision. Same shape as select/complexity.ts: small,
// word-bounded, zero-dep, identical on every model, and it never throws.

/** Tell an on-screen value to become something else. */
const IMPERATIVE =
  /\b(make it|make that|change (?:it|that|the)|set (?:it|that|the)|update (?:it|that|the)|adjust|recalculate|recompute|re-?do (?:it|that)|redo|swap|replace (?:it|that|the)|bump|round (?:it|that)|cap (?:it|that)|lower|raise|drop the|remove the|take out|use .{1,30}\binstead)\b/;

/** Correct something already said — the reader supplying a fact the answer got wrong. */
const CORRECTION =
  /\b(actually|correction|that'?s wrong|that is wrong|not right|should be|ought to be|it'?s actually|no,? it'?s|i meant|fix (?:it|that|the))\b/;

/** A new constraint on a figure the board already carries ("under $2,000", "max 5 days"). */
const CONSTRAINT =
  /\b(instead of|rather than|no more than|at most|under|below|max(?:imum)?|min(?:imum)?|cap(?:ped)? at|budget of|keep it (?:to|under|below))\b\s*[^.?!]{0,24}[\d$£€]/;

/**
 * A brand-new question, even when it is worded like an instruction. These beat the patterns above:
 * "tell me about X instead" is a new subject, not an edit of the current one, and "what should be
 * the next step" trips CORRECTION's "should be" without asking for anything to change.
 */
const NEW_ASK =
  /\b(what|who|when|where|why|how|which|tell me about|explain|show me|compare|walk me through)\b/;

export function classifyRevision(userText: string): boolean {
  if (typeof userText !== 'string') return false;
  // Smart quotes are the default on iOS and macOS, so "no, it’s 12" is what a reader actually
  // types — matching only the ASCII apostrophe would miss half of the real corrections.
  const t = userText
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  if (!t) return false;
  // A question is an ask, not an edit — unless it also issues a direct instruction, which is how
  // a real revision often arrives ("can you make it $2,000?").
  const asks = NEW_ASK.test(t);
  const commands = IMPERATIVE.test(t);
  if (asks && !commands) return false;
  return commands || CORRECTION.test(t) || CONSTRAINT.test(t);
}

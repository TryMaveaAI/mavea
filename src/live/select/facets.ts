// facets.ts — detect a COMPOUND ask, so the model answers every part instead of just the first.
//
// "Tell me about Inception and its cast", "what's the capital of France and its population", "explain
// photosynthesis; also how does respiration differ" — these carry two (or more) distinct asks, and a
// model under a block budget will sometimes answer one and silently drop the rest. We can't reliably
// SPLIT natural language into clean facets with a regex (and a wrong split would fragment a perfectly
// good single answer), so this is deliberately HIGH-PRECISION: it fires only on signals that are
// almost always genuinely multi-part, and the result is a gentle "cover every part" prompt nudge —
// never a hard restructuring. Same spirit as the rest of the brain: word-bounded, zero-dep, no throw.

// Two or more question marks → unmistakably more than one question.
const MULTI_Q = /\?[^?]*\?/;
// Explicitly ADDITIVE connectors — these almost never join one concept (unlike a bare "and", which
// does in "pros and cons" / "salt and pepper"). "and also", "as well as", "in addition", "plus tell
// me", "; also", "what about".
const ADDITIVE =
  /\b(?:and also|as well as|in addition(?: to)?|on top of that|also,?\s+(?:what|how|why|tell|show|give|explain|list)|plus\s+(?:what|how|tell|show|give|explain)|;\s*(?:also|and)\b|what about|how about)\b/;
// "both X and Y" / "each of" — an explicit ask to cover multiple items.
const EXPLICIT_BOTH = /\b(both .+ and |each of (?:these|them|the)|all (?:three|four|of these))\b/;

/**
 * True when the ask is clearly COMPOUND — multiple distinct things to answer. Conservative: it stays
 * false for an ordinary single ask and for fixed "X and Y" phrases, so the directive it gates only
 * appears when it genuinely helps. Requires a reasonably substantial ask (a one-liner is rarely a
 * dropped-facet risk).
 */
export function isMultiPart(userText: string): boolean {
  const text = userText.toLowerCase();
  if (text.split(/\s+/).length < 6) return false; // too short to drop a part
  return MULTI_Q.test(userText) || ADDITIVE.test(text) || EXPLICIT_BOTH.test(text);
}

/** The per-turn nudge: make the model address EVERY part of a compound ask. '' when single-part. */
export function multiPartDirective(userText: string): string {
  if (!isMultiPart(userText)) return '';
  return 'MULTIPLE PARTS — this question asks for more than one thing. Answer EVERY part, giving each its own block (or blocks); never address only the first part and drop the rest. If the parts relate, still make each one clearly present on the canvas.';
}

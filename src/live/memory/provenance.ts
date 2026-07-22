// provenance.ts — decide WHERE a fact came from, which decides how far Mavéa may trust it.
//
// The single most important guard in the memory system: a fact whose only origin is the model's
// own output must never be re-injected later as established truth (that's how a one-turn
// hallucination becomes a permanent "fact"). So at write time we classify each candidate fact by
// its real source. Only facts grounded in the user's own words — or in a cited web source — are
// later injected as fact; everything else is injected as a clearly-labelled, unconfirmed guess.
//
// Classification is a cheap, deterministic heuristic (no LLM call): a model-authored body that
// echoes what the user actually said is upgraded to `user-stated` — UNLESS it asserts a numeric
// value the user never wrote (the signature of a fabricated figure), which stays unconfirmed even
// when the surrounding words echo the question ("your rate is 7.2%" when the user only ASKED).
import type { MemorySource } from './store';
import { tokenSet, overlap } from './text';

/** A model-authored fact is treated as the user's own only when most of its content words appear
 *  in what the user actually typed/said this turn — high enough to mean "this restates the user",
 *  not "this happens to share a couple of words". */
const ECHO_THRESHOLD = 0.6;
/** A corrected value counts as the user's own when this fraction of its content words echo the
 *  user's text — lower than ECHO_THRESHOLD because a correction value is short and specific. */
const VALUE_THRESHOLD = 0.5;

export interface ClassifyOpts {
  /** True when the turn was grounded by a web search with cited sources. */
  webGrounded?: boolean;
}

/** Normalised digit-groups in a string ("$5,200" and "5200" both → "5200") so a figure the user
 *  wrote and one the model wrote can be compared. Tokenisation drops bare numbers, so figures must
 *  be matched separately — otherwise a fabricated "7.2%" rides in on its topic words. */
function numbers(s: string): string[] {
  return (s.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.+$/, ''));
}

/** True when the body asserts a number the user never wrote — a fabricated figure that must not be
 *  promoted to user-stated even if its words echo the question. */
function hasUngroundedNumber(body: string, userText: string): boolean {
  const bodyNums = numbers(body);
  if (!bodyNums.length) return false;
  const userNums = new Set(numbers(userText));
  return bodyNums.some((n) => !userNums.has(n));
}

/**
 * Classify the trust tier of a model-authored memory body against the user's own words.
 * - echoes the user's words AND invents no figure → 'user-stated'   (injected as fact)
 * - turn was web-grounded                         → 'web-grounded'  (injected as fact)
 * - otherwise                                     → 'model-inferred' (injected as an unconfirmed guess)
 */
export function classifySource(
  body: string,
  userText: string,
  opts: ClassifyOpts = {},
): MemorySource {
  // A fabricated figure can never be "user-stated", even if the surrounding words echo the
  // question. This is the core real-data guard for numeric claims.
  if (!hasUngroundedNumber(body, userText)) {
    const factTokens = tokenSet(body);
    const userTokens = tokenSet(userText);
    // overlap(fact, user) = fraction of the fact's words the user actually said.
    if (factTokens.size > 0 && overlap(factTokens, userTokens) >= ECHO_THRESHOLD) {
      return 'user-stated';
    }
  }
  if (opts.webGrounded) return 'web-grounded';
  return 'model-inferred';
}

/**
 * Classify a model-declared correction by whether the USER actually supplied the corrected value
 * this turn. A genuine correction ("no, it's 6.4%") grounds the figure → 'user-stated'; a model
 * that spontaneously "corrects" itself with a value the user never gave stays 'model-inferred'
 * (injected as an unconfirmed guess — the verify hint fires either way). The `corrects` JSON field
 * is model-authored, so it cannot be trusted as user input without this check.
 */
export function classifyCorrectionSource(value: string, userText: string): MemorySource {
  const valNums = numbers(value);
  const userNums = new Set(numbers(userText));
  // A numeric correction is the user's only when every figure it names appears in their text.
  if (valNums.length)
    return valNums.every((n) => userNums.has(n)) ? 'user-stated' : 'model-inferred';
  // A non-numeric correction is the user's when its words echo what they said.
  const valTokens = tokenSet(value);
  return valTokens.size > 0 && overlap(valTokens, tokenSet(userText)) >= VALUE_THRESHOLD
    ? 'user-stated'
    : 'model-inferred';
}

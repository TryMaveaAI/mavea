// route.ts — what a MODEL ROUTE ID states about itself, in one pure place so the layers that act
// on it cannot drift apart: the speed prior (../speed), the adapter's stream cap
// (./openaiCompatible), Ripple's work plan (../ripple/ingest/tier), and the picker's hint
// (../setup/ModelSelect). No imports — a route id is a string, and every one of those layers
// needs the same answer from it.

/** An OpenRouter `:free` variant. Not a discount on the same service: a separate, heavily
 *  rate-limited pool that queues behind every other free user, so it is slow by construction
 *  rather than by bad luck, and a turn sized for a paid route routinely outruns the clock on it.
 *  Matched at the route SUFFIX and a word boundary, so a model merely named "…free…"
 *  ("acme/freeform-7b", "acme/carefree") is untouched. */
export function isFreeRoute(model: string): boolean {
  return /:free\b/i.test(model);
}

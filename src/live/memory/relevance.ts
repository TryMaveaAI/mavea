// Whether the user's personal memory is relevant to *this* turn.
//
// Memory should quietly help personal, contextual, and factual questions — but a creative or
// ephemeral ask ("make a funny poem", "tell me a joke") should neither pull the user's profile
// into the prompt nor be written back as a new "fact", and should never trigger the Track-it
// nudge. This is the "be smart about WHEN to use memory" gate: relevance, not just recency.
//
// Conservative by design — it only suppresses memory for clearly creative/ephemeral asks and
// defaults to relevant, so a normal personal/factual question is never starved of context.

// Unambiguous creative artifacts: asking for one of these is always a creative request.
const CREATIVE_ARTIFACT =
  /\b(poems?|haikus?|limericks?|sonnets?|ballads?|rhymes?|riddles?|puns?|jokes?|knock[- ]?knock|tongue[- ]?twisters?|lullab(?:y|ies)|raps?)\b/i;

// Ambiguous nouns (story/song/lyrics…) that are creative only when paired with a make/write verb,
// so "what's the story with my taxes" stays a normal, memory-relevant question.
const CREATIVE_GENERATION =
  /\b(write|compose|make(?:\s+me|\s+up)?|tell(?:\s+me)?\s+(?:a|an)|sing|invent|create|generate|come up with)\b[^.?!]{0,40}\b(story|stories|song|lyrics?|tale|fable|fiction|script|screenplay|verse|jingle)\b/i;

/** True for a creative/ephemeral ask (poem, story, joke, song…) — one where personal memory
 *  shouldn't apply and a "track this over time" nudge makes no sense. */
export function isCreativeAsk(userText: string): boolean {
  const t = userText.toLowerCase();
  return CREATIVE_ARTIFACT.test(t) || CREATIVE_GENERATION.test(t);
}

/** True when personal memory should inform/record this turn; false for creative/ephemeral asks. */
export const memoryRelevant = (userText: string): boolean => !isCreativeAsk(userText);

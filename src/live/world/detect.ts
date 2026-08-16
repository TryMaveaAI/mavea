// world/detect.ts — the deterministic gates that decide whether a turn OFFERS a living world, and
// what a follow-up on the standing one costs. Pure regex rules over the user's own words
// (select/shapes.ts's detectRequested precedent: lowercase once, then case-free patterns), tuned
// for PRECISION over recall: a world card takes over the answer's last slot, so an ordinary ask
// must never trip it. A causal question the gate misses simply gets the normal canvas — the honest
// degrade. Offering costs nothing (the explode runs when a reader opens one); only followUpPlan
// can conclude that a call is warranted, and only when the standing world can't answer.
import type { Representation } from '../../canvas/spatial/morph/types';
import type { WorldSpec } from './types';

/** The asks that are UNMISTAKABLY causal. Kept as a fast, certain path — these skip the
 *  explanatory heuristic below entirely. */
const WORLD_ASK_RULES: readonly RegExp[] = [
  // "why did the 2008 crisis happen", "why is churn spiking", "why did revenue fall"
  /\bwhy\s+(?:did|does|do|is|are|was|were|has|have|had)\b[^?]{0,80}?\b(?:happen(?:ed|ing)?|occur(?:red|ring)?|rise|rose|risen|rising|fall|fell|fallen|falling|drop(?:ped|ping)?|spike[ds]?|spiking|surge[ds]?|surging|collapse[ds]?|collapsing|crash(?:ed|ing)?|stall(?:ed|ing)?|slow(?:ed|ing)?|grow(?:ing|n)?|grew|decline[ds]?|declining|increase[ds]?|increasing|decrease[ds]?|decreasing|fail(?:ed|ing|s)?|break|broke|breaking)\b/,
  // "what caused the outage", "what's driving churn", "what is the root cause of the delay"
  /\bwhat(?:'s|s)?(?:\s+(?:is|are|was|were))?\s+(?:caus(?:ed|es|ing)|driv(?:es|ing)|(?:the\s+)?(?:root\s+|underlying\s+)?causes?\s+(?:of|behind))\b/,
  // "what led to the collapse", "what drove the spike", "what triggered the recall"
  /\bwhat\s+(?:led\s+to|drove|triggered|set\s+off|brought\s+about)\b/,
  // "how did cheap credit lead to the crash", "how does a rate cut cause inflation"
  /\bhow\s+(?:did|does|do|has|have)\b[^?]{0,80}?\b(?:lead\s+to|led\s+to|cause[ds]?|causing|result\s+in|resulted\s+in|contribute[ds]?\s+to|trigger(?:ed|s)?)\b/,
  // "the root cause of the incident", "the causes behind the famine"
  /\b(?:root|underlying)\s+causes?\b/,
];

/** A follow-up that EVOLVES the world already on the canvas rather than opening a new subject:
 *  another representation of the same nodes, a counterfactual, or a zoom into one of them. */
const WORLD_FOLLOW_UP_RULES: readonly RegExp[] = [
  // "how did that change over time", "show it over time"
  /\bover\s+time\b/,
  // "as a chart", "show it as a graph", "as a timeline"
  /\bas\s+an?\s+(?:chart|graph|line\s+chart|timeline|time\s?line)\b/,
  // "what if rates had stayed low"
  /\bwhat\s+if\b/,
  // "zoom into the lending node", "zoom in on defaults"
  /\bzoom\s+(?:in(?:to)?|out)\b/,
];

const matches = (rules: readonly RegExp[], text: string): boolean => {
  const lower = text.toLowerCase();
  return rules.some((r) => r.test(lower));
};

/** Asks with no causal web behind them, where a world could only be invented: a lookup with one
 *  right answer, a request to MAKE something, arithmetic, or plain conversation. This is the whole
 *  refusal list — anything not named here is offered a world. */
const NO_WORLD_RULES: readonly RegExp[] = [
  // Lookups: one fact, no mechanism. "who is", "when is the game", "where is Reykjavik",
  // "what time is the meeting". Excluded only while the same breath asks nothing causal.
  /^\s*(?:who|when|where|what\s+time)\b(?!.*\b(?:caused?|led\s+to|happened)\b)/,
  // "what is X" / "define X" — a definition, unless the same breath asks how or why it works.
  /^\s*(?:what(?:'s|s| is| are)|define|meaning of)\b(?!.*\b(?:caus|why|how|lead|led|driv|happen|work|affect|impact)\w*\b)/,
  // Make-something asks: the answer is an artifact, not an explanation. Either the ask OPENS with
  // the verb ("summarise this paper"), or the verb carries a determiner naming the thing to make
  // ("build me a website"). A bare verb mid-sentence is left alone — it is usually the mechanism
  // being asked about, not an instruction ("why does the body make energy").
  /^\s*(?:please\s+)?(?:write|draft|compose|rewrite|translate|summari[sz]e|generate|create|build|make|design|refactor|debug|fix)\b/,
  /\b(?:write|draft|compose|rewrite|translate|summari[sz]e|generate|create|build|make|design|refactor|debug|fix)\s+(?:me\s+)?(?:a|an|the|this|my|some)\s/,
  // Procedure: "how do I …", "how to …", "steps to …" — a recipe has an order, not a cause.
  /\bhow\s+(?:do|can|should)\s+(?:i|we|you)\b|\bhow\s+to\b|\bsteps?\s+to\b/,
  // Choosing between options, or asking for a recommendation.
  /\bcompare\b|\bvs\.?\b|\bversus\b|\bwhich\s+(?:is|one|should)\b|\bshould\s+(?:i|we)\b|\bwhat\s+should\s+(?:i|we)\b|\bbetter\s+(?:than|option|choice)\b/,
  // Arithmetic and unit conversion — a calculation, not a causal web.
  /\b(?:calculate|convert|how\s+(?:much|many)\s+is)\b|^\s*[\d\s+\-*/^().]+\s*$/,
  // Talking to Mavéa rather than asking about the world.
  /^\s*(?:hi|hey|hello|thanks|thank you|ok|okay|yes|no|stop|cancel|nvm|never ?mind)\b/,
];

/** True when this turn should OFFER a living world.
 *
 *  Deliberately broad. The old gate matched a handful of causal phrasings, which made the world a
 *  rare trick rather than a way of reading an answer — "how does photosynthesis work", "what
 *  happened to Kodak" and "explain the French Revolution" all carry a causal web and all missed it.
 *  Offering is free (the card holds only what the turn already knew; the model call runs when a
 *  reader opens one), so the honest place to judge is the OUTPUT: if the explode cannot ground a
 *  real web, the world never renders and nothing was spent. What stays refused is the set of asks
 *  where a web could only be fabricated — see NO_WORLD_RULES. */
export function detectWorldAsk(text: string): boolean {
  if (!text.trim()) return false;
  if (matches(WORLD_ASK_RULES, text)) return true;
  return !matches(NO_WORLD_RULES, text);
}

/** True when the ask asks the STANDING world to change shape — a new representation, a
 *  counterfactual, or a zoom. Only meaningful when a world is already on the canvas. */
export function detectWorldFollowUp(text: string): boolean {
  return matches(WORLD_FOLLOW_UP_RULES, text);
}

/** The representation a follow-up names, if it names one. Both of these are drawn from a node's
 *  SERIES, which is what makes "does the standing world already hold this?" answerable. */
const REP_RULES: readonly (readonly [RegExp, Representation])[] = [
  [/\bover\s+time\b|\bas\s+an?\s+(?:timeline|time\s?line)\b/, 'timeline'],
  [/\bas\s+an?\s+(?:chart|graph|line\s+chart|bar\s+chart)\b|\bhow\s+much\b/, 'chart'],
];

function representationAsked(text: string): Representation | null {
  const lower = text.toLowerCase();
  for (const [rule, rep] of REP_RULES) if (rule.test(lower)) return rep;
  return null;
}

/** Two points make a line; one is a dot pretending to be a trend. */
const hasSeries = (world: WorldSpec): boolean =>
  world.nodes.some((n) => (n.series?.points.length ?? 0) >= 2);

/** What a follow-up on the STANDING world costs.
 *
 *  `local` — the surface can already answer it with what it is holding: a lever pull, a zoom, or a
 *  view of series the world already carries. Those are re-layouts, not new knowledge, so they cost
 *  the user nothing and the turn just re-offers the world opened at `view`.
 *
 *  `evolve` — the ask needs data the world genuinely does not have (a time view of a world with no
 *  series), which is the only case where a second model call earns its place.
 *
 *  `null` — not a follow-up about this world at all. */
export function followUpPlan(
  world: WorldSpec,
  text: string,
): { kind: 'local'; view: Representation } | { kind: 'evolve' } | null {
  if (!detectWorldFollowUp(text)) return null;
  const rep = representationAsked(text);
  if (!rep) return { kind: 'local', view: 'graph' }; // a what-if or a zoom — both are local
  return hasSeries(world) ? { kind: 'local', view: rep } : { kind: 'evolve' };
}

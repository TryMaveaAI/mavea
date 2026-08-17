// world/detect.ts — the deterministic gates for what a FOLLOW-UP on the standing world costs. Pure
// regex rules over the user's own words (select/shapes.ts's detectRequested precedent: lowercase
// once, then case-free patterns).
//
// Whether a turn OFFERS a world in the first place is not decided here and no longer can be: the
// model's `causal` flag judges the answer it just wrote, and world/fitness reads that answer when
// the flag is absent. A regex over the reader's phrasing cannot tell "how does photosynthesis work"
// from "how do I center a div", and the version that tried refused only lookups, artifact asks,
// procedures, comparisons and arithmetic — so every remaining ask got a card.
//
// A follow-up is different, and this is why the file survives: "over time", "what if", "zoom in"
// are IMPERATIVES about the world already on the canvas. There is no answer to read yet, the words
// are the whole instruction, and only followUpPlan can conclude that a call is warranted — and only
// when the standing world cannot answer it for free.
import type { Representation } from '../../canvas/spatial/morph/types';
import type { WorldSpec } from './types';

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

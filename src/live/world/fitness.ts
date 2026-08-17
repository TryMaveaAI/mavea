// world/fitness.ts — whether the ANSWER has a causal web worth opening, judged on what the turn
// actually produced rather than on how the question was phrased.
//
// The primary judge is the model's own `causal` flag: it wrote the answer, so it knows whether it
// explained a mechanism or looked a fact up. This is the fallback for a model that omits the field,
// and it used to be `detectWorldAsk` — a regex over the reader's words whose refusal list was the
// whole gate, so anything not obviously a lookup, an artifact ask, a procedure, a comparison or
// arithmetic got a card. "Tell me about elephants" and "Describe Brooklyn" both did. Offering costs
// no tokens, but it costs the answer's last slot and the reader's attention, and a card that opens
// onto nothing is a promise broken twice.
//
// The question carries less information than the answer sitting next to it. So: does the answer
// have a web IN it? Two independent readings, either sufficient, both structural — no weights to
// tune and nothing that needs a model call.
import type { Block } from '../../data/conversation';
import { catalogFacts } from '../../canvas/blocks/catalog/facts';
import type { Archetype } from '../../canvas/blocks/catalog/meta';

/** Archetypes that ARE a causal web already: the model laid out things leading to other things.
 *  `timeline` is deliberately absent — a sequence of events is not a claim that any of them caused
 *  the next, and treating it as one is how a world gets offered on a company history. */
const WEB_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>(['flow', 'graph', 'tree']);

/** Archetypes that are an ARTIFACT rather than an explanation. An answer made only of these has
 *  nothing to explore however the question was worded — the mirror of detect's refusal list, asked
 *  of the output. */
const ARTIFACT_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>([
  'code',
  'media',
  'control',
  'document',
  'table',
  'map',
]);

/** The ways an answer says "X brought about Y", as ONE pattern so distinct MATCHES can be counted.
 *  Counting matches rather than pattern groups is what tells two relations from one claim repeated:
 *  "It caused the delay. The same thing caused it again" matches `caused` twice and is one relation,
 *  while "therefore … which meant" is two. Grouping these into buckets instead undercounted exactly
 *  the answers that state a chain in varied prose, which is what good prose does.
 *
 *  `since` is guarded against a following digit: "since 2004" dates a claim, it does not explain
 *  one, and a temporal `since` counted as a relation is the easiest way for a history to look like
 *  a mechanism. */
const CAUSAL_PHRASES =
  /\b(?:because|since(?!\s+\d)|led to|leads to|leading to|caused|causes|causing|drove|drives|driven by|driving|resulted in|results in|as a result|consequently|triggered|set off|brought about|therefore|so that|which meant|meant that|depends on|depended on|feeds into|fed into)\b/g;
/** Two distinct relations is the smallest thing a world can be: two causes reaching one outcome.
 *  This under-offers on a terse answer that explains a mechanism in one clause, and that is the safe
 *  direction — a missed world leaves the ordinary canvas, while a card that opens onto nothing is a
 *  promise broken twice. The model's own `causal` flag is what catches the terse ones. */
const MIN_RELATIONS = 2;

export interface WorldFitness {
  offer: boolean;
  /** Why, for the dev-only gate log — a silent verdict is what made this hard to reason about. */
  reason: 'structure' | 'prose' | 'artifact-only' | 'no-web';
}

/** The archetype of each block the answer drew, skipping types the catalog does not know. */
function archetypesOf(blocks: readonly Block[]): Archetype[] {
  const out: Archetype[] = [];
  for (const block of blocks) {
    const facts = catalogFacts(block.type);
    if (facts) out.push(facts.archetype);
  }
  return out;
}

/**
 * Does this answer have a causal web worth opening?
 *
 * Structure first: a flow, graph or tree block IS a web the model already drew, and no reading of
 * the prose can be more direct evidence than that. Otherwise the answer's own words — two distinct
 * causal relations, which is the smallest world there is. An answer that is only an artifact is
 * refused before either, because a code block explains nothing whatever the question asked.
 */
export function worldFitness(answer: {
  blocks: readonly Block[];
  narration?: string;
}): WorldFitness {
  const archetypes = archetypesOf(answer.blocks);
  if (archetypes.length > 0 && archetypes.every((a) => ARTIFACT_ARCHETYPES.has(a))) {
    return { offer: false, reason: 'artifact-only' };
  }
  if (archetypes.some((a) => WEB_ARCHETYPES.has(a))) return { offer: true, reason: 'structure' };

  const prose = (answer.narration ?? '').toLowerCase();
  const relations = new Set(prose.match(CAUSAL_PHRASES) ?? []).size;
  return relations >= MIN_RELATIONS
    ? { offer: true, reason: 'prose' }
    : { offer: false, reason: 'no-web' };
}

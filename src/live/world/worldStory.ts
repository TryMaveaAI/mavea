// world/worldStory.ts — the world, told. One WorldSpec in, an ordered list of BEATS out: what the
// camera frames, which link draws, and the one line said over it.
//
// Three rules, and they are the same three the surface itself lives by:
//
//   1. It costs NOTHING. Every line is composed from fields the world already carries — no model
//      call, not one token. A reader on their own key must be able to press "walk me through it"
//      as often as they like.
//   2. A spoken figure is a figure that can prove itself. The number reaches a beat only through
//      the trust registry, exactly as `ProvValue` reaches the screen; a value the registry does not
//      hold is simply not said. Saying an unbacked number is no better than printing one.
//   3. The order is DERIVED and deterministic. Causes before what they caused (a topological walk),
//      ties broken by how much of the outcome a cause explains and then by id — so the same world
//      narrates the same way every time, which is what makes the walk testable at all.
import { proseForDisplay, proseForSpeech, trimToSentence } from '../../lib/spokenText';
import type { Representation, WorldData } from '../../canvas/spatial/morph/types';
import { rawOf } from '../trust/display';
import type { TrustRegistry } from '../trust';
import type { WorldNode, WorldSpec } from './types';
import { nodeValueId } from './valueIds';

/** How much of a node's `detail` a single spoken beat may carry. A beat is one breath: the rest of
 *  the sentence is on the card the camera is already pointing at. Trimmed on a SENTENCE boundary
 *  (`trimToSentence`), never mid-clause — a line that stops mid-thought reads as a fault. */
const DETAIL_MAX = 170;

/**
 * How a link reads aloud, as a TRAILING PREPOSITIONAL phrase — "…— fed by cheap credit after 2001."
 *
 * The shape is the point. A node's label is authored free-form and is just as often a whole clause
 * ("Lending standards loosened") as a noun phrase ("Housing boom"), so splicing two labels around an
 * active verb produces "Lending standards loosened opened Mortgage volume surged" — grammatical
 * garbage roughly half the time, which on a narrated surface is the reader's first impression. A
 * trailing "by" phrase attaches cleanly to either shape.
 *
 * It is also why the edge's own authored `verb` ("opened", "raised") is NOT used here: it is written
 * to label an arrow, not to join two sentences, and forcing it into prose is exactly what broke.
 *
 * Every phrase claims no more than its relation does — the arrow's real claim is stated on the edge
 * itself, and a narration that upgraded it would be the one way this walk could lie.
 */
const RELATION_BY: Record<string, string> = {
  contributes: 'fed by',
  causes: 'driven by',
  dampens: 'held back by',
  enables: 'made possible by',
  correlates: 'moving together with',
};

/** The fallback when a link carries no relation: its sign is the only thing it actually asserts. */
const SIGN_BY: Record<number, string> = { 1: 'pushed up by', [-1]: 'pushed down by' };

/** Drop the leading capital on a label being folded into the middle of a sentence. The guard is on
 *  the first WORD, not the first two characters: an acronym ("MBS asset values", "US policy") keeps
 *  its capitals, because lowercasing one is a worse error than a stray capital mid-clause — while a
 *  one-letter opener ("A trigger lowers the threshold") is an ordinary word and must still fold. */
function midSentence(label: string): string {
  const first = label.split(' ', 1)[0] ?? '';
  if (first.length === 0 || /[A-Z]/.test(first.slice(1))) return label;
  return label[0].toLowerCase() + label.slice(1);
}

/** The closing line, which has to name the view it is morphing INTO — "the same causes, in time"
 *  over a flow of contributions is a caption for a picture that isn't there. */
const CLOSE_LINE: Record<Representation, string> = {
  graph: 'And that is how the causes fit together.',
  timeline: 'And here are the same causes, in time.',
  chart: 'And here is what each one actually measured.',
  flow: 'And here is how much each one contributed.',
};

export interface WorldBeat {
  /** The node this beat is about — the camera frames it and the surface selects it. */
  nodeId: string;
  /** The link that led here, when one did. Drawn as the line is spoken. */
  edgeId?: string;
  /** Frame the WHOLE world rather than this node: the establishing shot and the closing one. */
  wide?: boolean;
  /** Morph to this representation before the beat runs. */
  rep?: Representation;
  /** What the voice says. */
  say: string;
  /** The shown twin of `say` — same content, display side of any `[[shown|said]]` span, so the
   *  caption ribbon's phrase highlighting tracks the audio instead of drifting against it. */
  caption: string;
}

export interface WorldStoryOptions {
  /** A representation to end on, when the surface has confirmed the world can actually fill it.
   *  Availability is the surface's question (`representationHolds`), not this module's. */
  closeOn?: Representation;
}

/** A node's figure as words, or null when the world cannot back one. `structure` is the honest floor
 *  — a named quantity with no number — and is never spoken as though it had one. */
function figureLine(
  registry: TrustRegistry,
  nodeId: string,
): { say: string; shown: string } | null {
  const value = registry.values.get(nodeValueId(nodeId));
  if (!value || value.kind === 'structure') return null;
  const raw = rawOf(value);
  // An illustrative world measures nothing, so its magnitudes are spoken as the shapes they are.
  // Dropping the hedge here would let a textbook number arrive in the reader's ear as a measurement.
  return value.kind === 'illustrative'
    ? { say: `Illustratively, about ${raw}.`, shown: `Illustratively, about ${raw}.` }
    : { say: `Measured at ${raw}.`, shown: `Measured at ${raw}.` };
}

/** Does this link claim something a plain "and then" does not already say? A contribution or a
 *  cause is what a reader assumes from sequence alone; a dampening, an enabling condition or a mere
 *  correlation is not, and those are the ones worth spending words on. */
function tellsMore(edge: { kind?: string; sign?: 1 | -1 }): boolean {
  if (edge.kind)
    return edge.kind === 'dampens' || edge.kind === 'enables' || edge.kind === 'correlates';
  return edge.sign === -1;
}

/** How this link reads aloud: its relation's phrase, falling back to what its sign alone asserts. */
function linkPhrase(edge: { kind?: string; sign?: 1 | -1 }): string {
  if (edge.kind && RELATION_BY[edge.kind]) return RELATION_BY[edge.kind];
  return SIGN_BY[edge.sign ?? 1] ?? 'fed by';
}

/**
 * Order the world's top-level causes so every cause is spoken before what it caused.
 *
 * A Kahn walk over the DRAWN links, with the ready set kept sorted by causal depth, then by how much
 * of the outcome the cause explains (heaviest first — the spine of the explanation leads), then by
 * id. The last key is what makes the result stable rather than merely correct: two causes of equal
 * depth and equal weight must not swap places between runs, or the walk cannot be tested and a
 * reader who plays it twice hears two different stories.
 *
 * The gate upstream already refuses cycles (`validate.enforceAcyclic`), but a walk that can hang is
 * not worth the assumption: anything still unvisited when the ready set empties is appended in the
 * same deterministic order rather than dropped.
 */
function causalOrder(world: WorldData): string[] {
  const top = world.nodes.filter((n) => n.parentId === undefined);
  const ids = new Set(top.map((n) => n.id));
  const edges = world.edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const depthOf = new Map(top.map((n) => [n.id, n.depth ?? 0]));
  const explains = new Map<string, number>();
  for (const e of edges) explains.set(e.from, (explains.get(e.from) ?? 0) + (e.weight ?? 0));

  const indegree = new Map(top.map((n) => [n.id, 0]));
  for (const e of edges) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);

  const rank = (a: string, b: string): number =>
    (depthOf.get(a) ?? 0) - (depthOf.get(b) ?? 0) ||
    (explains.get(b) ?? 0) - (explains.get(a) ?? 0) ||
    (a < b ? -1 : a > b ? 1 : 0);

  const ready = top.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const out: string[] = [];
  const seen = new Set<string>();
  while (ready.length > 0) {
    ready.sort(rank);
    const id = ready.shift();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const e of edges) {
      if (e.from !== id) continue;
      const left = (indegree.get(e.to) ?? 0) - 1;
      indegree.set(e.to, left);
      if (left <= 0 && !seen.has(e.to)) ready.push(e.to);
    }
  }
  for (const id of top.map((n) => n.id).sort(rank)) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * The world as an ordered walk. Empty when there is nothing worth walking — a world of one node
 * narrates nothing, and an empty list is how the surface knows not to offer the button at all.
 */
export function worldStory(
  spec: WorldSpec,
  world: WorldData,
  registry: TrustRegistry,
  opts: WorldStoryOptions = {},
): WorldBeat[] {
  const order = causalOrder(world);
  if (order.length < 2) return [];

  const specById = new Map<string, WorldNode>(spec.nodes.map((n) => [n.id, n]));
  const labelOf = new Map(world.nodes.map((n) => [n.id, n.label]));
  const at = new Map(order.map((id, i) => [id, i]));

  /**
   * The link that brings this node into the story: from a cause already spoken, heaviest first, so
   * the arrow the reader sees lit is the one the sentence is about.
   *
   * Exactly ONE, even where a node has four incoming links. Naming them all would read as a list and
   * — worse on this surface — the picture could no longer agree with the words, since a lit link is
   * a single link. The others are not lost: each gets its own beat when its own cause is narrated.
   */
  const arrivalOf = (id: string): WorldData['edges'][number] | undefined =>
    world.edges
      .filter((e) => e.to === id && at.has(e.from) && (at.get(e.from) ?? 0) < (at.get(id) ?? 0))
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (a.id < b.id ? -1 : 1))[0];

  const beats: WorldBeat[] = [];

  // The establishing shot: the whole world in frame, on the causal view. It names `graph` rather
  // than taking whatever was showing because the walk has to be REPEATABLE — the closing beat leaves
  // the reader on the timeline, and a second play that narrated "what led to what" over a time axis
  // would be describing a picture that isn't there. (Graph is always safe: it is the one
  // representation that can place every node.)
  // The outcome is not one of the causes — counting it made a three-cause world announce four.
  const causeCount = order.at(-1) === spec.outcomeId ? order.length - 1 : order.length;
  const opening =
    causeCount === 1
      ? 'One cause, one outcome. Here is how it connects.'
      : `${causeCount} causes, one outcome. Here is how they connect.`;
  beats.push({
    nodeId: spec.outcomeId,
    wide: true,
    rep: 'graph',
    say: opening,
    caption: opening,
  });

  let previousId: string | null = null;
  for (const [index, id] of order.entries()) {
    const node = specById.get(id);
    const label = labelOf.get(id) ?? id;
    const arrival = arrivalOf(id);
    const isOutcome = id === spec.outcomeId && index === order.length - 1;

    // The narrative frame. The LABEL always leads, because a model-authored label is as often a
    // whole clause as a noun phrase and nothing may be spliced in front of it — so the variation
    // that makes this a story rather than a list has to come from what surrounds it:
    //
    //   • the first cause opens the account,
    //   • a cause that follows the one just spoken says so with "Then", and points back with "it"
    //     rather than repeating a name the listener heard one breath ago,
    //   • a cause reaching back FURTHER names the cause it came from, because "it" would be wrong,
    //   • a root arriving mid-story is a second thread, not a continuation,
    //   • and the outcome lands the whole thing.
    const from = arrival ? (labelOf.get(arrival.from) ?? arrival.from) : null;
    let opener: string;
    if (isOutcome) {
      opener = arrival
        ? `And it ends here: ${midSentence(label)} — ${linkPhrase(arrival)} ${arrival.from === previousId ? 'it' : midSentence(from ?? '')}.`
        : `And it ends here: ${midSentence(label)}.`;
    } else if (!arrival) {
      opener = index === 0 ? `It starts with ${midSentence(label)}.` : `Alongside it: ${label}.`;
    } else if (arrival.from === previousId) {
      // "Then" already carries "and that drove this", so a trailing "driven by it" only repeats the
      // word the sentence opened with. The phrase earns its place only where the link claims
      // something the sequence does NOT imply — a dampening, an enabling condition, a correlation.
      opener = tellsMore(arrival)
        ? `Then ${midSentence(label)} — ${linkPhrase(arrival)} it.`
        : `Then ${midSentence(label)}.`;
    } else {
      opener = `${label} — ${linkPhrase(arrival)} ${midSentence(from ?? '')}.`;
    }
    previousId = id;
    const said: string[] = [opener];
    const shown: string[] = [opener];

    const figure = figureLine(registry, id);
    if (figure) {
      said.push(figure.say);
      shown.push(figure.shown);
    }

    const detail = node?.detail;
    if (detail) {
      said.push(trimToSentence(proseForSpeech(detail), DETAIL_MAX));
      shown.push(trimToSentence(proseForDisplay(detail), DETAIL_MAX));
    }

    beats.push({
      nodeId: id,
      ...(arrival ? { edgeId: arrival.id } : {}),
      say: said.join(' '),
      caption: shown.join(' '),
    });
  }

  // The closing shot: the same causes, re-read in another view. It lands LAST and frames the whole
  // world, so the morph never has to fight a camera already flying to a single node.
  if (opts.closeOn) {
    const close = CLOSE_LINE[opts.closeOn];
    beats.push({
      nodeId: spec.outcomeId,
      wide: true,
      rep: opts.closeOn,
      say: close,
      caption: close,
    });
  }

  return beats;
}

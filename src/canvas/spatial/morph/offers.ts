// offers.ts — which readings of a world are worth offering, and in what order.
//
// Pure and React-free ON PURPOSE. These answers are needed on the turn path (live/world/detect asks
// whether the standing world can already answer a follow-up) and by the headless geometry audit, and
// neither may pull a hook module — nor the React runtime behind it — into its graph. Keeping them
// here is also what stops a SECOND definition of "does this world hold a chart" appearing next to
// the first: there were three, they disagreed, and the turn promised a view the surface refused.
import { placeableOnChart, worthOnChart } from './layouts/chartLayout';
import { placeableOnFlow, worthOnFlow } from './layouts/flowLayout';
import { worthOnGraph } from './layouts/graphLayout';
import { placeableOnSpheres, worthOnSpheres } from './layouts/spheresLayout';
import { placeableOnTimeline, worthOnTimeline } from './layouts/timelineLayout';
import type { MorphNodeDatum, Representation, WorldData } from './types';

/** Every representation, in the order a narration driver steps them. Each answers a question none
 *  of the others does — what led to what, how much each mattered, when, and what each measured. A
 *  view that only re-arranges another's answer does not belong here however good it looks: three
 *  were built and cut for exactly that. Exported because a driver stepping this list has to know
 *  what it is stepping. */
export const REPRESENTATIONS: readonly Representation[] = [
  'graph',
  'flow',
  'spheres',
  'timeline',
  'chart',
];
/** Which nodes each representation can PLACE, taken from the layouts' own shelving tests. The
 *  causal web has no such test: it places every node it is given. The world comes through because
 *  the structural views answer per-WEB, not per-node — whether a cause has a link at all, or a
 *  measured share of the outcome, is not a property of the card. */
const PLACES: Record<Representation, (node: MorphNodeDatum, world: WorldData) => boolean> = {
  graph: () => true,
  timeline: placeableOnTimeline,
  chart: placeableOnChart,
  flow: placeableOnFlow,
  spheres: placeableOnSpheres,
};

/** A view has to place at least this many causes to BE that view. One dated cause on a time axis is
 *  not a timeline — it is a single card floating over an invented range, with everything the reader
 *  asked about sitting in the band underneath it. Two is the floor because relative position is the
 *  only thing these views say, and one mark has nothing to be relative to. */
const MIN_PLACED = 2;
/** …and it has to place a fair SHARE of them. Two of twelve clears the floor above and still renders
 *  as a mostly-empty stage over a ten-card shelf of excuses. */
const MIN_PLACED_FRACTION = 1 / 3;

/**
 * …and having placed them, does the view SAY anything?
 *
 * PLACES answers "is this node shelved?". This answers "is the picture worth the click?" — and they
 * are not the same question, which is how a world whose dated causes all fall inside one afternoon
 * came to offer a timeline: four of four placed, a hundred percent of the world, four entries in a
 * single vertical stack over an axis invented to give one instant a width.
 *
 * Each predicate lives in the layout it describes and is computed from that layout's OWN arithmetic —
 * the timeline's from `timeAxis`, the chart's from `seriesOf` — so a change to how a view DRAWS
 * changes what it PROMISES, in one edit. It is a world-level question because emptiness is a property
 * of the picture and not of any node in it.
 */
const SAYS: Record<Representation, (world: WorldData) => boolean> = {
  graph: worthOnGraph,
  timeline: worthOnTimeline,
  chart: worthOnChart,
  flow: worthOnFlow,
  spheres: worthOnSpheres,
};

/**
 * Has this representation anything to show a reader about this world? A layout never DROPS a node it
 * cannot place honestly — it parks it in the held-aside band — so a representation that can place
 * none of them renders as an empty stage with a band of excuses under it. A surface that offers that
 * view promises something to see and delivers nothing, so it asks first.
 *
 * It asks about COUNT and SHARE, not mere possibility. Asking only "can it place any?" is how a
 * world with one dated cause out of nine came to offer a timeline: the chip was present, the reader
 * pressed it, and got a lone card over a fourteen-month axis with eight causes held aside. The chip
 * is a promise that there is something to see.
 *
 * Children are excluded from both sides of the ratio — they are semantic zoom, folded onto their
 * parents until opened, so counting them would let four breakdown parts vouch for a view of a world
 * whose actual causes cannot fill it.
 */
/** …and how much of the world each view has to place, which is not the same number everywhere.
 *
 *  A third on the views whose shelf holds causes they CANNOT place — undated, unmeasured, unweighted.
 *  Half on spheres, because there a shelved cause is one the answer DECLINED to label: the builder is
 *  told to omit a sphere rather than stretch one, so the band is expected, and a stage half full of
 *  "in no single sphere" reads as the model's hesitancy rather than as the world's shape. */
const MIN_FRACTION: Record<Representation, number> = {
  graph: MIN_PLACED_FRACTION,
  timeline: MIN_PLACED_FRACTION,
  chart: MIN_PLACED_FRACTION,
  flow: MIN_PLACED_FRACTION,
  spheres: 1 / 2,
};

export function representationHolds(rep: Representation, world: WorldData): boolean {
  const top = world.nodes.filter((n) => n.parentId === undefined);
  if (top.length === 0) return false;
  const placed = top.filter((n) => PLACES[rep](n, world)).length;
  if (placed < Math.min(MIN_PLACED, top.length)) return false;
  if (placed / top.length < MIN_FRACTION[rep]) return false;
  return SAYS[rep](world);
}

/** How much of this world a representation actually contains — the shelf band's own count, read from
 *  the other end. It is the only ranking key this surface needs, and there is exactly one of it so
 *  four decisions cannot drift apart: the ORDER of the chips, which view a world OPENS on, which view
 *  the narrated walk closes on, and what the audit sweeps. The causal web sorts first for free, being
 *  the only view that places everything. */
export function fillOf(rep: Representation, world: WorldData): number {
  const top = world.nodes.filter((n) => n.parentId === undefined);
  if (top.length === 0) return 0;
  return top.filter((n) => PLACES[rep](n, world)).length / top.length;
}

/** Every reading this world both holds and fills, best first. Ties break on REPRESENTATIONS order so
 *  the same world never lays its chips out two ways. */
export function readingsOf(world: WorldData): Representation[] {
  return REPRESENTATIONS.filter((r) => representationHolds(r, world)).sort(
    (a, b) =>
      fillOf(b, world) - fillOf(a, world) ||
      REPRESENTATIONS.indexOf(a) - REPRESENTATIONS.indexOf(b),
  );
}

/**
 * The view this world OPENS in: the causal web wherever it holds, and otherwise the leftmost chip
 * the world can actually stand behind.
 *
 * USER-DIRECTED. This used to pick whichever non-causal reading filled two thirds of the world, on
 * the reasoning that a mostly-dated world wants its timeline. What that produced was a reader
 * pressing "why did this happen" and landing somewhere other than what caused what — a different
 * question, answered before they had asked it, and a different one from world to world, so the
 * surface never taught its own vocabulary. The other readings are one press away and their chips
 * say what they show; the first sight of a living answer is the causal web.
 *
 * Left-to-right is REPRESENTATIONS order, which is also the chip order, so "the default" and "the
 * first chip" cannot disagree. The fallback is unreachable in practice — the graph places every node
 * it is given — and is kept because a Representation must be returned.
 *
 * A view a follow-up explicitly named still wins; this is only the default. It must reach the stage
 * as its INITIAL rep, never as a later assignment: recomputed mid-session it would snap a reader off
 * the view they were exploring.
 */
export function firstRead(world: WorldData): Representation {
  return REPRESENTATIONS.find((r) => representationHolds(r, world)) ?? 'graph';
}

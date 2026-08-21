// nesting.ts — the one answer to "is this breakdown open?", shared by every layout that has to care.
//
// Semantic zoom is chain-gated: a part shows only when its parent is open AND its parent's parent is
// open, all the way to a top-level cause. Getting that subtly wrong in two places is how a
// grandchild came to sit on an axis as though it were a peer cause of the outcome, so there is one
// implementation and the layouts import it.
import type { MorphNodeDatum, PlacedNode, WorldData } from '../types';

/**
 * Every node a layout should actually PLACE: the top-level causes, plus the parts whose whole
 * ancestor chain the reader has opened. Everything else is folded onto its parent — placed, never
 * dropped, so the morph back keeps every node and a fold has somewhere to animate from.
 *
 * Guarded against a `parentId` cycle in model output, which would otherwise never terminate. A node
 * whose chain does not reach a top-level ancestor is treated as folded rather than trusted.
 */
export function unfoldedIds(
  world: WorldData,
  expanded?: ReadonlySet<string>,
): { open: Set<string>; parentOf: Map<string, string | undefined> } {
  const parentOf = new Map<string, string | undefined>(world.nodes.map((n) => [n.id, n.parentId]));
  const open = new Set<string>();
  for (const node of world.nodes) {
    if (node.parentId === undefined) {
      open.add(node.id);
      continue;
    }
    let cur: string | undefined = node.parentId;
    const seen = new Set<string>([node.id]);
    let chainOpen = true;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      if (expanded?.has(cur) !== true) {
        chainOpen = false;
        break;
      }
      cur = parentOf.get(cur);
    }
    if (chainOpen && cur === undefined) open.add(node.id);
  }
  return { open, parentOf };
}

/** How far a node sits below a top-level ancestor. Guarded against a `parentId` cycle. */
function chainDepth(id: string, parentOf: ReadonlyMap<string, string | undefined>): number {
  let steps = 0;
  let cur = parentOf.get(id);
  const seen = new Set<string>([id]);
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur);
    steps += 1;
    cur = parentOf.get(cur);
  }
  return steps;
}

/**
 * The nodes this layout draws, and the ones it folds — in ONE pass, so the two can never disagree
 * about a node.
 *
 * `folded` comes back ANCESTORS-FIRST, and that ordering is the point rather than tidiness: a fold
 * reads its parent's placed POSITION, so a part of a part has to be folded after the part it sits
 * in. Every layout that folded children got this right only by accident, because `world.nodes`
 * happens to arrive in tree order — a property of the adapter, not a rule any layout may lean on.
 * Sorting here means no layout has to remember.
 */
export function splitByFold(
  world: WorldData,
  expanded: ReadonlySet<string> | undefined,
): { drawn: MorphNodeDatum[]; folded: MorphNodeDatum[] } {
  const { open, parentOf } = unfoldedIds(world, expanded);
  const drawn: MorphNodeDatum[] = [];
  const folded: MorphNodeDatum[] = [];
  for (const node of world.nodes) (open.has(node.id) ? drawn : folded).push(node);
  folded.sort(
    (a, b) => chainDepth(a.id, parentOf) - chainDepth(b.id, parentOf) || a.id.localeCompare(b.id),
  );
  return { drawn, folded };
}

/**
 * Park every folded node ON whatever carries it, taking the parent's OWN box and face.
 *
 * Same size, same face, same place: a folded breakdown is hidden UNDER its parent's card, so it has
 * to be coincident with it and not merely near it — the geometry sweeps assert exactly that, and a
 * fold drawn at a fixed size silently broke it whenever the parent was sitting in the held-aside
 * band at the shelf's narrower chip size.
 *
 * Call it AFTER the shelf has been merged in: a part whose cause is itself held aside has no
 * position until then, and would otherwise land at the layout's origin.
 */
export function foldOnto(
  positions: Map<string, PlacedNode>,
  folded: readonly MorphNodeDatum[],
  fallback: PlacedNode,
): void {
  for (const node of folded) {
    const parent = node.parentId !== undefined ? positions.get(node.parentId) : undefined;
    const spot = parent ?? fallback;
    positions.set(node.id, {
      x: spot.x,
      y: spot.y,
      w: spot.w,
      h: spot.h,
      face: spot.face,
      folded: true,
    });
  }
}

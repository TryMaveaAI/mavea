// incidence.ts — which nodes a world's links actually touch, computed once per world.
//
// The flow asks the same question of every node ("does a MEASURED link touch it?"), and the obvious
// way to answer it — scan the edge list inside a per-node predicate — is quadratic. That is
// invisible on a world the honesty gate caps at sixteen causes, and it is 48 million comparisons on
// the four-thousand-node stress fixtures the layouts are held to, which is why those exist.
//
// So the answer is built once per world and cached against the world OBJECT. The cache is a WeakMap
// on purpose: a world is a memoised value the host holds for as long as it is on screen and drops
// when the answer changes, and a keyed Map would pin every world a session ever rendered.
import type { MorphEdgeDatum, WorldData } from '../types';

const weighted = new WeakMap<WorldData, ReadonlySet<string>>();

function endpointsOf(
  edges: readonly MorphEdgeDatum[],
  keep: (edge: MorphEdgeDatum) => boolean,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to || !keep(e)) continue;
    ids.add(e.from);
    ids.add(e.to);
  }
  return ids;
}

/** Every node a MEASURED link touches. A weight only survives the grounding gate on a receipted
 *  link, so its presence is the licence to draw a share at all. */
export function weightedIds(world: WorldData): ReadonlySet<string> {
  const hit = weighted.get(world);
  if (hit) return hit;
  const ids = endpointsOf(world.edges, (e) => typeof e.weight === 'number');
  weighted.set(world, ids);
  return ids;
}

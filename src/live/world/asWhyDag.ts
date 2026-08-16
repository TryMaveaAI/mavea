// world/asWhyDag.ts — the pure projection from the living world to the why engine's contract. The
// cascade engine (why/engine.ts) runs on the projection unmodified: world-only enrichment (series,
// children, detail, relation/status/multi-receipt edge chrome) is stripped, children are flattened
// OUT (the engine reasons over the top-level causal web only), and an edge's receipt is its first
// verified receipt. Faithful on the shared field set — the world never forks the engine.
import type { WhyDag, WhyEdge, WhyNode } from '../why/types';
import type { WorldEdge, WorldNode, WorldSpec } from './types';

function projectNode(n: WorldNode): WhyNode {
  return {
    id: n.id,
    label: n.label,
    role: n.role,
    depth: n.depth,
    tier: n.tier,
    ...(n.value !== undefined ? { value: n.value } : {}),
    ...(n.unit ? { unit: n.unit } : {}),
    ...(n.receipt ? { receipt: n.receipt } : {}),
  };
}

function projectEdge(e: WorldEdge): WhyEdge {
  const receipt = e.receipts?.[0] ?? e.receipt;
  return {
    from: e.from,
    to: e.to,
    sign: e.sign,
    tier: e.tier,
    ...(e.verb ? { verb: e.verb } : {}),
    ...(e.weight !== undefined ? { weight: e.weight } : {}),
    // why's contract: a provisional edge never wears a receipt badge. The world keeps verified
    // receipts on a demoted edge (they feed 'contested'); the projection honors the stricter rule.
    ...(receipt && !e.provisional ? { receipt } : {}),
    ...(e.provisional ? { provisional: true } : {}),
  };
}

/** Project a WorldSpec onto the why engine's WhyDag. Pure; the world is untouched. */
export function asWhyDag(world: WorldSpec): WhyDag {
  return {
    center: world.title,
    outcomeId: world.outcomeId,
    nodes: world.nodes.map(projectNode),
    edges: world.edges.map(projectEdge),
    provenance: {
      ...(world.provenance.illustrative ? { illustrative: true } : {}),
      ...(world.provenance.notes?.length ? { notes: world.provenance.notes } : {}),
    },
  };
}

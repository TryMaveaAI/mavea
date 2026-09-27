import type { ShipEdge } from './model';

export type TraceDirection = 'downstream' | 'upstream';

export interface ImpactTrace {
  nodeIds: ReadonlySet<string>;
  edgeIndexes: ReadonlySet<number>;
  depth: ReadonlyMap<string, number>;
}

export interface ImpactPath {
  nodeIds: readonly string[];
  edgeIndexes: readonly number[];
}

/** Follow only relationships the grounded graph actually contains. Downstream walks `from → to`;
 * upstream reverses that read so a reader can see what has to change first. Cycles are harmless:
 * the first visit wins and the walk remains bounded by the model's node count. */
export function traceImpact(
  edges: readonly ShipEdge[],
  rootId: string,
  direction: TraceDirection,
): ImpactTrace {
  const nodeIds = new Set([rootId]);
  const edgeIndexes = new Set<number>();
  const depth = new Map([[rootId, 0]]);
  const queue = [rootId];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    for (const [index, edge] of edges.entries()) {
      const source = direction === 'downstream' ? edge.from : edge.to;
      const target = direction === 'downstream' ? edge.to : edge.from;
      if (source !== current || nodeIds.has(target)) continue;
      edgeIndexes.add(index);
      nodeIds.add(target);
      depth.set(target, (depth.get(current) ?? 0) + 1);
      queue.push(target);
    }
  }

  return { nodeIds, edgeIndexes, depth };
}

/** Return the shortest grounded route between two systems in the selected causal direction. */
export function findImpactPath(
  edges: readonly ShipEdge[],
  rootId: string,
  targetId: string,
  direction: TraceDirection,
): ImpactPath | null {
  if (rootId === targetId) return { nodeIds: [rootId], edgeIndexes: [] };
  const seen = new Set([rootId]);
  const previous = new Map<string, { nodeId: string; edgeIndex: number }>();
  const queue = [rootId];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    for (const [edgeIndex, edge] of edges.entries()) {
      const source = direction === 'downstream' ? edge.from : edge.to;
      const target = direction === 'downstream' ? edge.to : edge.from;
      if (source !== current || seen.has(target)) continue;
      seen.add(target);
      previous.set(target, { nodeId: current, edgeIndex });
      if (target === targetId) {
        const nodeIds = [targetId];
        const edgeIndexes: number[] = [];
        let nodeId = targetId;
        while (nodeId !== rootId) {
          const step = previous.get(nodeId);
          if (!step) return null;
          nodeIds.unshift(step.nodeId);
          edgeIndexes.unshift(step.edgeIndex);
          nodeId = step.nodeId;
        }
        return { nodeIds, edgeIndexes };
      }
      queue.push(target);
    }
  }
  return null;
}

// groups.ts — grouping for the memory panel: organise concept nodes by their top-level
// namespace so the panel reads like a wiki sidebar rather than a flat list. Purely
// presentational — node bodies are shown verbatim and nothing is invented.
import type { MemoryNode } from './store';

/** The top-level namespace from a concept path: "topics.finance" → "topics", "profile" → "profile" */
export function namespaceOf(node: MemoryNode): string {
  const dot = node.concept.indexOf('.');
  return dot < 0 ? node.concept : node.concept.slice(0, dot);
}

/** Human-readable label for known namespaces; falls back to the namespace itself. */
export function namespaceLabel(ns: string): string {
  const LABELS: Record<string, string> = {
    profile: 'About you',
    preferences: 'Preferences',
    topics: 'Topics',
    threads: 'Open threads',
    projects: 'Projects',
    work: 'Work',
    life: 'Life',
  };
  return LABELS[ns] ?? ns.slice(0, 1).toUpperCase() + ns.slice(1);
}

/** Concept nodes grouped by namespace, sorted: profile first, then alphabetically by namespace,
 *  nodes within each group sorted by most recently updated first. */
export function groupedNodes(nodes: MemoryNode[]): { namespace: string; nodes: MemoryNode[] }[] {
  const byNs = new Map<string, MemoryNode[]>();
  for (const n of nodes) {
    const ns = namespaceOf(n);
    const list = byNs.get(ns);
    if (list) list.push(n);
    else byNs.set(ns, [n]);
  }
  const sorted = [...byNs.keys()].sort((a, b) => {
    if (a === 'profile') return -1;
    if (b === 'profile') return 1;
    return a.localeCompare(b);
  });
  return sorted.map((ns) => ({
    namespace: ns,
    nodes: byNs
      .get(ns)!
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }));
}

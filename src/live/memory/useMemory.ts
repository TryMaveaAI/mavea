// useMemory.ts — React hook over the memory store, re-reading whenever nodes change
// (the store broadcasts a CustomEvent on every write). Kept separate from store.ts so the
// store stays framework-free and safe to import from the Node eval path.
import { useEffect, useState } from 'react';
import { getMemoryNodes, MEMORY_EVENT, type MemoryNode } from './store';

export type { MemoryNode };

/** The current concept nodes, live-updating as they're merged/edited/deleted. Sorted by
 *  most recently updated first so the panel always shows fresh context at the top. */
export function useMemory(): MemoryNode[] {
  const [nodes, setNodes] = useState<MemoryNode[]>(() => getMemoryNodes());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => setNodes(getMemoryNodes());
    window.addEventListener(MEMORY_EVENT, onChange);
    return () => window.removeEventListener(MEMORY_EVENT, onChange);
  }, []);
  return nodes;
}

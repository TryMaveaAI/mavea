import type { GroundableClaim } from './grounding';
import { groundClaims } from './mapping';

interface Reply {
  id: number;
  ok: boolean;
  claims?: GroundableClaim[];
  error?: string;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (claims: GroundableClaim[]) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./prismGround.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) entry.resolve(reply.claims ?? []);
      else entry.reject(new Error(reply.error ?? 'Grounding failed'));
    };
    worker.onerror = () => {
      const error = new Error('Grounding worker failed');
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

async function chunkedFallback<T extends GroundableClaim>(
  candidates: readonly T[],
  pages: readonly string[],
): Promise<T[]> {
  const grounded: T[] = [];
  for (let index = 0; index < candidates.length; index += 16) {
    grounded.push(...groundClaims(candidates.slice(index, index + 16), pages));
    if (index + 16 < candidates.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return grounded;
}

/** Large fuzzy grounding passes run outside the UI thread; worker-less browsers yield per batch. */
export async function groundClaimsOffMain<T extends GroundableClaim>(
  candidates: readonly T[],
  pages: readonly string[],
): Promise<T[]> {
  const target = getWorker();
  if (!target) return chunkedFallback(candidates, pages);
  const id = (nextId += 1);
  try {
    return (await new Promise<GroundableClaim[]>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      target.postMessage({ id, candidates, pages });
    })) as T[];
  } catch {
    return chunkedFallback(candidates, pages);
  }
}

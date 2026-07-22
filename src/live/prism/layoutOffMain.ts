import { layout, type LayoutResult } from './layout';
import { layoutCorpus, type CorpusLayout } from './synthesis/layoutCorpus';
import type { PrismSpec } from './types';
import type { CorpusSpec } from './synthesis/types';

interface Reply {
  id: number;
  ok: boolean;
  result?: LayoutResult | CorpusLayout;
  error?: string;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (result: LayoutResult | CorpusLayout) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./prismLayout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok && reply.result) entry.resolve(reply.result);
      else entry.reject(new Error(reply.error ?? 'Layout failed'));
    };
    worker.onerror = () => {
      const error = new Error('Layout worker failed');
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

function request(
  payload:
    | { kind: 'prism'; spec: PrismSpec; palette: readonly string[] }
    | { kind: 'corpus'; spec: CorpusSpec; palette: readonly string[] },
): Promise<LayoutResult | CorpusLayout> | null {
  const target = getWorker();
  if (!target) return null;
  const id = (nextId += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ ...payload, id, palette: [...payload.palette] });
  });
}

export async function layoutPrismOffMain(
  spec: PrismSpec,
  palette: readonly string[],
): Promise<LayoutResult> {
  try {
    return (await (request({ kind: 'prism', spec, palette }) ??
      new Promise<LayoutResult>((resolve) =>
        setTimeout(() => resolve(layout(spec, palette)), 0),
      ))) as LayoutResult;
  } catch {
    return new Promise((resolve) => setTimeout(() => resolve(layout(spec, palette)), 0));
  }
}

export async function layoutCorpusOffMain(
  spec: CorpusSpec,
  palette: readonly string[],
): Promise<CorpusLayout> {
  try {
    return (await (request({ kind: 'corpus', spec, palette }) ??
      new Promise<CorpusLayout>((resolve) =>
        setTimeout(() => resolve(layoutCorpus(spec, palette)), 0),
      ))) as CorpusLayout;
  } catch {
    return new Promise((resolve) => setTimeout(() => resolve(layoutCorpus(spec, palette)), 0));
  }
}

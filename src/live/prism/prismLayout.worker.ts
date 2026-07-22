/// <reference lib="webworker" />
import { layout } from './layout';
import { layoutCorpus } from './synthesis/layoutCorpus';
import type { PrismSpec } from './types';
import type { CorpusSpec } from './synthesis/types';

type Request =
  | { id: number; kind: 'prism'; spec: PrismSpec; palette: string[] }
  | { id: number; kind: 'corpus'; spec: CorpusSpec; palette: string[] };

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const result =
      request.kind === 'prism'
        ? layout(request.spec, request.palette)
        : layoutCorpus(request.spec, request.palette);
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Layout failed',
    });
  }
};

export {};

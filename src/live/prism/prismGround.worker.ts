/// <reference lib="webworker" />
import { groundClaims } from './mapping';
import type { GroundableClaim } from './grounding';

interface GroundRequest {
  id: number;
  candidates: GroundableClaim[];
  pages: string[];
}

self.onmessage = (event: MessageEvent<GroundRequest>) => {
  const { id, candidates, pages } = event.data;
  try {
    self.postMessage({ id, ok: true, claims: groundClaims(candidates, pages) });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Grounding failed',
    });
  }
};

export {};

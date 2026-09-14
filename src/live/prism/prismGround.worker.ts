/// <reference lib="webworker" />
import { groundClaims } from './mapping';
import type { GroundableClaim } from './grounding';

interface GroundRequest {
  id: number;
  candidates: GroundableClaim[];
  pages: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGroundable(value: unknown): value is GroundableClaim {
  return isRecord(value) && typeof value.quote === 'string' && typeof value.page === 'number';
}

function isPage(value: unknown): value is string {
  return typeof value === 'string';
}

/** A worker that reads its payload outside its try has no way to answer the caller waiting on that
 *  id, so both collections are checked down to their elements: grounding reads every quote against
 *  every page, so a stray non-string surfaces as whichever string method it failed to answer rather
 *  than as a refusal the caller can act on. */
function asRequest(id: number, payload: Record<string, unknown>): GroundRequest | null {
  const { candidates, pages } = payload;
  if (!Array.isArray(candidates) || !candidates.every(isGroundable)) return null;
  if (!Array.isArray(pages) || !pages.every(isPage)) return null;
  return { id, candidates, pages };
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const payload = event.data;
  // The main thread matches every reply by id, so a payload carrying none has no caller to answer
  // and is dropped. Worth being careful about: this worker is shared, so throwing out of the handler
  // would fail every OTHER grounding pass still running here back onto the main thread at once.
  if (!isRecord(payload) || typeof payload.id !== 'number') return;
  const id = payload.id;
  const request = asRequest(id, payload);
  if (!request) {
    self.postMessage({ id, ok: false, error: 'Malformed grounding request' });
    return;
  }
  const { candidates, pages } = request;
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

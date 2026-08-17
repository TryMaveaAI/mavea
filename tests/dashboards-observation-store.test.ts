// Observation history is its own record per reading, in IndexedDB — not another field inside the
// one encrypted localStorage blob the dashboards store rewrites in full on every write. Readings
// are the highest-frequency write in the product (every metric of every due tracker, every check);
// the existing store's generation counters, quota canary and "one persist per batch" optimisation
// all exist to make that whole-blob rewrite hurt less, which is the primitive telling you it is the
// wrong shape for this data.
//
// SCOPE OF THIS FILE: jsdom ships no working IndexedDB — its `open` never settles — so the real
// read/write path cannot be exercised here without adding a test-double dependency for one module.
// What IS pinned here is the contract that decides whether this module can hurt anyone: every call
// degrades quietly, because history is a bonus on top of the value the card already renders from
// the main store. The round trip itself is verified against a real browser (see the session notes
// on the dashboards detail page).
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  clearObservations,
  observationsFor,
  saveObservation,
} from '../src/live/dashboards/observationStore';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observationStore — history is a bonus, never a dependency', () => {
  it('never throws where IndexedDB does not exist at all', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(
      saveObservation('d1', 't1', { kind: 'metric', value: 1 }, 1000),
    ).resolves.toBeUndefined();
    await expect(observationsFor('d1', 't1')).resolves.toEqual([]);
    await expect(clearObservations('d1')).resolves.toBeUndefined();
  });

  it('never throws where IndexedDB exists but refuses to open (private mode, blocked storage)', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req: Record<string, unknown> = {};
        // Fail asynchronously, the way a real refusal arrives.
        setTimeout(() => (req.onerror as (() => void) | undefined)?.(), 0);
        return req;
      },
    });
    await expect(
      saveObservation('d1', 't1', { kind: 'metric', value: 1 }, 1000),
    ).resolves.toBeUndefined();
    await expect(observationsFor('d1', 't1')).resolves.toEqual([]);
  });

  it('reading a target with no history is an empty list, not an error', async () => {
    await expect(observationsFor('never-seen', 'never-seen')).resolves.toEqual([]);
  });

  it('a save is fire-and-forget from the caller’s side — a check never fails because history did', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('storage disabled by policy');
      },
    });
    await expect(
      saveObservation('d1', 't1', { kind: 'list', items: ['a'] }, 1000),
    ).resolves.toBeUndefined();
  });
});

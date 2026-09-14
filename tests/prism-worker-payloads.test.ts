// prism-worker-payloads.test.ts — what Prism's two workers do with a payload that is not a request.
//
// Each has exactly one client and that client always sends a well-formed message — but a worker that
// reads the payload outside its try dies on the first primitive that ever reaches it, and dying
// takes every OTHER document on that shared worker with it: the client's onerror rejects all of them
// onto the main thread and respawns. So the contract is that a payload carrying an id comes back as
// {id, ok:false, error} — the refusal the client already knows how to fall back from — and one with
// no id is dropped, because replies are matched by id and an id-less reply has no caller to reach.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let posted: Record<string, unknown>[] = [];

/** Fresh worker module per test — importing it is what installs `self.onmessage`. */
async function startWorker(
  load: () => Promise<unknown>,
): Promise<(data: unknown) => Promise<void>> {
  posted = [];
  vi.stubGlobal('postMessage', (message: Record<string, unknown>) => void posted.push(message));
  vi.resetModules();
  await load();
  const handler = self.onmessage as unknown as (event: { data: unknown }) => unknown;
  return async (data: unknown) => {
    await handler({ data });
  };
}

const startExtract = () => startWorker(() => import('../src/live/prism/prismExtract.worker'));
const startGround = () => startWorker(() => import('../src/live/prism/prismGround.worker'));

describe('prismExtract worker — payloads that are not requests', () => {
  beforeEach(() => {
    self.onmessage = null;
  });
  afterEach(() => {
    self.onmessage = null;
    vi.unstubAllGlobals();
  });

  it('refuses a payload it cannot read, on the id that payload arrived with', async () => {
    const send = await startExtract();
    await send({ id: 3 });
    await send({ id: 4, kind: 'sideways', name: 'notes.txt', mime: 'text/plain', data: '' });
    await send({ id: 5, kind: 'text', name: 'notes.txt', mime: 'text/plain', bytes: 'four bytes' });
    expect(posted).toEqual([
      { id: 3, ok: false, error: 'Malformed extraction request' },
      { id: 4, ok: false, error: 'Malformed extraction request' },
      { id: 5, ok: false, error: 'Malformed extraction request' },
    ]);
  });

  it('drops a payload with no id to answer on, and extracts the next request', async () => {
    const send = await startExtract();
    await send(null);
    await send(7);
    await send('extract');
    await send({ kind: 'text', name: 'notes.txt', mime: 'text/plain', data: btoa('hello') });
    expect(posted).toEqual([]);
    await send({ id: 9, kind: 'text', name: 'notes.txt', mime: 'text/plain', data: btoa('hello') });
    expect(posted).toEqual([{ id: 9, ok: true, result: ['hello'] }]);
  });

  it('answers a failure inside the try from the catch, and lives to take the next request', async () => {
    const send = await startExtract();
    const name = 'notes.txt';
    // Undecodable base64: the failure lands mid-try, where the catch used to reach back into the
    // payload for `returnBytes` and throw a second time on its way out.
    await send({ id: 11, kind: 'text', name, mime: 'text/plain', data: '!!', returnBytes: true });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ id: 11, ok: false });
    expect(typeof posted[0]?.error).toBe('string');
    await send({ id: 12, kind: 'text', name, mime: 'text/plain', data: btoa('hello') });
    expect(posted[1]).toEqual({ id: 12, ok: true, result: ['hello'] });
  });
});

describe('prismGround worker — payloads that are not requests', () => {
  beforeEach(() => {
    self.onmessage = null;
  });
  afterEach(() => {
    self.onmessage = null;
    vi.unstubAllGlobals();
  });

  it('refuses a payload it cannot read, on the id that payload arrived with', async () => {
    const send = await startGround();
    await send({ id: 1 });
    await send({ id: 2, candidates: [{ quote: 'the rate fell', page: 1 }], pages: 'page one' });
    await send({ id: 3, candidates: ['the rate fell'], pages: ['the rate fell in March'] });
    expect(posted).toEqual([
      { id: 1, ok: false, error: 'Malformed grounding request' },
      { id: 2, ok: false, error: 'Malformed grounding request' },
      { id: 3, ok: false, error: 'Malformed grounding request' },
    ]);
  });

  it('drops a payload with no id to answer on, and grounds the next request', async () => {
    const send = await startGround();
    await send(null);
    await send(7);
    await send({ candidates: [], pages: [] });
    expect(posted).toEqual([]);
    await send({
      id: 4,
      candidates: [{ quote: 'the rate fell', page: 1 }],
      pages: ['the rate fell in March'],
    });
    expect(posted).toEqual([{ id: 4, ok: true, claims: [{ quote: 'the rate fell', page: 1 }] }]);
  });
});

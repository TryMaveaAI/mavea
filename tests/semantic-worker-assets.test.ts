// semantic-worker-assets.test.ts — the semantic worker's message contract and where it may load from.
//
// The worker is handed its asset base on a message and then follows `index.json` to the matrix file,
// so both halves of every load path are data. It must only ever read this build's own `semantic/`
// directory, and it must ignore a message that isn't one of its three requests — a dedicated worker
// carries no origin, so the shape is the whole contract.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const INDEX = {
  modelId: 'test/model',
  dim: 2,
  matrix: { file: 'matrix.i8', scale: 0.01 },
  tokenizer: {
    lowercase: true,
    stripAccents: true,
    handleChineseChars: false,
    prefix: '##',
    unkToken: '[UNK]',
    maxChars: 100,
  },
  components: { scale: 0.01, types: ['chart'], vectors: ['7f00'] },
};

let fetched: string[] = [];
let posted: Record<string, unknown>[] = [];

/** Fresh worker module per test — `loaded` is module state. */
async function startWorker(index: unknown = INDEX): Promise<(data: unknown) => Promise<void>> {
  fetched = [];
  posted = [];
  vi.stubGlobal('fetch', (input: URL | string) => {
    const url = String(input);
    fetched.push(url);
    if (url.endsWith('index.json')) return Promise.resolve(new Response(JSON.stringify(index)));
    if (url.endsWith('vocab.txt')) return Promise.resolve(new Response('[UNK]\nhello'));
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4])));
  });
  vi.stubGlobal('postMessage', (message: Record<string, unknown>) => void posted.push(message));
  vi.resetModules();
  await import('../src/live/semantic/worker');
  const handler = self.onmessage as unknown as (event: { data: unknown }) => Promise<void>;
  return (data: unknown) => handler({ data });
}

describe('semantic worker asset loading', () => {
  beforeEach(() => {
    self.onmessage = null;
  });
  afterEach(() => {
    self.onmessage = null;
    vi.unstubAllGlobals();
  });

  it("loads the three assets from the app's own semantic directory", async () => {
    const send = await startWorker();
    await send({ type: 'init', base: '/semantic/', modelId: 'test/model' });
    expect(posted).toEqual([{ type: 'ready' }]);
    expect(fetched.sort()).toEqual([
      `${location.origin}/semantic/index.json`,
      `${location.origin}/semantic/matrix.i8`,
      `${location.origin}/semantic/vocab.txt`,
    ]);
  });

  it('refuses a base off this origin, without fetching', async () => {
    const send = await startWorker();
    await send({
      type: 'init',
      base: 'https://elsewhere.example/semantic/',
      modelId: 'test/model',
    });
    expect(fetched).toEqual([]);
    expect(posted[0]?.type).toBe('error');
  });

  it('refuses a base outside the semantic directory, without fetching', async () => {
    const send = await startWorker();
    await send({ type: 'init', base: '/uploads/', modelId: 'test/model' });
    expect(fetched).toEqual([]);
    expect(posted[0]?.type).toBe('error');
  });

  it('refuses a matrix filename that climbs out of the asset directory', async () => {
    const send = await startWorker({ ...INDEX, matrix: { file: '../../matrix.i8', scale: 0.01 } });
    await send({ type: 'init', base: '/semantic/', modelId: 'test/model' });
    expect(fetched).toEqual([`${location.origin}/semantic/index.json`]);
    expect(posted[0]?.type).toBe('error');
  });

  it('ignores a message that is not one of its three requests', async () => {
    const send = await startWorker();
    await send(null);
    await send('init');
    await send({ type: 'unknown' });
    await send({ type: 'init', base: 42, modelId: 'test/model' });
    await send({ type: 'fit', id: '1', query: 'charts' });
    await send({ type: 'embed', id: 1 });
    expect(fetched).toEqual([]);
    expect(posted).toEqual([]);
  });
});

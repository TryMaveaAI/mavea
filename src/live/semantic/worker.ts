// worker.ts — loads the static embedder off the main thread and scores a query against every
// component. Kept on a worker so the one-time ~7MB matrix fetch + parse and the (sub-millisecond, but
// still) per-query work never touch the UI thread, even on a weak CPU. Pure compute after load: it
// holds the int8 matrix as a typed array and embeds with encode.ts. Speaks a tiny message protocol to
// client.ts. Never throws across the boundary — a load failure posts {type:'error'} and the client
// permanently falls back to the keyword/intent path.
/// <reference lib="webworker" />
import { embed, cosine, type StaticModel } from './encode';

interface IndexFile {
  modelId: string;
  dim: number;
  matrix: { file: string; scale: number };
  tokenizer: StaticModel['params'];
  components: { scale: number; types: string[]; vectors: string[] };
}

interface Loaded {
  model: StaticModel;
  types: string[];
  vecs: Float32Array[];
}

let loaded: Loaded | null = null;

/** Decode one int8 component vector (hex string of `dim` bytes) into a scaled Float32 vector.
 *  The vectors were L2-normalized before quantization, so cosine against the query is a dot product. */
function decodeVec(hex: string, dim: number, scale: number): Float32Array {
  const v = new Float32Array(dim);
  for (let d = 0; d < dim; d++) {
    const byte = parseInt(hex.substr(d * 2, 2), 16);
    v[d] = (byte > 127 ? byte - 256 : byte) * scale;
  }
  return v;
}

// The matrix alone is ~7MB — on a slow or stalled connection a bare fetch can hang indefinitely
// with no error and no progress. A timeout turns that into the same clean {type:'error'} fallback
// a genuine network failure already produces, rather than leaving the semantic boost permanently
// "loading."
const LOAD_TIMEOUT_MS = 45_000;

async function load(base: string, expectedModelId: string): Promise<Loaded> {
  const index: IndexFile = await (
    await fetch(`${base}index.json`, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) })
  ).json();
  if (index.modelId !== expectedModelId) {
    // Stale/mismatched assets would score in the wrong space — refuse rather than mislead.
    throw new Error(`semantic asset model ${index.modelId} != expected ${expectedModelId}`);
  }
  const [matrixBuf, vocabText] = await Promise.all([
    fetch(`${base}${index.matrix.file}`, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) }).then(
      (r) => r.arrayBuffer(),
    ),
    fetch(`${base}vocab.txt`, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) }).then((r) =>
      r.text(),
    ),
  ]);
  const vocab = new Map<string, number>();
  const lines = vocabText.split('\n');
  for (let i = 0; i < lines.length; i++) vocab.set(lines[i], i);
  const model: StaticModel = {
    matrix: new Int8Array(matrixBuf),
    scale: index.matrix.scale,
    dim: index.dim,
    vocab,
    unkId: vocab.get(index.tokenizer.unkToken) ?? 0,
    params: index.tokenizer,
  };
  const { types, vectors, scale } = index.components;
  const vecs = vectors.map((hex) => decodeVec(hex, index.dim, scale));
  return { model, types, vecs };
}

/** Top-K components by cosine, above a small floor that drops the long tail of near-zero noise. The
 *  selector treats the result as an additive boost, so a generous K + low floor is safe — it only
 *  ADDS relevance candidates; the keyword/intent fit and the base floor still carry the menu. */
const TOP_K = 12;
const FLOOR = 0.18;

function fit(query: string): [string, number][] {
  if (!loaded) return [];
  const q = embed(query, loaded.model);
  const scored: [string, number][] = [];
  for (let i = 0; i < loaded.types.length; i++) {
    const c = cosine(q, loaded.vecs[i]);
    if (c > FLOOR) scored.push([loaded.types[i], c]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, TOP_K);
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'init'; base: string; modelId: string }
    | { type: 'fit'; id: number; query: string }
    | { type: 'embed'; id: number; text: string };
  if (msg.type === 'init') {
    try {
      loaded = await load(msg.base, msg.modelId);
      (self as unknown as Worker).postMessage({ type: 'ready' });
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'error', message: String(err) });
    }
    return;
  }
  if (msg.type === 'fit') {
    (self as unknown as Worker).postMessage({ type: 'result', id: msg.id, fits: fit(msg.query) });
    return;
  }
  if (msg.type === 'embed') {
    // Raw text→vector for turn-to-turn similarity (session threading). Reuses the already-loaded
    // matrix; posts a zero-length vector when the model isn't ready so the client resolves null.
    const vec = loaded ? embed(msg.text, loaded.model) : new Float32Array(0);
    (self as unknown as Worker).postMessage({ type: 'embedded', id: msg.id, vec }, [vec.buffer]);
  }
};

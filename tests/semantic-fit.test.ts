// semantic-fit.test.ts — proves the on-device semantic engine on the REAL built assets.
//
// Two things this guards, both against the actual public/semantic/* the build step emits:
//  1. ENCODER PARITY — the pure-JS encoder (src/live/semantic/encode.ts) reproduces the Python
//     Model2Vec reference (validate.json) to within int8-quantization error. A drift here means the
//     tokenizer or pooling diverged and every component vector is being matched in the wrong space.
//  2. RANKING — embedding a real question and cosine-ranking the component exemplar vectors puts the
//     RIGHT component near the top. This is the end-to-end behaviour the selector folds in.
//
// The assets are generated (gitignored, ~7MB), so the suite SKIPS cleanly when they're absent — run
// `pnpm semantic:build` (or fetch the deployed assets) to exercise it. Pure Node: no worker/DOM.
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { embed, cosine, type StaticModel } from '../src/live/semantic/encode';

// Relative to the vitest cwd (app/). The assets are generated + gitignored, so absence → skip.
const DIR = 'public/semantic/';
const has = existsSync(DIR + 'index.json') && existsSync(DIR + 'matrix.i8');

interface IndexFile {
  dim: number;
  matrix: { scale: number };
  tokenizer: StaticModel['params'];
  components: { scale: number; types: string[]; vectors: string[] };
}

function loadModel(): { model: StaticModel; types: string[]; vecs: Float32Array[] } {
  const index: IndexFile = JSON.parse(readFileSync(DIR + 'index.json', 'utf8'));
  const buf = readFileSync(DIR + 'matrix.i8');
  const matrix = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const vocab = new Map<string, number>();
  readFileSync(DIR + 'vocab.txt', 'utf8')
    .split('\n')
    .forEach((t, i) => vocab.set(t, i));
  const model: StaticModel = {
    matrix,
    scale: index.matrix.scale,
    dim: index.dim,
    vocab,
    unkId: vocab.get(index.tokenizer.unkToken) ?? 0,
    params: index.tokenizer,
  };
  const { types, vectors, scale } = index.components;
  const vecs = vectors.map((hex) => {
    const v = new Float32Array(index.dim);
    for (let d = 0; d < index.dim; d++) {
      const b = parseInt(hex.substr(d * 2, 2), 16);
      v[d] = (b > 127 ? b - 256 : b) * scale;
    }
    return v;
  });
  return { model, types, vecs };
}

describe.skipIf(!has)('semantic engine (on the built assets)', () => {
  const { model, types, vecs } = has
    ? loadModel()
    : { model: null as never, types: [] as string[], vecs: [] as Float32Array[] };

  it('JS encoder reproduces the Python reference (int8 fidelity)', () => {
    const samples: { text: string; emb: number[] }[] = JSON.parse(
      readFileSync(DIR + 'validate.json', 'utf8'),
    );
    let worst = 1;
    for (const s of samples) {
      const c = cosine(embed(s.text, model), new Float32Array(s.emb));
      worst = Math.min(worst, c);
    }
    // > 0.995 is pure int8-vs-fp32 quantization headroom; a tokenizer bug would crater this.
    expect(worst).toBeGreaterThan(0.995);
  });

  const rank = (q: string): [string, number][] =>
    types
      .map((t, i) => [t, cosine(embed(q, model), vecs[i])] as [string, number])
      .sort((a, b) => b[1] - a[1]);

  it('ranks the right component near the top for real questions', () => {
    const cases: [string, string][] = [
      ['how do I play a G chord on guitar', 'chorddiagram'],
      ['show me the periodic table', 'periodictable'],
      ['compare renting vs buying a home', 'compare'],
      ['help me get over a breakup', 'copingmenu'],
    ];
    for (const [q, expected] of cases) {
      const top = rank(q)
        .slice(0, 5)
        .map(([t]) => t);
      expect(top, `"${q}" → ${top.join(', ')}`).toContain(expected);
    }
  });
});

// semantic-threads.test.ts — the session-threading boundary (src/live/semantic/threads.ts).
//
// Two layers:
//  1. ALGORITHM — hand-built unit vectors with known cosines exercise the three-band decision, the
//     running centroid, per-frame fail-open, and the byte-identical fallback when no vectors are given.
//  2. REAL MODEL — on the built potion-base-8M assets (skipped cleanly when absent), the canonical
//     "trip + car + hotels vs diabetes" sequence groups the way a person would, INCLUDING when the
//     lexical `mode` boundary would get it wrong (the whole reason this module exists).
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { threadStarts, THREAD_KEEP, THREAD_UNRELATED } from '../src/live/semantic/threads';
import { embed, type StaticModel } from '../src/live/semantic/encode';
import type { TurnFrame } from '../src/live/history';
import type { Mode } from '../src/live/lifecycle';
import type { ConversationSpec } from '../src/data/conversation';

function frame(mode: Mode, question = '', topicShift?: boolean): TurnFrame {
  return {
    question,
    narration: '',
    mode,
    ...(topicShift !== undefined ? { topicShift } : {}),
    tour: [],
    spec: {
      id: 'live',
      title: '',
      sub: '',
      blocks: [],
      suggests: [],
    } as unknown as ConversationSpec,
    at: 0,
  };
}

/** A unit vector at angle `theta` from e1 in the e1–e2 plane, so cosine(v, e1) === cos(theta). */
function unitAt(cos: number, dim = 8): Float32Array {
  const v = new Float32Array(dim);
  v[0] = cos;
  v[1] = Math.sqrt(Math.max(0, 1 - cos * cos));
  return v;
}
const E1 = unitAt(1);

describe('threadStarts — the three-band decision', () => {
  it('always opens a thread on the first frame', () => {
    expect(threadStarts([frame('augment')], [E1])[0]).toBe(true);
    expect(threadStarts([frame('refine')], [E1])[0]).toBe(true);
  });

  it('CONTINUES a turn that is close to the thread, even when the mode hint says replace', () => {
    // cos 0.9 ≥ KEEP → stays in-thread despite a `replace` hint (the Jaccard-misfire case).
    const starts = threadStarts([frame('replace'), frame('replace')], [E1, unitAt(0.9)]);
    expect(starts).toEqual([true, false]);
  });

  it('SPLITS a clearly-unrelated turn, even when the mode hint says augment', () => {
    // cos 0.05 < UNRELATED → new thread despite an `augment` keep-hint.
    const starts = threadStarts([frame('augment'), frame('augment')], [E1, unitAt(0.05)]);
    expect(starts).toEqual([true, true]);
  });

  it('defers to the mode hint inside the middle band', () => {
    const mid = unitAt(0.3); // UNRELATED < 0.3 < KEEP
    expect(threadStarts([frame('augment'), frame('replace')], [E1, mid])).toEqual([true, true]);
    expect(threadStarts([frame('augment'), frame('augment')], [E1, mid])).toEqual([true, false]);
  });

  it('groups CONTIGUOUSLY — a later turn resembling a CLOSED thread starts fresh, never rejoins', () => {
    // A, then B unrelated to A (new thread), then C ~ A but compared only to B's centroid → new thread.
    const A = E1;
    const B = unitAt(0.02);
    const C = unitAt(0.95); // close to A, but A's thread is closed; centroid is now B
    const starts = threadStarts([frame('replace'), frame('replace'), frame('replace')], [A, B, C]);
    expect(starts).toEqual([true, true, true]);
  });

  it('uses a running centroid, not just the previous turn', () => {
    // Two near-identical members build a stable centroid; a third close to that mean continues.
    const a = unitAt(1);
    const b = unitAt(0.98);
    const c = unitAt(0.9);
    expect(threadStarts([frame('replace'), frame('augment'), frame('replace')], [a, b, c])).toEqual(
      [true, false, false],
    );
  });
});

describe('threadStarts — fail-open', () => {
  const frames = [frame('replace'), frame('augment'), frame('replace'), frame('augment')];
  const modeBoundary = frames.map((f, i) => i === 0 || f.mode === 'replace');

  it('falls back to the mode boundary when no vectors are supplied', () => {
    expect(threadStarts(frames, null)).toEqual(modeBoundary);
  });

  it('falls back per-frame when a single vector is missing', () => {
    // Frame 1 has no vector → its split is decided by its mode (augment → continue), as today.
    const starts = threadStarts(frames, [E1, null, unitAt(0.02), E1]);
    expect(starts[0]).toBe(true); // first frame
    expect(starts[1]).toBe(false); // null vector → mode 'augment' → continue
    expect(starts[2]).toBe(true); // unrelated → split
  });

  it('treats a zero (all-unknown) vector as no signal', () => {
    const zero = new Float32Array(8);
    const starts = threadStarts([frame('augment'), frame('augment')], [zero, zero]);
    expect(starts).toEqual([true, false]); // both fail-open to mode 'augment'
  });
});

describe('threadStarts — topicShift outranks the render mode', () => {
  it('a streamed follow-up (mode replace, topicShift false) CONTINUES its thread with no vectors', () => {
    // The reported bug: every follow-up streamed, so every frame's mode was 'replace' and the
    // rail split each into its own chapter. The settled topicShift is the true boundary.
    const frames = [
      frame('replace', 'three days in tokyo', true),
      frame('replace', 'how to book high-end sushi?', false),
      frame('replace', 'tell me more', false),
    ];
    expect(threadStarts(frames, null)).toEqual([true, false, false]);
  });

  it('a genuine shift (topicShift true) SPLITS even when the render merged', () => {
    const frames = [frame('replace', 'budget', true), frame('augment', 'tokyo trip', true)];
    expect(threadStarts(frames, null)).toEqual([true, true]);
  });

  it('defers to topicShift, not mode, inside the semantic tie band', () => {
    const mid = unitAt(0.3); // UNRELATED < 0.3 < KEEP
    const follow = frame('replace', '', false);
    const shift = frame('augment', '', true);
    expect(threadStarts([frame('replace', '', true), follow], [E1, mid])).toEqual([true, false]);
    expect(threadStarts([frame('replace', '', true), shift], [E1, mid])).toEqual([true, true]);
  });
});

// ---- Real model: the canonical example on the built assets ------------------------------------
const DIR = 'public/semantic/';
const hasAssets = existsSync(DIR + 'index.json') && existsSync(DIR + 'matrix.i8');

interface IndexFile {
  dim: number;
  matrix: { scale: number };
  tokenizer: StaticModel['params'];
}
function loadModel(): StaticModel {
  const index: IndexFile = JSON.parse(readFileSync(DIR + 'index.json', 'utf8'));
  const buf = readFileSync(DIR + 'matrix.i8');
  const vocab = new Map<string, number>();
  readFileSync(DIR + 'vocab.txt', 'utf8')
    .split('\n')
    .forEach((t, i) => vocab.set(t, i));
  return {
    matrix: new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    scale: index.matrix.scale,
    dim: index.dim,
    vocab,
    unkId: vocab.get(index.tokenizer.unkToken) ?? 0,
    params: index.tokenizer,
  };
}

// `describe.skipIf` only skips the `it` bodies below — the describe callback itself (and any
// top-level `embed()` calls in it) still runs during collection even when assets are absent, so
// the whole block is gated with a plain `if` instead to keep it from touching a null model at all.
if (hasAssets) {
  describe('threadStarts — canonical trip/diabetes example (real model)', () => {
    const model = loadModel();
    // Each turn's embedded text is question + narration + title (the narration/title recover
    // anaphora on terse asks like "renting a car there"). Modes are set to what the LEXICAL
    // boundary would emit — 'replace' for every one, since none share enough words — to prove
    // the semantic signal overrides the Jaccard misfire and keeps the trip follow-ups together
    // anyway.
    const turns = [
      "help me plan a trip to Portugal. Here's a relaxed week across Portugal — Lisbon, Porto, and the Algarve coast. Portugal Trip",
      'what about renting a car there. Renting a car in Portugal is easy; here are the pickup options and rough daily costs. Renting a Car in Portugal',
      'and hotels in Lisbon. The best Lisbon neighborhoods to stay in, with a few hotels at each price point. Lisbon Hotels',
      'how does diabetes drug discovery work. Modern diabetes drug discovery, from target selection through clinical trials. Diabetes Drug Discovery',
      'back to the car — what about insurance. Rental car insurance in Portugal: what CDW covers and when to add extra. Car Rental Insurance',
    ];
    const vectors = turns.map((t) => embed(t, model));
    const frames = turns.map(() => frame('replace'));

    it('keeps trip + car + hotels as one thread and splits diabetes off — despite replace hints', () => {
      expect(threadStarts(frames, vectors)).toEqual([true, false, false, true, true]);
    });

    it('separates same-thread similarity from a pivot with clear margin around the thresholds', () => {
      const cos = (a: Float32Array, b: Float32Array): number => {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
      };
      // trip↔car is a real continuation (well above KEEP); trip↔diabetes is a pivot (below UNRELATED).
      expect(cos(vectors[0], vectors[1])).toBeGreaterThan(THREAD_KEEP);
      expect(cos(vectors[0], vectors[3])).toBeLessThan(THREAD_UNRELATED);
    });
  });
}

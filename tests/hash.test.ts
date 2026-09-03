// hash.test.ts — `fnv1a` is a PERSISTENCE primitive: `turnFrameId` folds it into the id a saved
// session is filed under, so a saved conversation loses its identity the moment the digest moves.
// These tests pin the exact algorithm (not just "some stable hash") against a written-out FNV-1a,
// and pin the string form to the integer form so the two can never drift apart.
import { describe, it, expect } from 'vitest';
import { fnv1a, fnv1aInt } from '../src/lib/hash';
import { turnFrameId, type TurnFrame } from '../src/live/history';
import type { ConversationSpec } from '../src/data/conversation';

/** FNV-1a 32-bit, written out longhand — the reference the shipped hash must keep matching. */
function referenceFnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A deterministic corpus: hand-picked edge cases plus a seeded fuzz over the full BMP. */
function corpus(): string[] {
  const samples = [
    '',
    'a',
    'ab',
    '0',
    ' ',
    'Mavéa',
    'x y z',
    'live-1:insight',
    'a'.repeat(1000),
    '\u0000separated\u0000fields\u0000',
    '日本語',
    '🐙 surrogate pair',
    String.fromCharCode(0xffff),
  ];
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 2000; n++) {
    const len = Math.floor(next() * 40);
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(Math.floor(next() * 0x10000));
    samples.push(s);
  }
  return samples;
}

describe('fnv1a', () => {
  it('matches a longhand FNV-1a over an edge-case + fuzz corpus', () => {
    for (const s of corpus()) {
      expect(fnv1aInt(s), JSON.stringify(s)).toBe(referenceFnv1a(s));
      expect(fnv1a(s), JSON.stringify(s)).toBe(referenceFnv1a(s).toString(36));
    }
  });

  it('keeps the string form as base-36 of the integer form', () => {
    for (const s of corpus()) expect(fnv1a(s)).toBe(fnv1aInt(s).toString(36));
  });

  it('pins known digests, so a "harmless" refactor of the loop cannot slide', () => {
    expect(fnv1a('')).toBe('ztntfp');
    expect(fnv1a('mavea')).toBe('1a0z9it');
    expect(fnv1aInt('')).toBe(2166136261);
  });
});

describe('turnFrameId', () => {
  const frame = (over: Partial<TurnFrame> = {}): TurnFrame =>
    ({
      at: 1717171717171,
      question: 'What is a Kafka partition?',
      narration: 'A partition is the unit of parallelism.',
      spec: { id: 'live', title: 'Kafka partitions', blocks: [] } as unknown as ConversationSpec,
      ...over,
    }) as TurnFrame;

  it('derives a legacy id whose digest is the shared fnv1a of the frame fields', () => {
    const f = frame();
    const source = `${f.at}\u0000${f.question}\u0000${f.narration}\u0000${f.spec.title ?? ''}`;
    expect(turnFrameId(f)).toBe(`legacy-${f.at.toString(36)}-${fnv1a(source)}`);
  });

  it('keeps the id a saved session was filed under', () => {
    // A frozen golden: if this changes, every stored session silently loses its identity.
    expect(turnFrameId(frame())).toBe('legacy-lwuvpctv-1lvwv0o');
  });

  it('prefers an explicit id over the derived one', () => {
    expect(turnFrameId(frame({ id: 'turn-7' }))).toBe('turn-7');
  });
});

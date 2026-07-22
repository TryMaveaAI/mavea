import { describe, it, expect } from 'vitest';
import { inferredClaims, sourceNames } from '../src/live/voice/confidence';
import type { Block, ConversationSpec } from '../src/data/conversation';

function blk(type: string, props: Record<string, unknown>): Block {
  return { type, col: 6, props } as unknown as Block;
}

function spec(blocks: Block[]): ConversationSpec {
  return { blocks } as unknown as ConversationSpec;
}

describe('inferredClaims — how many of the canvas’s claims are shaky', () => {
  it('counts inferred and unverified blocks, ignores grounded ones', () => {
    const s = spec([
      blk('insight', { title: 'a', conf: 'strong' }),
      blk('insight', { title: 'b', conf: 'inferred' }),
      blk('understand', { title: 'c', conf: 'unverified' }),
      blk('insight', { title: 'd', conf: 'partial' }),
      blk('bars', { title: 'e' }),
    ]);
    expect(inferredClaims(s)).toBe(2);
  });

  it('walks composite regions', () => {
    const inner = blk('insight', { title: 'in', conf: 'inferred' });
    const s = spec([
      blk('composite', { title: 'combo', regions: [{ block: inner }, { block: blk('kpi', {}) }] }),
    ]);
    expect(inferredClaims(s)).toBe(1);
  });

  it('ignores junk conf values and a missing spec', () => {
    expect(inferredClaims(spec([blk('insight', { conf: 42 })]))).toBe(0);
    expect(inferredClaims(null)).toBe(0);
  });
});

describe('sourceNames — the hero’s mono source row', () => {
  it('uses hostnames, stripped of www, deduped, capped', () => {
    expect(
      sourceNames([
        { title: 'Open Compute Project', url: 'https://www.opencompute.org/standards' },
        { title: 'OCP again', url: 'https://opencompute.org/other' },
        { title: 'AI papers', url: 'https://arxiv.org/abs/1' },
        { title: 'More papers', url: 'https://example.com/2' },
        { title: 'Overflow', url: 'https://overflow.dev/3' },
      ]),
    ).toEqual(['opencompute.org', 'arxiv.org', 'example.com']);
  });

  it('falls back to the title when a URL does not parse', () => {
    expect(sourceNames([{ title: 'A local note', url: 'not a url' }])).toEqual(['A local note']);
  });

  it('is empty for missing or empty sources', () => {
    expect(sourceNames(undefined)).toEqual([]);
    expect(sourceNames([])).toEqual([]);
  });
});

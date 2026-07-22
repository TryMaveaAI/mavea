import { describe, expect, it } from 'vitest';
import { stripForSnapshot } from '../src/live/atlas/snapshot';
import type { ConversationSpec } from '../src/data/conversation';

/** A full spec carrying heavy + regenerable fields, to prove the snapshot sheds them. */
function fullSpec(): ConversationSpec {
  return {
    id: 'money',
    workspace: 'W',
    title: 'Why did Q3 dip?',
    sub: 'A look at the quarter',
    opener: 'data:image/png;base64,' + 'A'.repeat(5000), // a big inline asset → must be dropped
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
    topic: 'Finance',
    track: { score: 5, reason: 'tracked' },
    intents: {},
  };
}

describe('stripForSnapshot', () => {
  it('keeps the render-essential fields', () => {
    const s = stripForSnapshot(fullSpec());
    expect(s.id).toBe('money');
    expect(s.workspace).toBe('W');
    expect(s.title).toBe('Why did Q3 dip?');
    expect(s.sub).toBe('A look at the quarter');
    expect(s.topic).toBe('Finance');
    expect(Array.isArray(s.blocks)).toBe(true);
  });

  it('drops large inline data: URIs (the Library quota rule)', () => {
    expect(stripForSnapshot(fullSpec()).opener).toBe('');
  });

  it('resets heavy / regenerable fields to empty-but-valid forms', () => {
    const s = stripForSnapshot(fullSpec());
    expect(s.proof).toBeNull();
    expect(s.extras).toEqual({});
    expect(s.suggests).toEqual([]);
    expect(s.keywords).toEqual([]);
    expect(s.track).toBeUndefined();
    expect(s.intents).toBeUndefined();
  });

  it('returns a fresh object (mutating the snapshot never touches the original)', () => {
    const original = fullSpec();
    const s = stripForSnapshot(original);
    expect(s).not.toBe(original);
    s.blocks.push({ id: 'x', type: 'insight', props: {} } as never);
    expect(original.blocks).toHaveLength(0);
  });
});

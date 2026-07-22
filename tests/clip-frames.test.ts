import { describe, it, expect } from 'vitest';
import { framesFromSpec } from '../src/clip/frames';
import type { Block, ConversationSpec } from '../src/data/conversation';

const block = (id: string): Block =>
  ({ type: 'insight', col: 6, id, props: { title: 'X', stat: '1' } }) as unknown as Block;

const spec = (over: Partial<ConversationSpec> = {}): ConversationSpec =>
  ({
    id: 'study',
    title: 'The Anatomy of Cool Spaces',
    sub: 'A quick read.',
    opener: 'What makes a space feel cool?',
    found: 'It comes down to one ratio.',
    blocks: [block('a'), block('b'), block('c')],
    ...over,
  }) as unknown as ConversationSpec;

describe('framesFromSpec — wrap a shown canvas as a playable story frame', () => {
  it('builds one frame that walks every card in reading order', () => {
    const [f, ...rest] = framesFromSpec(spec());
    expect(rest).toHaveLength(0);
    expect(f.tour.map((t) => t.index)).toEqual([0, 1, 2]);
    expect(f.spec.blocks).toHaveLength(3);
  });

  it('uses the opening line as the cold-open question and the found line as narration', () => {
    const [f] = framesFromSpec(spec());
    expect(f.question).toBe('What makes a space feel cool?');
    expect(f.narration).toBe('It comes down to one ratio.');
  });

  it('falls back through sub/opener/title when richer lines are absent', () => {
    const [f] = framesFromSpec(spec({ found: undefined, sub: 'sub line' }));
    expect(f.narration).toBe('sub line');
  });

  it('returns nothing for an empty canvas', () => {
    expect(framesFromSpec(spec({ blocks: [] }))).toEqual([]);
  });
});

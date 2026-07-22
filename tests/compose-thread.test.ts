// compose-thread.test.ts — folding a topic thread's turns into one canvas spec (composeThread.ts).
import { composeThread, canComposeThread } from '../src/live/composeThread';
import type { TurnFrame } from '../src/live/history';
import type { Block, ConversationSpec, WebSource } from '../src/data/conversation';

function blk(type: string, title: string, id: string): Block {
  return { type, col: 12, id, props: { title } } as unknown as Block;
}
function frame(blocks: Block[], extra: Partial<ConversationSpec> = {}, title = 'turn'): TurnFrame {
  return {
    question: 'q',
    narration: '',
    mode: 'replace',
    tour: [],
    at: 0,
    spec: {
      id: 'live',
      title,
      sub: '',
      blocks,
      suggests: [],
      ...extra,
    } as unknown as ConversationSpec,
  };
}

describe('canComposeThread', () => {
  it('is true only for ≥2 frames', () => {
    expect(canComposeThread([])).toBe(false);
    expect(canComposeThread([frame([])])).toBe(false);
    expect(canComposeThread([frame([]), frame([])])).toBe(true);
  });
});

describe('composeThread', () => {
  it('returns null for fewer than two frames', () => {
    expect(composeThread([])).toBeNull();
    expect(composeThread([frame([blk('chart', 'A', 'a')])])).toBeNull();
  });

  it('folds every frame’s blocks into one spec, renumbered live-N', () => {
    const spec = composeThread([
      frame([blk('chart', 'Trip cost', 'x1')]),
      frame([blk('map', 'Route', 'x2')]),
      frame([blk('compare', 'Hotels', 'x3')]),
    ]);
    expect(spec).not.toBeNull();
    expect(spec!.blocks.map((b) => (b.props as { title: string }).title)).toEqual([
      'Trip cost',
      'Route',
      'Hotels',
    ]);
    // ids are renumbered to a unique live-N sequence
    expect(spec!.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2', 'live-3']);
  });

  it('dedupes a card that recurs across turns (same type + title)', () => {
    const spec = composeThread([
      frame([blk('chart', 'Growth', 'a')]),
      frame([blk('chart', 'Growth', 'b'), blk('kpi', 'Total', 'c')]),
    ]);
    const titles = spec!.blocks.map((b) => (b.props as { title: string }).title);
    expect(titles).toEqual(['Growth', 'Total']); // Growth appears once
  });

  it('shows ALL the thread’s cards by default — "see all" is not truncated', () => {
    const many = Array.from({ length: 30 }, (_, i) => blk('insight', 'P' + i, 'p' + i));
    const spec = composeThread([frame(many.slice(0, 15)), frame(many.slice(15))]);
    expect(spec!.blocks).toHaveLength(30);
    expect(spec!.sub).toBe('2 moments in this thread');
  });

  it('honors an explicit finite cap and says so in the sub', () => {
    const many = Array.from({ length: 22 }, (_, i) => blk('insight', 'P' + i, 'p' + i));
    const spec = composeThread([frame(many.slice(0, 10)), frame(many.slice(10))], { cap: 16 });
    expect(spec!.blocks).toHaveLength(16);
    expect(spec!.sub).toContain('first 16 cards');
  });

  it('summarizes the moment count', () => {
    const spec = composeThread([frame([blk('a', 'A', '1')]), frame([blk('b', 'B', '2')])]);
    expect(spec!.sub).toBe('2 moments in this thread');
  });

  it('applies title/tint/id options and clears single-turn interactive bits', () => {
    const spec = composeThread(
      [
        frame([blk('a', 'A', '1')], {
          suggests: ['more?'] as unknown as ConversationSpec['suggests'],
          bend: {} as ConversationSpec['bend'],
          awaiting: true,
          blanks: [{ key: 'k' }] as ConversationSpec['blanks'],
        }),
        frame([blk('b', 'B', '2')]),
      ],
      { title: 'Portugal Trip', tint: '#ff8800', id: 'thread-ch-0' },
    );
    expect(spec!.title).toBe('Portugal Trip');
    expect(spec!.tint).toBe('#ff8800');
    expect(spec!.id).toBe('thread-ch-0');
    expect(spec!.suggests).toEqual([]);
    expect(spec!.bend).toBeUndefined();
    expect(spec!.awaiting).toBeUndefined();
    expect(spec!.blanks).toBeUndefined();
  });

  it('merges sources across turns, de-duplicated by url', () => {
    const s = (url: string, title: string): WebSource => ({ url, title });
    const spec = composeThread([
      frame([blk('a', 'A', '1')], { sources: [s('u1', 'One'), s('u2', 'Two')] }),
      frame([blk('b', 'B', '2')], { sources: [s('u2', 'Two again'), s('u3', 'Three')] }),
    ]);
    expect(spec!.sources?.map((x) => x.url)).toEqual(['u1', 'u2', 'u3']);
  });
});

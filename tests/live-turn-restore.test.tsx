import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveTurn } from '../src/live/useLiveTurn';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { ModelConfig } from '../src/types/mavea';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x' };

function spec(): ConversationSpec {
  const blocks: Block[] = [
    {
      type: 'insight',
      id: 'i1',
      col: 12,
      num: '1',
      props: { title: 'Money', summary: 's', conf: 'inferred' },
    } as Block,
    { type: 'list', id: 'l1', col: 12, props: { title: 'Notes', items: ['a'] } } as Block,
  ];
  return {
    id: 'money',
    workspace: 'W',
    title: 'Your money',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

describe('useLiveTurn — restore (resume a saved canvas)', () => {
  it('opens a saved canvas as a fresh replace turn, no model call', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    expect(result.current.spec).toBeNull();

    const s = spec();
    act(() => result.current.restore(s, 'where does my money go?'));

    expect(result.current.spec).toBe(s);
    expect(result.current.status).toBe('showing');
    expect(result.current.spot).toBe('i1'); // spotlight opens on the lead id-bearing block
    expect(result.current.turn).toBe(1); // re-keys → reveals
    expect(result.current.replaceEpoch).toBe(1); // remounts the canvas
    expect(result.current.busy).toBe(false);
    // History is seeded so a follow-up continues naturally.
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0]).toEqual({ role: 'user', content: 'where does my money go?' });
    expect(result.current.prior?.title).toBe('Your money');
  });
});

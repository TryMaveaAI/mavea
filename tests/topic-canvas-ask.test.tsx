import { render, fireEvent } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// The per-block "ask about this" affordance is Live-only: TopicCanvas renders it only when given
// onAskBlock (the Demo never passes it), and only on blocks that carry an id (real, referenceable
// cards). These tests lock that gating and the pinned-selected state.
function spec(blocks: Block[]): ConversationSpec {
  return {
    id: 't',
    workspace: 'T',
    title: 'T',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

const withId: Block = {
  type: 'insight',
  id: 'i1',
  col: 12,
  num: '1',
  props: { title: 'Revenue', summary: 's', conf: 'inferred' },
} as Block;
const noId: Block = { type: 'list', col: 12, props: { title: 'Notes', items: ['a'] } } as Block;

describe('TopicCanvas — ask-about-this affordance', () => {
  it('renders no affordance in the Demo (no onAskBlock prop)', () => {
    const { container } = render(
      <TopicCanvas data={spec([withId, noId])} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelectorAll('.block-ask')).toHaveLength(0);
  });

  it('renders the affordance only on id-bearing blocks when onAskBlock is given', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId, noId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
      />,
    );
    expect(container.querySelectorAll('.block-ask')).toHaveLength(1);
  });

  it('marks a pinned block selected and reports the block on click', () => {
    const onAsk = vi.fn();
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={onAsk}
        selectedBlockIds={new Set(['i1'])}
      />,
    );
    expect(container.querySelector('.col-12')?.classList.contains('picked')).toBe(true);
    const btn = container.querySelector('.block-ask') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0].id).toBe('i1');
  });
});

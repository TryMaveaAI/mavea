import { render, fireEvent } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// The zoom pill rides alongside Ask/Dashboard/Cards: it only shows on a card where the action
// cluster already renders for another reason (Live-only), never on its own in the Demo.
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

describe('TopicCanvas — zoom affordance', () => {
  it('renders no zoom pill in the Demo (no Live-only callbacks)', () => {
    const { container } = render(
      <TopicCanvas data={spec([withId])} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelectorAll('.block-zoom')).toHaveLength(0);
  });

  it('renders the zoom pill once a Live-only affordance is offered on the block', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
      />,
    );
    expect(container.querySelectorAll('.block-zoom')).toHaveLength(1);
  });

  it('opens the zoomed sheet on click and closes it on the close button', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
      />,
    );
    expect(container.querySelector('.zoom-sheet')).toBeNull();
    fireEvent.click(container.querySelector('.block-zoom') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    fireEvent.click(container.querySelector('.zoom-sheet-x') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).toBeNull();
  });

  it('closes the zoomed sheet on Escape', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
      />,
    );
    fireEvent.click(container.querySelector('.block-zoom') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.zoom-sheet')).toBeNull();
  });
});

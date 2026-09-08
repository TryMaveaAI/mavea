import { render, fireEvent } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

// Magnification is a control ON the Lens stage now, not a pill of its own — two adjacent buttons
// for "show me this card alone" opened the same sheet. The way in is the Lens's own pill, gated on
// the Live-only onLens callback, so the Demo and the gallery still offer nothing.
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

describe('TopicCanvas — the way onto the Lens stage', () => {
  it('offers nothing in the Demo (no Live-only callbacks)', () => {
    const { container } = render(
      <TopicCanvas data={spec([withId])} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelectorAll('.block-lens')).toHaveLength(0);
    expect(container.querySelectorAll('.block-zoom')).toHaveLength(0);
  });

  it('offers one way in — the Lens pill — once Live wires it up', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
        onLens={() => {}}
      />,
    );
    expect(container.querySelectorAll('.block-lens')).toHaveLength(1);
    // The second pill is gone: magnification lives on the stage the first one opens.
    expect(container.querySelectorAll('.block-zoom')).toHaveLength(0);
  });

  it('opens the stage on click and closes it on the close button', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
        onLens={() => {}}
      />,
    );
    expect(container.querySelector('.zoom-sheet')).toBeNull();
    fireEvent.click(container.querySelector('.block-lens') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    fireEvent.click(container.querySelector('.zoom-sheet-x') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).toBeNull();
  });

  it('closes the stage on Escape', () => {
    const { container } = render(
      <TopicCanvas
        data={spec([withId])}
        spot={null}
        built={{}}
        onProve={() => {}}
        onAskBlock={() => {}}
        onLens={() => {}}
      />,
    );
    fireEvent.click(container.querySelector('.block-lens') as HTMLButtonElement);
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.zoom-sheet')).toBeNull();
  });
});

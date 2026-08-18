// The streamed answer's entrance is additive: a card animates in when it arrives and is never
// re-inserted by a later partial. The entrance itself is CSS (`.reveal` + @starting-style, which
// fires on ELEMENT INSERTION), so "animates exactly once" is a property of the DOM identity —
// which is what this pins. Every flicker fix in this area (the latched family gate, the latched
// section branch, append-stable rows, cell-for-cell skeletons) exists to keep it true; before
// them a mid-stream family or section flip tore the whole grid down and every card re-entered.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Block, ConversationSpec } from '../src/data/conversation';

vi.mock('../src/canvas/blocks/useBlockFamilies', () => ({ useBlockFamilies: () => true }));

import { TopicCanvas } from '../src/canvas/TopicCanvas';

function block(id: string, title: string, section?: string): Block {
  return {
    type: 'insight',
    id,
    col: 6,
    num: '1',
    section,
    props: { title, summary: 's', conf: 'inferred' },
  } as unknown as Block;
}

function spec(blocks: Block[], id = 'answer-1'): ConversationSpec {
  return {
    id,
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
  } as unknown as ConversationSpec;
}

const cell = (root: HTMLElement, id: string): Element | null =>
  root.querySelector(`[data-spot-id="${id}"]`);

describe('a streamed answer inserts each card exactly once', () => {
  afterEach(cleanup);

  it('keeps every already-painted card element across the partials that follow it', () => {
    const { container, rerender } = render(
      <TopicCanvas data={spec([block('b1', 'One')])} spot={null} built={{}} onProve={() => {}} />,
    );
    const first = cell(container, 'b1');
    expect(first).not.toBeNull();

    rerender(
      <TopicCanvas
        data={spec([block('b1', 'One'), block('b2', 'Two')])}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(cell(container, 'b1')).toBe(first);
    const second = cell(container, 'b2');

    rerender(
      <TopicCanvas
        data={spec([block('b1', 'One'), block('b2', 'Two'), block('b3', 'Three')])}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    // Both survivors are the SAME nodes: only the newcomer is an insertion, so only it animates.
    expect(cell(container, 'b1')).toBe(first);
    expect(cell(container, 'b2')).toBe(second);
    expect(cell(container, 'b3')).not.toBeNull();
  });

  it('flips to sections at most ONCE per answer, then holds card identity', () => {
    // The branch is latched sticky-true per answer (TopicCanvas): the first section-tagged block
    // may legitimately land several blocks in, so turning sections ON mid-stream is allowed once —
    // deciding purely from the first partial would drop the grouping for the whole answer. What is
    // NOT allowed is flipping back and forth: after the flip, every later partial holds identity.
    const { container, rerender } = render(
      <TopicCanvas
        data={spec([block('b1', 'One'), block('b2', 'Two', 'Concept')])}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(container.querySelector('.depth-section')).not.toBeNull();
    const first = cell(container, 'b1');

    // A later partial whose new block carries NO tag must not un-section the answer…
    rerender(
      <TopicCanvas
        data={spec([block('b1', 'One'), block('b2', 'Two', 'Concept'), block('b3', 'Three')])}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(container.querySelector('.depth-section')).not.toBeNull();
    // …and the cards already on screen are the same elements, so nothing re-enters.
    expect(cell(container, 'b1')).toBe(first);
  });

  it('leaves the fresh-answer remount to the epoch key upstream, not to itself', () => {
    // Block ids are POSITIONAL (`live-1`, `live-2`…), so a new answer landing on the same shape
    // reconciles in place here by design. The clean reveal for a genuinely new answer comes from
    // Live keying the canvas on replaceEpoch (useLiveTurn) — pinning that here would pin the wrong
    // layer, and pinning the opposite would claim a remount this component does not perform.
    const { container, rerender } = render(
      <TopicCanvas
        data={spec([block('b1', 'One')], 'answer-1')}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    const first = cell(container, 'b1');
    rerender(
      <TopicCanvas
        data={spec([block('b1', 'One')], 'answer-2')}
        spot={null}
        built={{}}
        onProve={() => {}}
      />,
    );
    expect(cell(container, 'b1')).toBe(first);
  });
});

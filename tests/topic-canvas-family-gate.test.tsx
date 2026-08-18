import { render } from '@testing-library/react';
import type { Block, ConversationSpec } from '../src/data/conversation';

// The family gate: while a needed block-family chunk is still in flight, TopicCanvas must
// not hold a BLANK grid — skeleton cards fill the tracks the real cards will take. The
// placeholder is the very same .card-grid ELEMENT the cards mount into (one div hosting
// either children), so the responsive-grid observer and the note-gutter reservation survive
// the swap and nothing re-inserts, and it announces itself as a loading state only while
// loading. Once the families land, the skeletons vanish and the real cards mount in place.
const gate = vi.hoisted(() => ({ ready: false }));
vi.mock('../src/canvas/blocks/useBlockFamilies', () => ({
  useBlockFamilies: () => gate.ready,
}));

import { TopicCanvas } from '../src/canvas/TopicCanvas';

function spec(blocks: Block[], id = 't'): ConversationSpec {
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
  };
}

const blocks: Block[] = [
  {
    type: 'insight',
    id: 'i1',
    col: 6,
    num: '1',
    props: { title: 'Revenue', summary: 's', conf: 'inferred' },
  },
  { type: 'list', col: 6, props: { title: 'Notes', items: ['a'] } },
] as Block[];

describe('TopicCanvas — family-gate skeletons', () => {
  it('shows skeletons inside the intact placeholder grid while families load', () => {
    gate.ready = false;
    const { container } = render(
      <TopicCanvas data={spec(blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    const grid = container.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    // The placeholder announces itself as a loading state…
    expect(grid!.getAttribute('role')).toBe('status');
    expect(grid!.getAttribute('aria-busy')).toBe('true');
    expect(grid!.getAttribute('aria-label')).toBeTruthy();
    // …and holds one skeleton per incoming block, no real cards yet.
    expect(grid!.querySelectorAll('.skel-card')).toHaveLength(2);
    expect(container.querySelector('.card:not(.skel-card)')).toBeNull();
  });

  it('mounts the real cards (and no skeletons) once the families are ready', () => {
    gate.ready = true;
    const { container } = render(
      <TopicCanvas data={spec(blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelectorAll('.skel-card')).toHaveLength(0);
    const grid = container.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    // The loaded grid is content, not a status region.
    expect(grid!.getAttribute('role')).toBeNull();
    expect(grid!.getAttribute('aria-busy')).toBeNull();
    expect(container.querySelectorAll('.card:not(.skel-card)').length).toBeGreaterThan(0);
  });

  it('keeps the SAME grid element across loading→loaded, cards landing in the skeleton tracks', () => {
    gate.ready = false;
    const data = spec(blocks);
    const { container, rerender } = render(
      <TopicCanvas data={data} spot={null} built={{}} onProve={() => {}} />,
    );
    const loadingGrid = container.querySelector('.card-grid')!;
    const skeletonSpans = [...loadingGrid.children].map((c) => c.className.match(/col-\d+/)?.[0]);

    gate.ready = true;
    rerender(<TopicCanvas data={data} spot={null} built={{}} onProve={() => {}} />);
    const loadedGrid = container.querySelector('.card-grid')!;
    // The element itself survives the swap — the swap must never be a remove+insert of the
    // grid (that re-fired every card's entrance and detached the resize observer's node).
    expect(loadedGrid).toBe(loadingGrid);
    expect(loadedGrid.isConnected).toBe(true);
    // The loading announcement is gone from the surviving element…
    expect(loadedGrid.getAttribute('role')).toBeNull();
    expect(loadedGrid.getAttribute('aria-busy')).toBeNull();
    // …and each real card occupies the very track its skeleton held (same count, same spans).
    const cardSpans = [...loadedGrid.children].map((c) => c.className.match(/col-\d+/)?.[0]);
    expect(cardSpans).toEqual(skeletonSpans);
    expect(loadedGrid.querySelectorAll('.skel-card')).toHaveLength(0);
  });

  it('reconciles cell-for-cell: a card lands IN its skeleton, not beside its corpse', () => {
    // The grid element surviving is not enough — while the two states were sibling subtrees, every
    // CELL was still an unmount and an insert, so the entrance replayed for the whole answer the
    // moment the chunks landed. Keying the skeleton like its card is what makes the swap in-place.
    gate.ready = false;
    const data = spec(blocks);
    const { container, rerender } = render(
      <TopicCanvas data={data} spot={null} built={{}} onProve={() => {}} />,
    );
    const cellsWhileLoading = [...container.querySelector('.card-grid')!.children];
    expect(cellsWhileLoading).toHaveLength(2);

    gate.ready = true;
    rerender(<TopicCanvas data={data} spot={null} built={{}} onProve={() => {}} />);
    const cellsWhenLoaded = [...container.querySelector('.card-grid')!.children];
    // A block WITH an id keys its own cell, so that element is reused outright.
    expect(cellsWhenLoaded[0]).toBe(cellsWhileLoading[0]);
    expect(cellsWhenLoaded[0].querySelector('.skel-card')).toBeNull();
    expect(cellsWhenLoaded[0].querySelector('.card')).not.toBeNull();
  });

  it('latches the section branch per answer — a mid-stream flip cannot re-parent the cards', () => {
    gate.ready = true;
    const tagged = blocks.map((b) => ({ ...b, section: 'Concept' })) as Block[];
    const { container, rerender } = render(
      <TopicCanvas data={spec(tagged, 'a1')} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelector('.depth-section')).not.toBeNull();

    // Same answer id, tags gone mid-stream (e.g. the tagged block dropped): the branch holds.
    rerender(<TopicCanvas data={spec(blocks, 'a1')} spot={null} built={{}} onProve={() => {}} />);
    expect(container.querySelector('.depth-section')).not.toBeNull();

    // A NEW answer re-decides: untagged blocks go back to the plain grid.
    rerender(<TopicCanvas data={spec(blocks, 'a2')} spot={null} built={{}} onProve={() => {}} />);
    expect(container.querySelector('.depth-section')).toBeNull();
  });

  it('re-attaches the resize observer when the grid element identity changes', () => {
    gate.ready = true;
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      // Two id-bearing cards make the answer focus-capable, so viewMode can swap the grid out.
      const twoIds = [blocks[0], { ...blocks[1], id: 'l1' }] as Block[];
      const data = spec(twoIds);
      const { container, rerender } = render(
        <TopicCanvas
          data={data}
          spot={null}
          built={{}}
          onProve={() => {}}
          viewMode="everything"
          onViewMode={() => {}}
        />,
      );
      expect(observed.at(-1)).toBe(container.querySelector('.card-grid'));

      // Focus mode unmounts the grid entirely…
      rerender(
        <TopicCanvas
          data={data}
          spot={null}
          built={{}}
          onProve={() => {}}
          viewMode="focus"
          onViewMode={() => {}}
        />,
      );
      expect(container.querySelector('.card-grid')).toBeNull();

      // …and returning mounts a NEW grid element: the observer must follow it, not keep
      // watching the detached node (which silently froze the column budget).
      rerender(
        <TopicCanvas
          data={data}
          spot={null}
          built={{}}
          onProve={() => {}}
          viewMode="everything"
          onViewMode={() => {}}
        />,
      );
      const revived = container.querySelector('.card-grid');
      expect(revived).not.toBeNull();
      expect(observed.at(-1)).toBe(revived);
      expect(observed.at(-1)!.isConnected).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

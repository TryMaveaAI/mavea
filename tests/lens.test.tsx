// The Lens — click a card and it comes forward, the rest of the board dimming behind it.
//
// A card is not a button: it holds links, controls and selectable prose, and when the pen is
// armed a tap on it is already an ink gesture. So most of this file is about the clicks the Lens
// must NOT take. The keyboard route is a real button in the action cluster, never the cell.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

primeExtendedRegistry(EXTENDED_REGISTRY);

function insight(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    num: '1',
    col: 6,
    props: { title, body: 'Body text here.' },
  } as unknown as Block;
}

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
  } as unknown as ConversationSpec;
}

const two = () => [insight('a', 'Alpha'), insight('b', 'Beta')];

const cellOf = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-spot-id="${id}"]`) as HTMLElement;

function mount(over: Partial<Parameters<typeof TopicCanvas>[0]> = {}) {
  const onLens = vi.fn();
  const utils = render(
    <TopicCanvas
      data={spec(two())}
      spot={null}
      built={{}}
      onProve={() => {}}
      onAskBlock={() => {}}
      viewMode="board"
      onViewMode={() => {}}
      onLens={onLens}
      {...over}
    />,
  );
  const cell = (id: string) =>
    utils.container.querySelector(`[data-spot-id="${id}"]`) as HTMLElement;
  return { ...utils, onLens, cell };
}

/** A press that begins and ends in the same place on the same cell. */
function cleanClick(el: HTMLElement, at = { clientX: 10, clientY: 10 }) {
  fireEvent.pointerDown(el, { button: 0, ...at });
  fireEvent.click(el, { button: 0, ...at });
}

describe('the Lens gesture', () => {
  it('brings the clicked card forward', () => {
    const { onLens, cell } = mount();
    cleanClick(cell('a'));
    expect(onLens).toHaveBeenCalledTimes(1);
    expect(onLens.mock.calls[0][0].id).toBe('a');
  });

  it('marks the held card and turns its button into the way back', () => {
    const { cell } = mount({ lensId: 'a', spot: 'a' });
    expect(cell('a').className).toContain('lensed');
    expect(cell('b').className).not.toContain('lensed');
    // The board's own dim/lift is the spotlight treatment — the Lens sets the class, it does
    // not invent a second one.
    expect(cell('a').className).toContain('spotlit');
    expect(cell('b').className).toContain('dimmed');
    expect(screen.getAllByRole('button', { name: /Back to the board/ }).length).toBeGreaterThan(0);
  });

  it('is offered as a real button, so it has a keyboard and screen-reader route', () => {
    const { onLens } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Look closer at Alpha/ }));
    expect(onLens).toHaveBeenCalledTimes(1);
    // The cell itself must NOT claim to be a button: it contains buttons and links.
    const { cell } = mount();
    expect(cell('a').getAttribute('role')).toBeNull();
    expect(cell('a').getAttribute('tabindex')).toBeNull();
  });
});

describe('clicks the Lens must not take', () => {
  it('ignores a click on a control inside the card', () => {
    const { onLens, container } = mount();
    const pill = container.querySelector('.block-ask') as HTMLElement;
    fireEvent.pointerDown(pill, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(pill, { button: 0, clientX: 10, clientY: 10 });
    expect(onLens).not.toHaveBeenCalled();
  });

  it('ignores a drag released on the card', () => {
    const { onLens, cell } = mount();
    fireEvent.pointerDown(cell('a'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(cell('a'), { button: 0, clientX: 60, clientY: 40 });
    expect(onLens).not.toHaveBeenCalled();
  });

  it('ignores a gesture that began on a different card', () => {
    const { onLens, cell } = mount();
    fireEvent.pointerDown(cell('b'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(cell('a'), { button: 0, clientX: 10, clientY: 10 });
    expect(onLens).not.toHaveBeenCalled();
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])(
    'leaves a %s-click to the browser',
    (mod) => {
      const { onLens, cell } = mount();
      fireEvent.pointerDown(cell('a'), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.click(cell('a'), { button: 0, clientX: 10, clientY: 10, [mod]: true });
      expect(onLens).not.toHaveBeenCalled();
    },
  );

  it('ignores the release of a text selection', () => {
    const { onLens, cell } = mount();
    const sel = { isCollapsed: false, toString: () => 'some copied words' };
    vi.spyOn(window, 'getSelection').mockReturnValue(sel as unknown as Selection);
    cleanClick(cell('a'));
    expect(onLens).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('Mavéa\u2019s notes follow the Lens', () => {
  const notes = [
    { text: 'assumes April fares hold', kind: 'caution' as const },
    { text: 'lodging moves the total, food barely does', kind: 'insight' as const },
    { text: 'Nothing here is checked against a source.', kind: 'evidence' as const },
    { text: 'What would have to be true for this to be wrong?', kind: 'question' as const },
  ];

  it('writes them beside the held card, and nowhere else', () => {
    const { container } = mount({ lensId: 'a', spot: 'a', studyAsides: { a: notes, b: notes } });
    const panels = container.querySelectorAll('.lens-notes');
    expect(panels).toHaveLength(1);
    expect(cellOf(container, 'a').contains(panels[0])).toBe(true);
    expect(container.querySelectorAll('.lens-note')).toHaveLength(4);
    expect(container.textContent).toContain('lodging moves the total');
  });

  // A div child of a grid cell inherits the cell's transform transition and drifts under the
  // spotlight choreography — the same reason MarginNoteRail is an <aside>.
  it('is an <aside>, never a div', () => {
    const { container } = mount({ lensId: 'a', spot: 'a', studyAsides: { a: notes } });
    expect(container.querySelector('.lens-notes')!.tagName).toBe('ASIDE');
  });

  it('keeps each voice distinguishable, so the evidence check reads as a receipt', () => {
    const { container } = mount({ lensId: 'a', spot: 'a', studyAsides: { a: notes } });
    expect(container.querySelector('.lens-note.is-evidence')).not.toBeNull();
    expect(container.querySelector('.lens-note.is-question')).not.toBeNull();
  });

  it('writes nothing when no card is held', () => {
    const { container } = mount({ studyAsides: { a: notes } });
    expect(container.querySelector('.lens-notes')).toBeNull();
  });
});

describe('surfaces that are not Live', () => {
  // The gallery and the clip/video stage mount TopicCanvas with four props and nothing else.
  // Every Live-only affordance is gated on the presence of a Live-only prop, so they inherit
  // none of this — the guard is the prop, not a flag someone has to remember to set.
  it('renders no Lens affordance without the Live callback', () => {
    const { container } = render(
      <TopicCanvas data={spec(two())} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.querySelector('.block-lens')).toBeNull();
    expect(container.querySelector('.lensable')).toBeNull();
  });

  it('does not react to a click on a card', () => {
    const { container } = render(
      <TopicCanvas data={spec(two())} spot={null} built={{}} onProve={() => {}} />,
    );
    const cell = container.querySelector('[data-spot-id="a"]') as HTMLElement;
    expect(() => cleanClick(cell)).not.toThrow();
    expect(cell.className).not.toContain('lensed');
  });
});

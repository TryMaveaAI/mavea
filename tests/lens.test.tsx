// The Lens — click a card and it opens on its own stage, centred over a blurred board, with
// Mavéa's notes beside it and the rest of the answer a step away.
//
// A card is not a button: it holds links, controls and selectable prose, and when the pen is
// armed a tap on it is already an ink gesture. So much of this file is about the clicks the Lens
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

const cell0 = (root: HTMLElement, id: string) =>
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
  it('opens the clicked card on its own stage', () => {
    const { onLens, cell, container } = mount();
    cleanClick(cell('a'));
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
    // The surface is told which card, so it can write that one card's notes.
    expect(onLens).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('closes on Escape, and says so', () => {
    const { container, onLens } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.zoom-sheet')).toBeNull();
    // Told on the way out too, or the surface keeps writing notes for a card nobody is reading.
    expect(onLens).toHaveBeenLastCalledWith(null);
  });

  it('is offered as a real button, so it has a keyboard and screen-reader route', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Look closer at Alpha/ }));
    expect(container.querySelector('.zoom-sheet')).not.toBeNull();
    // The cell itself must NOT claim to be a button: it contains buttons and links.
    expect(cell0(container, 'a').getAttribute('role')).toBeNull();
    expect(cell0(container, 'a').getAttribute('tabindex')).toBeNull();
  });

  it('keeps the rest of the answer within reach, and switches to the one you pick', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
    const strip = container.querySelector('.lens-strip')!;
    expect(strip.querySelectorAll('.filmstrip-entry')).toHaveLength(2);
    fireEvent.click(strip.querySelectorAll('.filmstrip-entry')[1]);
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
  });

  it('walks the board with the arrow keys, clamped rather than wrapping', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
    // Wrapping in a reading surface loses your place, so the ends hold.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
  });

  it('keeps magnification as a control ON the stage, not a second pill beside it', () => {
    const { container } = mount();
    expect(container.querySelector('.block-zoom')).toBeNull();
    cleanClick(cell0(container, 'a'));
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
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

describe('reaching the rest of the answer', () => {
  /** jsdom reports every scroll metric as 0, so overflow has to be stated for it to exist. */
  function fakeOverflow(container: HTMLElement, scrollLeft: number, clientWidth = 400) {
    const list = container.querySelector('.filmstrip-list') as HTMLElement;
    Object.defineProperty(list, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(list, 'clientWidth', { value: clientWidth, configurable: true });
    Object.defineProperty(list, 'scrollLeft', {
      value: scrollLeft,
      writable: true,
      configurable: true,
    });
    list.scrollBy = vi.fn();
    fireEvent.scroll(list);
    return list;
  }

  it('offers no control when the whole answer already fits', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    // A control that can never do anything teaches the reader to stop looking at controls.
    expect(container.querySelector('.lens-strip-nudge')).toBeNull();
    expect(container.querySelector('.lens-strip')!.getAttribute('data-edge')).toBeNull();
  });

  it('offers the way forward when there is more to the right, and scrolls on press', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    const list = fakeOverflow(container, 0);
    expect(screen.getByRole('button', { name: 'Show later cards' })).toBeTruthy();
    // Nothing behind you yet, so nothing offers to take you there.
    expect(screen.queryByRole('button', { name: 'Show earlier cards' })).toBeNull();
    // And only the side that can move is faded — dimming the first tile at rest would dim the
    // card the reader is most likely looking at.
    expect(container.querySelector('.lens-strip')!.getAttribute('data-edge')).toBe('end');
    fireEvent.click(screen.getByRole('button', { name: 'Show later cards' }));
    expect(list.scrollBy).toHaveBeenCalled();
  });

  it('offers the way back once it has been scrolled', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    fakeOverflow(container, 400);
    expect(screen.getByRole('button', { name: 'Show earlier cards' })).toBeTruthy();
    expect(container.querySelector('.lens-strip')!.getAttribute('data-edge')).toBe('both');
  });
});

describe('Mavéa\u2019s notes follow the Lens', () => {
  const notes = [
    { text: 'assumes April fares hold', kind: 'caution' as const },
    { text: 'lodging moves the total, food barely does', kind: 'insight' as const },
    { text: 'Nothing here is checked against a source.', kind: 'evidence' as const },
    { text: 'What would have to be true for this to be wrong?', kind: 'question' as const },
  ];

  it('writes them on the stage, for the card that is on it', () => {
    const { container } = mount({ studyAsides: { a: notes, b: notes } });
    cleanClick(cell0(container, 'a'));
    const panels = container.querySelectorAll('.lens-notes');
    expect(panels).toHaveLength(1);
    expect(container.querySelector('.zoom-sheet')!.contains(panels[0])).toBe(true);
    expect(container.querySelectorAll('.lens-note')).toHaveLength(4);
    expect(container.textContent).toContain('lodging moves the total');
  });

  it('is an <aside>, never a div', () => {
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    expect(container.querySelector('.lens-notes')!.tagName).toBe('ASIDE');
  });

  it('keeps each voice distinguishable, so the evidence check reads as a receipt', () => {
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    expect(container.querySelector('.lens-note.is-evidence')).not.toBeNull();
    expect(container.querySelector('.lens-note.is-question')).not.toBeNull();
  });

  it('writes nothing while the board is at rest', () => {
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

  it('does not open a stage when a card is clicked', () => {
    const { container } = render(
      <TopicCanvas data={spec(two())} spot={null} built={{}} onProve={() => {}} />,
    );
    const cell = container.querySelector('[data-spot-id="a"]') as HTMLElement;
    expect(() => cleanClick(cell)).not.toThrow();
    expect(container.querySelector('.zoom-sheet')).toBeNull();
  });
});

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

  it('shows each card in the strip as a real miniature, not an icon', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    const thumbs = container.querySelectorAll('.lens-strip .filmstrip-thumb');
    expect(thumbs).toHaveLength(2);
    // The thumbnail mounts the genuine card component (.card), scaled down inside its frame.
    for (const thumb of thumbs) {
      expect(thumb.querySelector('.filmstrip-thumb-design .card')).not.toBeNull();
    }
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

  it('leaves the arrows to a focused region in the card that pans', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    const card = document.querySelector('.zoom-sheet .card')!;
    const pan = document.createElement('div');
    pan.tabIndex = 0;
    pan.setAttribute('role', 'region');
    card.append(pan);
    Object.defineProperty(pan, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(pan, 'scrollWidth', { configurable: true, value: 650 });
    fireEvent.keyDown(pan, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
    // The zoom chords are not the pan's: Shift+1 still fits the card with the pan focused.
    expect(fireEvent.keyDown(pan, { key: '!', code: 'Digit1', shiftKey: true })).toBe(false);
    // With nothing past its edge it is not a pan, and the arrows walk the board again.
    Object.defineProperty(pan, 'scrollWidth', { configurable: true, value: 300 });
    fireEvent.keyDown(pan, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
  });

  it('walks the board from a control whose label is cut short', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    // A truncated button or link overflows its box too, and it does not pan.
    const button = document.createElement('button');
    document.querySelector('.zoom-sheet .card')!.append(button);
    Object.defineProperty(button, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(button, 'scrollWidth', { configurable: true, value: 140 });
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
  });

  it('keeps magnification as a control ON the stage, not a second pill beside it', () => {
    const { container } = mount();
    expect(container.querySelector('.block-zoom')).toBeNull();
    cleanClick(cell0(container, 'a'));
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
  });

  it('zooms out below the card\u2019s own size, so a tall card can be seen whole', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    const out = screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement;
    expect(out.disabled).toBe(false);
    fireEvent.click(out);
    expect(container.querySelector('.zoom-sheet-zoom-now')?.textContent).toBe('85%');
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

describe('magnifying the card leaves the controls alone', () => {
  it('scales only the card, and scrolls it with its notes in one box the toolbar sits outside', () => {
    const notes = [{ text: 'a note', kind: 'insight' as const }];
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    const scroll = container.querySelector('.zoom-sheet-scroll')!;
    expect(scroll.contains(container.querySelector('.zoom-sheet-body'))).toBe(true);
    expect(scroll.contains(container.querySelector('.zoom-sheet-toolbar'))).toBe(false);
    // One scroll for the card and the notes: a second box of their own was a nested scroller.
    const aside = container.querySelector('.lens-notes')!;
    expect(scroll.contains(aside)).toBe(true);
    expect(container.querySelector('.zoom-sheet-body')!.contains(aside)).toBe(false);
    // And the zoom is applied to the body alone.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const body = container.querySelector('.zoom-sheet-body') as HTMLElement;
    expect(body.style.zoom).not.toBe('');
    expect((container.querySelector('.zoom-sheet-toolbar') as HTMLElement).style.zoom).toBe('');
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

describe('the Lens is a modal a keyboard can use', () => {
  const pill = (name: string) => screen.getByRole('button', { name: `Look closer at ${name}` });
  const openFromPill = (name: string) => {
    pill(name).focus();
    fireEvent.click(pill(name));
  };
  const closeButton = () => screen.getByRole('button', { name: 'Back to the board' });

  it('moves focus to the way out, and wraps Tab inside the stage', () => {
    const { container } = mount();
    openFromPill('Alpha');
    expect(document.activeElement).toBe(closeButton());
    const scrim = container.querySelector('.zoom-scrim')!;
    // Tab stops only: the strip is a roving group, one stop with the rest parked at -1.
    const stops = Array.from(
      scrim.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]'),
    ).filter((el) => el.tabIndex >= 0);
    stops.at(-1)!.focus();
    fireEvent.keyDown(stops.at(-1)!, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
  });

  it('puts the board out of reach while it is open, and hands it back on close', () => {
    const { container } = mount();
    openFromPill('Alpha');
    expect(cell0(container, 'a').closest('[inert]')).not.toBeNull();
    expect(container.querySelector('.zoom-scrim')!.closest('[inert]')).toBeNull();
    fireEvent.click(closeButton());
    expect(container.querySelector('[inert]')).toBeNull();
  });

  it.each([
    ['the close button', () => fireEvent.click(closeButton())],
    ['Escape', () => fireEvent.keyDown(document.activeElement!, { key: 'Escape' })],
    ['the backdrop', () => cleanClick(document.querySelector('.zoom-scrim') as HTMLElement)],
  ])('returns focus to the card it opened from when closed by %s', (_, close) => {
    const { container } = mount();
    openFromPill('Alpha');
    close();
    expect(container.querySelector('.zoom-sheet')).toBeNull();
    expect(document.activeElement).toBe(pill('Alpha'));
  });

  it('returns focus to the card it stepped to, not the one it started on', () => {
    mount();
    openFromPill('Alpha');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(closeButton());
    expect(document.activeElement).toBe(pill('Beta'));
  });

  it('leaves focus where it was when the Lens was opened by a click on the card', () => {
    const { container } = mount();
    (document.activeElement as HTMLElement | null)?.blur();
    cleanClick(cell0(container, 'a'));
    fireEvent.click(closeButton());
    expect(document.activeElement).toBe(document.body);
  });
});

describe('on a narrow sheet the notes fold under the card', () => {
  const notes = [
    { text: 'assumes April fares hold', kind: 'caution' as const },
    { text: 'lodging moves the total', kind: 'insight' as const },
  ];
  // jsdom lays nothing out, so the sheet reports a phone's width.
  const sheetWidth = (w: number) =>
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('zoom-sheet') ? w : 0;
    });

  it('turns the eyebrow into a fold the reader can close and open again', () => {
    const spy = sheetWidth(358);
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    const fold = screen.getByRole('button', { name: /Mavéa’s notes/ });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.lens-note')).toHaveLength(2);
    fireEvent.click(fold);
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('.lens-note')).toHaveLength(0);
    // Folded, it still says how much is there.
    expect(fold.textContent).toContain('2');
    fireEvent.click(fold);
    expect(container.querySelectorAll('.lens-note')).toHaveLength(2);
    spy.mockRestore();
  });

  it('leaves a wide sheet’s notes open, with no fold to press', () => {
    const spy = sheetWidth(1120);
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    expect(screen.queryByRole('button', { name: /Mavéa’s notes/ })).toBeNull();
    expect(container.querySelectorAll('.lens-note')).toHaveLength(2);
    spy.mockRestore();
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

describe('the stage while a narration spotlights another card', () => {
  it('shows the staged card at full strength, not dimmed by the board', () => {
    const { container, cell } = mount({ spot: 'b' });
    cleanClick(cell('a'));
    const staged = container.querySelector('.zoom-sheet .card');
    expect(staged).not.toBeNull();
    expect(staged?.classList.contains('dimmed')).toBe(false);
    // The board behind it still reads the narration's spotlight.
    expect(cell('a').querySelector('.card')?.classList.contains('dimmed')).toBe(true);
  });
});

describe('stepping through the answer from the stage', () => {
  // The strip goes on a short window, and arrow keys alone are no way at all for a reader who
  // does not know they exist — so the toolbar always carries a stepper that says where you are.
  it('says which card of how many, and steps without leaving the stage', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    expect(container.querySelector('.zoom-sheet-step-at')?.textContent).toBe('1 of 2');
    const prev = screen.getByRole('button', { name: 'Previous card' });
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
    expect(container.querySelector('.zoom-sheet-step-at')?.textContent).toBe('2 of 2');
    const next = screen.getByRole('button', { name: 'Next card' });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy();
  });

  it('keeps focus on Next when it reaches the last card, and announces where it is', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    const next = screen.getByRole('button', { name: 'Next card' }) as HTMLButtonElement;
    next.focus();
    fireEvent.click(next);
    // Still a focusable button at the end — a `disabled` one would have dropped focus to <body>.
    expect(next.disabled).toBe(false);
    expect(document.activeElement).toBe(next);
    // A press at the end is a no-op, not a wrap.
    fireEvent.click(next);
    expect(screen.getByRole('dialog', { name: 'Beta' })).toBeTruthy();
    expect(container.querySelector('.zoom-sheet-step-at')?.getAttribute('aria-live')).toBe(
      'polite',
    );
  });

  it('shows no stepper for an answer of one card', () => {
    const { container } = mount({ data: spec([insight('a', 'Alpha')]) });
    cleanClick(cell0(container, 'a'));
    expect(screen.queryByRole('button', { name: 'Next card' })).toBeNull();
  });
});

describe('fit and actual size', () => {
  const bodyZoom = (root: HTMLElement) =>
    (root.querySelector('.zoom-sheet-body') as HTMLElement).style.zoom;

  it('leaves the browser its own zoom keys, and any chord with another modifier', () => {
    const { container } = mount();
    cleanClick(cell0(container, 'a'));
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(fireEvent.keyDown(window, { key: '0', code: 'Digit0', ...mod })).toBe(true);
      expect(fireEvent.keyDown(window, { key: '0', code: 'Digit0', shiftKey: true, ...mod })).toBe(
        true,
      );
    }
    expect(fireEvent.keyDown(window, { key: '9', code: 'Digit9', metaKey: true })).toBe(true);
    expect(bodyZoom(container)).toBe('');
  });

  it('leaves Shift+0 alone while the Lens is closed, and to a field being typed in', () => {
    const { container } = mount();
    const chord = { key: ')', code: 'Digit0', shiftKey: true };
    expect(fireEvent.keyDown(window, chord)).toBe(true);
    cleanClick(cell0(container, 'a'));
    const input = document.createElement('input');
    container.appendChild(input);
    expect(fireEvent.keyDown(input, chord)).toBe(true);
    expect(bodyZoom(container)).toBe('');
  });

  it('puts the notes straight after the card, not at the foot of the window', () => {
    const notes = [{ text: 'a note', kind: 'insight' as const }];
    const { container } = mount({ studyAsides: { a: notes } });
    cleanClick(cell0(container, 'a'));
    const body = container.querySelector('.zoom-sheet-body');
    expect(body?.nextElementSibling?.classList.contains('lens-notes')).toBe(true);
  });
});

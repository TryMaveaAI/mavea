import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CanvasTakeover } from '../src/canvas/focus/CanvasView';
import type { ConversationSpec, Block } from '../src/data/conversation';

// The Canvas view is a full-screen takeover: it portals to <body> (so no column or transform can
// clip the board), locks the page scroll behind it, and always offers one obvious way back —
// the header close and Escape. These pin that contract.

const blocks: Block[] = [
  { type: 'insight', id: 'a', num: '1', col: 6, props: { title: 'Alpha', summary: 'First card.' } },
  { type: 'insight', id: 'b', num: '2', col: 6, props: { title: 'Beta', summary: 'Second card.' } },
];

const data = {
  id: 'spec',
  title: 'A Board-Shaped Answer',
  sub: '',
  opener: '',
  context: [],
  blocks,
  topic: 'demo',
} as unknown as ConversationSpec;

function renderTakeover(onExit = vi.fn()) {
  const utils = render(
    <CanvasTakeover
      data={data}
      blocks={blocks}
      spot={null}
      renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
      onExit={onExit}
    />,
  );
  return { onExit, ...utils };
}

describe('CanvasTakeover', () => {
  it('renders a full-screen dialog portalled to <body>, titled by the answer', () => {
    renderTakeover();
    const dialog = screen.getByRole('dialog', { name: /A Board-Shaped Answer — canvas/i });
    // Portalled out of the React root: the dialog's parent is the body itself.
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('.cv-viewport')).toBeTruthy();
  });

  it('locks page scroll while open and restores it on close', () => {
    const { unmount } = renderTakeover();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from the header button and from Escape on the board', () => {
    const { onExit } = renderTakeover();
    fireEvent.click(screen.getByRole('button', { name: /back to answer/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
    const viewport = document.body.querySelector('.cv-viewport') as HTMLElement;
    fireEvent.keyDown(viewport, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("a node's Ask pins the block WITHOUT closing the board — asking about several things in a row used to force a full exit for each one", () => {
    const onExit = vi.fn();
    const onAskBlock = vi.fn();
    render(
      <CanvasTakeover
        data={data}
        blocks={blocks}
        spot={null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        onAskBlock={onAskBlock}
        onExit={onExit}
      />,
    );
    const ask = document.body.querySelector('.cv-node-ask') as HTMLElement;
    expect(ask).toBeTruthy();
    fireEvent.click(ask);
    expect(onAskBlock).toHaveBeenCalledTimes(1);
    expect(onAskBlock.mock.calls[0][0].id).toBe('a');
    expect(onExit).not.toHaveBeenCalled();
  });

  it('shows a selection count and turns the close button into the "ask about them" action once something is pinned', () => {
    const onExit = vi.fn();
    render(
      <CanvasTakeover
        data={data}
        blocks={blocks}
        spot={null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        onAskBlock={() => {}}
        onExit={onExit}
        selectedBlockIds={new Set(['a', 'b'])}
      />,
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /ask about 2/i });
    fireEvent.click(cta);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reads as a neutral "back to answer" when nothing is pinned', () => {
    renderTakeover();
    expect(screen.queryByText(/selected/i)).toBeNull();
    expect(screen.getByRole('button', { name: /back to answer/i })).toBeInTheDocument();
  });
});

// It claims aria-modal, so it owes a real trap: keyboard and screen-reader users must not be able
// to Tab out into the page behind it, and the advertised `esc` must work wherever focus sits —
// not only while the board itself holds it.
describe('CanvasTakeover focus', () => {
  it('opens with the board focused so arrows and Home work immediately', () => {
    renderTakeover();
    expect(document.activeElement).toBe(document.body.querySelector('.cv-viewport'));
  });

  it('closes on Escape from the header, where the shortcut is advertised', () => {
    const { onExit } = renderTakeover();
    const close = screen.getByRole('button', { name: /back to answer/i });
    close.focus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('cycles Tab back to the top instead of letting focus escape behind the board', () => {
    renderTakeover();
    const dialog = screen.getByRole('dialog');
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])'),
    );
    const last = stops[stops.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
  });
});

// Camera contract. Late content (a map tile, a lazy image) keeps re-measuring for seconds and every
// re-measure changes the world box — the board must settle itself only while the user hasn't aimed
// it, and a non-primary press must never latch a pan the context menu will swallow the release of.
describe('CanvasTakeover camera', () => {
  const rect = (w: number, h: number): DOMRect =>
    ({
      left: 0,
      top: 0,
      width: w,
      height: h,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON: () => '',
    }) as DOMRect;
  const ZERO = rect(0, 0);
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  let nodeHeight = 300;

  beforeEach(() => {
    nodeHeight = 300;
    // jsdom lays nothing out: without a viewport box every fit no-ops, and without a node height
    // the world box never changes, so neither half of this contract would be observable.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.classList.contains('cv-viewport') ? rect(900, 600) : ZERO;
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('cv-node') ? nodeHeight : 0;
      },
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    }
  });

  const transform = (): string =>
    (document.body.querySelector('.cv-world') as HTMLElement).style.transform;
  /** Let the open-fit's double rAF and its 360ms re-frame run out. */
  const settle = (): void => {
    act(() => {
      vi.advanceTimersByTime(500);
    });
  };

  function open() {
    const utils = render(
      <CanvasTakeover
        data={data}
        blocks={blocks}
        spot={null}
        renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
        onExit={vi.fn()}
      />,
    );
    settle();
    return utils;
  }
  /** Late content settles taller — a fresh blocks array re-runs the measure pass. */
  function grow(rerender: (ui: React.ReactElement) => void) {
    nodeHeight = 700;
    act(() =>
      rerender(
        <CanvasTakeover
          data={data}
          blocks={[...blocks]}
          spot={null}
          renderBlock={(b) => <div>{(b.props as { title?: string }).title}</div>}
          onExit={vi.fn()}
        />,
      ),
    );
    settle();
  }

  it('re-fits on a late re-measure while the camera is untouched', () => {
    const { rerender } = open();
    const opened = transform();
    expect(opened).not.toBe('');
    grow(rerender);
    expect(transform()).not.toBe(opened);
  });

  it('holds the camera where the user put it once they have navigated', () => {
    const { rerender } = open();
    const viewport = document.body.querySelector('.cv-viewport') as HTMLElement;
    fireEvent.keyDown(viewport, { key: 'ArrowRight' }); // fly to the next card
    const aimed = transform();
    expect(aimed).not.toBe('');
    grow(rerender);
    expect(transform()).toBe(aimed);
  });

  it('only the primary button pans — a right-click would stick, its pointerup eaten by the menu', () => {
    open();
    const viewport = document.body.querySelector('.cv-viewport') as HTMLElement;
    viewport.setPointerCapture = vi.fn();
    fireEvent.pointerDown(viewport, { button: 2, pointerId: 1 });
    expect(viewport.classList.contains('is-panning')).toBe(false);
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 1 });
    expect(viewport.classList.contains('is-panning')).toBe(true);
  });
});

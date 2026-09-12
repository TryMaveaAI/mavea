// scripted-lock.test.tsx — a walkthrough or a demo replay is a PERFORMANCE, and while one plays
// the visitor is the audience: the run's transport is the only control on the surface. These lock
// down that rule end to end — the inert sweep over every region but the run's chrome (portals and
// mid-run overlays included), the single keyboard gate that swallows ⌘K and the four app-wide
// Escapes, the one chapter that deliberately hands the surface back, and the guarantee the whole
// design rests on: `inert` stops the VISITOR's input, never the script's own choreography.
import { useRef, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scrollerAt, useScriptedLock, wheelPixels } from '../src/tour/useScriptedLock';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';
import { LiveApp } from '../src/live/LiveApp';

const transport = {
  next: vi.fn(),
  prev: vi.fn(),
  toggle: vi.fn(),
  skip: vi.fn(),
};

/** The shape LiveApp actually renders: the run's chrome and the app's regions as siblings under
 *  the root, which is what lets one sweep of the root's children separate them. */
function Harness({
  running,
  handsBack = false,
  layered = false,
  withPanel = true,
}: {
  running: boolean;
  handsBack?: boolean;
  layered?: boolean;
  withPanel?: boolean;
}): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  const layeredRef = useRef(layered);
  layeredRef.current = layered;
  useScriptedLock({ root, running, handsBack, transport, layered: layeredRef });
  return (
    <div className="mavea-app" ref={root}>
      <div className="tourx">
        {withPanel && (
          <div className="tourx-panel" tabIndex={-1}>
            <button type="button">Next chapter</button>
          </div>
        )}
      </div>
      <div className="canvas-stage">
        <div className="canvas-scroll">
          <button type="button" className="card">
            A card
          </button>
        </div>
      </div>
      <div className="live-dock">
        <input className="composer-input" />
      </div>
    </div>
  );
}

const inertOn = (sel: string): boolean => !!document.querySelector(sel)?.hasAttribute('inert');

/** The Start control appears only once the driver's corpus import resolves. That is quick on its
 *  own and not quick under a parallel suite, so the wait is named rather than left on findBy's
 *  one-second default. */
const findStart = (name: RegExp | string): Promise<HTMLElement> =>
  screen.findByRole('button', { name }, { timeout: 8000 });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the scripted lock — the surface', () => {
  it('puts every region but the run’s chrome out of reach while it performs', () => {
    render(<Harness running />);
    expect(inertOn('.canvas-stage')).toBe(true);
    expect(inertOn('.live-dock')).toBe(true);
    expect(inertOn('.tourx')).toBe(false);
    expect(document.querySelector('.composer-input')?.closest('[inert]')).not.toBeNull();
    expect(document.querySelector('.card')?.closest('[inert]')).not.toBeNull();
    expect(document.querySelector('.tourx-panel')?.closest('[inert]')).toBeNull();
  });

  it('hands the surface back before the run starts and again once it is done', () => {
    const { rerender } = render(<Harness running={false} />);
    expect(inertOn('.canvas-stage')).toBe(false);
    rerender(<Harness running />);
    expect(inertOn('.canvas-stage')).toBe(true);
    rerender(<Harness running={false} />);
    expect(inertOn('.canvas-stage')).toBe(false);
    expect(inertOn('.live-dock')).toBe(false);
  });

  it('follows the DOM, so an overlay a chapter opens mid-run is covered too', async () => {
    render(<Harness running />);
    const opened = document.createElement('div');
    opened.className = 'export-studio';
    act(() => {
      document.querySelector('.mavea-app')?.appendChild(opened);
    });
    await waitFor(() => expect(opened.hasAttribute('inert')).toBe(true));
  });

  it('covers what mounts outside the app root as well (a card’s portal, an anchored menu)', async () => {
    render(<Harness running />);
    const portal = document.createElement('aside');
    portal.className = 'clip-sheet';
    act(() => {
      document.body.appendChild(portal);
    });
    await waitFor(() => expect(portal.hasAttribute('inert')).toBe(true));
    portal.remove();
  });

  it('releases only what it took — a region inert for its own reasons stays that way', () => {
    const { rerender } = render(<Harness running={false} />);
    const stage = document.querySelector('.canvas-stage') as HTMLElement;
    stage.setAttribute('inert', '');
    rerender(<Harness running />);
    rerender(<Harness running={false} />);
    expect(stage.hasAttribute('inert')).toBe(true);
  });

  it('leaves nothing behind on unmount', () => {
    const { unmount, container } = render(<Harness running />);
    const stage = container.querySelector('.canvas-stage') as HTMLElement;
    unmount();
    expect(stage.hasAttribute('inert')).toBe(false);
  });
});

describe('the scripted lock — focus', () => {
  it('moves focus to the transport, since it is the only place left to act from', () => {
    const { rerender } = render(<Harness running={false} />);
    const input = document.querySelector('.composer-input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
    rerender(<Harness running />);
    expect(document.activeElement).toBe(document.querySelector('.tourx-panel'));
  });

  it('blurs a focused control even when there is no transport to catch it', () => {
    // `inert` does not blur what already has focus, so a composer focused a moment before the
    // lock engaged would keep taking keystrokes under an inert ancestor.
    const { rerender } = render(<Harness running={false} withPanel={false} />);
    const input = document.querySelector('.composer-input') as HTMLInputElement;
    input.focus();
    rerender(<Harness running withPanel={false} />);
    expect(document.activeElement).not.toBe(input);
  });
});

describe('the scripted lock — the keyboard', () => {
  /** A stand-in for the dozen window listeners underneath: ⌘K, push-to-talk, four Escapes. */
  function withAppListener(run: () => void): ReturnType<typeof vi.fn> {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    try {
      run();
    } finally {
      window.removeEventListener('keydown', heard);
    }
    return heard;
  }

  it('swallows ⌘K, so the command palette cannot open mid-run', () => {
    render(<Harness running />);
    const heard = withAppListener(() => {
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    });
    expect(heard).not.toHaveBeenCalled();
  });

  it('lets the same ⌘K through once the run is over', () => {
    render(<Harness running={false} />);
    const heard = withAppListener(() => {
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('answers the transport keys', () => {
    render(<Harness running />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(transport.next).toHaveBeenCalledTimes(1);
    expect(transport.prev).toHaveBeenCalledTimes(1);
    expect(transport.toggle).toHaveBeenCalledTimes(1);
  });

  it('swallows ⌘K from the transport too — which is exactly where the lock puts focus', () => {
    // Exempting the run's own chrome from the gate looked harmless and was the whole hole: the
    // lock focuses the panel, so every visitor keystroke is aimed at the chrome.
    render(<Harness running />);
    const panel = document.querySelector('.tourx-panel') as HTMLElement;
    const heard = withAppListener(() => {
      fireEvent.keyDown(panel, { key: 'k', metaKey: true });
    });
    expect(heard).not.toHaveBeenCalled();
  });

  it('never cancels the default, so Space still presses the focused transport button', () => {
    render(<Harness running />);
    const btn = screen.getByRole('button', { name: 'Next chapter' });
    const space = fireEvent.keyDown(btn, { key: ' ' });
    // A button's Space→click is browser behaviour, not a listener: leaving the default alone is
    // what keeps the transport usable under a gate that stops every listener beneath it.
    expect(space).toBe(true);
    expect(transport.toggle).not.toHaveBeenCalled();
  });

  it('gives Escape to the run — leaving is the one thing the key means while a script plays', () => {
    render(<Harness running />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(transport.skip).toHaveBeenCalledTimes(1);
  });

  it('answers Escape before Start and after Done, where the cards are the only thing on screen', () => {
    // The intro card is an aria-modal dialog and the end card follows it; Escape has always meant
    // "leave" there, and the gate that owns the key for the run owns it for those two moments too.
    const { rerender } = render(<Harness running={false} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    rerender(<Harness running />);
    rerender(<Harness running={false} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(transport.skip).toHaveBeenCalledTimes(2);
  });

  it('costs nothing under an overlay the chapter opened, rather than ending the whole run', () => {
    // A visitor reaching to close the palette the script just opened is not asking to leave the
    // walkthrough. The overlay is inert and cannot answer the key itself, so the key does nothing
    // — and the run's transport, exit pill included, is still on screen either way.
    render(<Harness running layered />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(transport.skip).not.toHaveBeenCalled();
  });

  it('still refuses to STEP under an overlay — one ← must not swap the answer being exported', () => {
    render(<Harness running layered />);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(transport.prev).not.toHaveBeenCalled();
  });
});

describe('a chapter that hands the surface back', () => {
  it('lifts the lock entirely while keeping the transport answering', () => {
    render(<Harness running handsBack />);
    expect(inertOn('.canvas-stage')).toBe(false);
    expect(inertOn('.live-dock')).toBe(false);
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    window.removeEventListener('keydown', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(transport.next).toHaveBeenCalledTimes(1);
  });

  it('is declared by the chapter, not by a name LiveApp knows', () => {
    // Inviting a press is a property of the plan. The try-it chapter is the one that does it.
    const invite = ALL_CHAPTERS.filter((c) => c.handsBack);
    expect(invite.map((c) => c.id)).toEqual(['yours']);
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(live).toMatch(/handsBack: scriptHandsBack/);
    expect(live).not.toMatch(/=== 'yours'/);
  });
});

describe('the lock stops the visitor, not the script', () => {
  it('a synthetic click inside an inert region still lands (share, export, the palette rows)', () => {
    render(<Harness running />);
    const card = document.querySelector('.card') as HTMLButtonElement;
    const pressed = vi.fn();
    card.addEventListener('click', pressed);
    card.click();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('a class the choreography toggles inside an inert region still applies (keep-going)', () => {
    render(<Harness running />);
    const card = document.querySelector('.card') as HTMLElement;
    card.classList.add('kg-tour-press');
    expect(card.classList.contains('kg-tour-press')).toBe(true);
    expect(card.closest('[inert]')).not.toBeNull();
  });
});

describe('the lock’s contract with everything that drives the surface', () => {
  const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('leaves the replay’s transport on screen on a beat that covers it', () => {
    // A covered beat hides the banner (it lay across the overlay's own title), and once the lock
    // made that overlay inert the transport became the only reachable control on the surface —
    // hiding it too left a phone with no door at all, since Escape is not a gesture there.
    const css = read('src/demo/demo.css');
    expect(css).toMatch(/\.demox\[data-covered\] > \*:not\(\.demox-panel\) \{/);
    expect(css).not.toMatch(/\.demox\[data-covered\] > \* \{/);
  });

  it('lets the capture script press mid-replay the way the choreography does', () => {
    // gen:media walks real menus after Start (Share → Export → Document). Those controls are inert
    // for the visitor, so an actionability-checked click waits out its timeout and the shot is lost.
    const capture = read('scripts/capture-media.mts');
    expect(capture).toMatch(/dispatchEvent\('click'\)/);
    expect(capture).not.toMatch(/\.click\(\{ timeout/);
  });
});

describe('wheelPixels', () => {
  it('normalises a mouse wheel’s lines and pages into pixels', () => {
    const scroller = { clientHeight: 800 } as HTMLElement;
    expect(wheelPixels({ deltaMode: 0, deltaY: 42 }, scroller)).toBe(42);
    expect(wheelPixels({ deltaMode: 1, deltaY: 3 }, scroller)).toBe(48);
    expect(wheelPixels({ deltaMode: 2, deltaY: 1 }, scroller)).toBe(800);
  });
});

// jsdom lays nothing out, so every box and overflow here is declared by hand: a scroller is a
// rect plus a scrollHeight taller than its clientHeight.
function box(el: HTMLElement, rect: [number, number, number, number], overflow = true): void {
  const [left, top, width, height] = rect;
  el.getBoundingClientRect = () =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    value: overflow ? height * 4 : height,
    configurable: true,
  });
}

/** The desk over the board, both scrolling: the front card's face sits inside the board's box. */
function desk(): { app: HTMLElement; board: HTMLElement; face: HTMLElement; chat: HTMLElement } {
  const app = document.createElement('div');
  app.innerHTML =
    '<div class="canvas-scroll"></div>' +
    '<div class="study-card is-front"><div class="study-card-face"></div></div>' +
    '<div class="rail-chat"></div>';
  document.body.appendChild(app);
  const board = app.querySelector<HTMLElement>('.canvas-scroll')!;
  const face = app.querySelector<HTMLElement>('.study-card-face')!;
  const chat = app.querySelector<HTMLElement>('.rail-chat')!;
  box(board, [0, 0, 1000, 800]);
  box(face, [200, 100, 500, 600]);
  box(chat, [800, 0, 200, 800]);
  return { app, board, face, chat };
}

describe('scrollerAt — the scroller under a locked gesture', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('picks the front card over the board it covers, and the board beside it', () => {
    const { app, board, face, chat } = desk();
    expect(scrollerAt(app, 400, 300)).toBe(face);
    expect(scrollerAt(app, 50, 300)).toBe(board);
    expect(scrollerAt(app, 900, 300)).toBe(chat);
  });

  it('skips a candidate that has nothing to scroll', () => {
    const { app, board, face } = desk();
    box(face, [200, 100, 500, 600], false);
    expect(scrollerAt(app, 400, 300)).toBe(board);
  });

  it('falls back to the board off every candidate, and to nothing without one', () => {
    const { app, board } = desk();
    expect(scrollerAt(app, 2000, 2000)).toBe(board);
    board.remove();
    expect(scrollerAt(app, 2000, 2000)).toBeNull();
  });
});

describe('the scripted lock — scrolling by hand', () => {
  // The harness's board and a front card over it, boxed like the desk above.
  function mountDesk(): { board: HTMLElement; face: HTMLElement } {
    const board = document.querySelector<HTMLElement>('.canvas-scroll')!;
    const card = document.createElement('div');
    card.className = 'study-card is-front';
    card.innerHTML = '<div class="study-card-face"></div>';
    board.parentElement!.appendChild(card);
    const face = card.querySelector<HTMLElement>('.study-card-face')!;
    box(board, [0, 0, 1000, 800]);
    box(face, [200, 100, 500, 600]);
    return { board, face };
  }

  it('a wheel over the front card scrolls the card, not the board behind it', () => {
    render(<Harness running />);
    const { board, face } = mountDesk();
    fireEvent.wheel(window, { clientX: 400, clientY: 300, deltaY: 40, deltaMode: 0 });
    expect(face.scrollTop).toBe(40);
    expect(board.scrollTop).toBe(0);
    fireEvent.wheel(window, { clientX: 50, clientY: 300, deltaY: 40, deltaMode: 0 });
    expect(board.scrollTop).toBe(40);
  });

  it('a finger dragged up over the card scrolls it, and the drag keeps the scroller it started on', () => {
    render(<Harness running />);
    const { board, face } = mountDesk();
    fireEvent.touchStart(window, { touches: [{ clientX: 400, clientY: 500 }] });
    fireEvent.touchMove(window, { touches: [{ clientX: 400, clientY: 440 }] });
    expect(face.scrollTop).toBe(60);
    // Past the card's edge now, but the drag began on the card, so the card keeps moving.
    fireEvent.touchMove(window, { touches: [{ clientX: 50, clientY: 400 }] });
    expect(face.scrollTop).toBe(100);
    expect(board.scrollTop).toBe(0);
    fireEvent.touchEnd(window, { touches: [] });
    fireEvent.touchMove(window, { touches: [{ clientX: 50, clientY: 300 }] });
    expect(face.scrollTop).toBe(100);
  });

  it('a pinch (two fingers) is left to the browser', () => {
    render(<Harness running />);
    const { face } = mountDesk();
    fireEvent.touchStart(window, {
      touches: [
        { clientX: 400, clientY: 500 },
        { clientX: 450, clientY: 520 },
      ],
    });
    fireEvent.touchMove(window, {
      touches: [
        { clientX: 400, clientY: 440 },
        { clientX: 450, clientY: 460 },
      ],
    });
    expect(face.scrollTop).toBe(0);
  });

  it('forwards nothing once the run is over', () => {
    const { rerender } = render(<Harness running />);
    const { face } = mountDesk();
    rerender(<Harness running={false} />);
    fireEvent.wheel(window, { clientX: 400, clientY: 300, deltaY: 40, deltaMode: 0 });
    fireEvent.touchStart(window, { touches: [{ clientX: 400, clientY: 500 }] });
    fireEvent.touchMove(window, { touches: [{ clientX: 400, clientY: 440 }] });
    expect(face.scrollTop).toBe(0);
  });
});

describe('LiveApp — the lock on the real surface', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('no network in test'))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '';
  });

  it('the walkthrough locks the surface from Start until it is done', async () => {
    window.location.hash = '#/live?tour=1';
    const { container } = render(<LiveApp />);
    const app = container.querySelector('.mavea-app') as HTMLElement;
    // The welcome card is a choice the visitor genuinely owns — nothing is locked yet.
    expect(app.hasAttribute('data-scripted-run')).toBe(false);

    const start = await findStart('Start the tour');
    fireEvent.click(start);
    expect(app.getAttribute('data-scripted-run')).toBe('locked');
    expect(container.querySelector('.live-dock')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.tourx')?.hasAttribute('inert')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(app.hasAttribute('data-scripted-run')).toBe(false);
    expect(container.querySelector('.live-dock')?.hasAttribute('inert')).toBe(false);
  });

  it('the replay inherits the identical lock', async () => {
    window.location.hash = '#/live?demo=pm';
    const { container } = render(<LiveApp />);
    const app = container.querySelector('.mavea-app') as HTMLElement;
    expect(app.hasAttribute('data-scripted-run')).toBe(false);
    const start = await findStart(/Start demo/);
    fireEvent.click(start);
    expect(app.getAttribute('data-scripted-run')).toBe('locked');
    expect(container.querySelector('.live-dock')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.demox')?.hasAttribute('inert')).toBe(false);
  });

  it('Escape dismisses the welcome card, which an aria-modal dialog owes the keyboard', async () => {
    window.location.hash = '#/live?tour=1';
    const { container } = render(<LiveApp />);
    await findStart('Start the tour');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('.tourx-welcome')).toBeNull());
  });

  it('⌘K does not open the command palette while the walkthrough plays', async () => {
    window.location.hash = '#/live?tour=1';
    const { container } = render(<LiveApp />);
    fireEvent.click(await findStart('Start the tour'));
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(container.querySelector('.cmdk-panel')).toBeNull();
  });
});

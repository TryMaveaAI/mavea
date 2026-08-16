// The morph stage's promise is identity: the same DOM element that was a card in the causal web
// becomes an entry on the timeline and a mark on the chart, so the reader watches ONE thing move
// rather than three views cross-fade. These tests pin that (element references survive a
// representation flip while the face and the position change), the honesty band a representation
// falls back to, and the lifecycle around the chrome hand-off — at most one exiting layer, stale
// timers that no-op, and a clean teardown.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claim } from '../src/canvas/focus/stepDriver';
import { MorphStage } from '../src/canvas/spatial/morph/MorphStage';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { REPRESENTATIONS, useMorphStage } from '../src/canvas/spatial/morph/useMorphStage';
import type { Representation } from '../src/canvas/spatial/morph/types';
import { WORLD_SEED } from '../src/live/world/seed';

const WORLD = worldToMorph(WORLD_SEED);
/** The seed's one node with a breakdown, and a measured series to plot. */
const PARENT = 'mortgage-volume';
const DRIVER_ID = 'morph-stage-test';

function Harness(): React.ReactNode {
  const stage = useMorphStage({ world: WORLD, driverId: DRIVER_ID });
  return (
    <>
      {(['graph', 'timeline', 'chart'] as Representation[]).map((rep) => (
        <button key={rep} type="button" data-testid={`to-${rep}`} onClick={() => stage.setRep(rep)}>
          {rep}
        </button>
      ))}
      {/* A retire from a morph that has already been superseded — token -1 is never live. */}
      <button type="button" data-testid="stale-settle" onClick={() => stage.settleExit(-1)}>
        stale
      </button>
      <button type="button" data-testid="expand" onClick={() => stage.toggleExpand(PARENT)}>
        expand
      </button>
      {/* A handler, because half of what the stage decides — what is a button, what can be
          tabbed to — only exists once the host says nodes are activatable. */}
      <MorphStage stage={stage} world={WORLD} onNodeClick={() => {}} />
    </>
  );
}

const flip = (container: HTMLElement, rep: Representation): void => {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="to-${rep}"]`)!;
  act(() => button.click());
};

afterEach(cleanup);

describe('MorphStage', () => {
  it('renders every world node, whatever the representation', () => {
    const { container } = render(<Harness />);
    for (const node of WORLD.nodes) {
      expect(container.querySelector(`[data-id="${node.id}"]`), node.id).not.toBeNull();
    }
    expect(container.querySelectorAll('.mv-node')).toHaveLength(WORLD.nodes.length);
  });

  it('publishes what each node IS, so the sheet can tell one card from another', () => {
    // Without these the whole world paints as one repeated card: role, evidence tier, sphere and
    // "has a history" are all in the data and none of them used to reach the DOM.
    const { container } = render(<Harness />);
    const outcome = container.querySelector<HTMLElement>('[data-id="credit-crisis"]')!;
    expect(outcome.dataset.role).toBe('outcome');
    expect(outcome.dataset.domain).toBe('economy');

    const root = container.querySelector<HTMLElement>('[data-id="cheap-mortgages"]')!;
    expect(root.dataset.role).toBe('root');
    expect(root.dataset.tier).toBe('T2');
    expect(root.dataset.domain).toBe('policy');

    // The series flag marks the cards that have something to plot — and only those.
    const withSeries = container.querySelector<HTMLElement>('[data-id="home-prices"]')!;
    expect(withSeries.dataset.series).toBe('');
    expect(root.dataset.series).toBeUndefined();
    expect(root.querySelector('.mv-domain')).not.toBeNull();
  });

  it('leaves the mark off a node whose sphere nobody named', () => {
    const bare = {
      nodes: [
        { id: 'a', label: 'A', role: 'root' as const },
        { id: 'b', label: 'B', role: 'outcome' as const },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b' }],
      outcomeId: 'b',
    };
    function Bare(): React.ReactNode {
      const stage = useMorphStage({ world: bare, driverId: 'morph-bare-test' });
      return <MorphStage stage={stage} world={bare} />;
    }
    const { container } = render(<Bare />);
    const a = container.querySelector<HTMLElement>('[data-id="a"]')!;
    expect(a.dataset.domain).toBeUndefined();
    expect(a.querySelector('.mv-domain')).toBeNull();
  });

  it('keeps the same elements across a morph while the face and position change', () => {
    const { container } = render(<Harness />);
    const id = 'mortgage-volume';
    const before = container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    expect(before.dataset.face).toBe('card');
    const beforeX = before.style.getPropertyValue('--nx');

    flip(container, 'chart');

    const after = container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    expect(after).toBe(before); // identity — the node moved, it was not replaced
    expect(after.dataset.face).toBe('mark');
    expect(after.style.getPropertyValue('--nx')).not.toBe(beforeX);
    expect(container.querySelectorAll('.mv-node')).toHaveLength(WORLD.nodes.length);
  });

  it('shelves what the chart cannot place, and says so', () => {
    const { container } = render(<Harness />);
    flip(container, 'chart');

    const shelved = container.querySelectorAll<HTMLElement>('.mv-node[data-shelved]');
    expect(shelved.length).toBeGreaterThan(0);
    for (const node of shelved) expect(node.dataset.face).toBe('entry');
    // A node WITH a measured series is a mark, not shelf fodder.
    expect(
      container.querySelector<HTMLElement>('[data-id="mortgage-volume"]')!.dataset.shelved,
    ).toBeUndefined();
    expect(container.querySelector('.mv-shelf-label')?.textContent).toContain('held aside');
  });

  it('never keeps more than one exiting chrome layer, and ignores a stale retire', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness />);
      flip(container, 'timeline');
      flip(container, 'chart');
      expect(container.querySelectorAll('.mv-chrome[data-exiting]')).toHaveLength(1);

      // A retire left over from the abandoned first morph must not clear the live layer.
      act(() =>
        container.querySelector<HTMLButtonElement>('[data-testid="stale-settle"]')!.click(),
      );
      expect(container.querySelectorAll('.mv-chrome[data-exiting]')).toHaveLength(1);

      // No transitionend ever arrives (an interrupted transition often skips it) — the fallback
      // timer is what finally retires the layer.
      act(() => vi.advanceTimersByTime(1400));
      expect(container.querySelectorAll('.mv-chrome[data-exiting]')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retires the exiting layer on transitionend, cancelling the fallback', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness />);
      flip(container, 'timeline');
      const layer = container.querySelector('.mv-chrome[data-exiting]')!;
      // Two fallbacks are armed by a morph: the chrome layer's, and the flight's. Only the
      // chrome's belongs to this transitionend — the world is still mid-morph, so its own net
      // must stay out.
      const armed = vi.getTimerCount();

      act(() => {
        fireEvent.transitionEnd(layer);
      });
      expect(container.querySelectorAll('.mv-chrome[data-exiting]')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(armed - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('frames the whole family when a breakdown opens, so none of it lands off-stage', () => {
    // The camera used to zoom a fixed step in on the parent's centre — which crops the very parts
    // the reader just asked to see, because unfolding widens the world at the same moment.
    const VIEWPORT = { w: 1000, h: 700 };
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (!this.classList.contains('mv-viewport')) return original.call(this);
      const box = { x: 0, y: 0, left: 0, top: 0, right: VIEWPORT.w, bottom: VIEWPORT.h };
      return { ...box, width: VIEWPORT.w, height: VIEWPORT.h, toJSON: () => ({}) } as DOMRect;
    };
    try {
      const { container } = render(<Harness />);
      act(() => container.querySelector<HTMLButtonElement>('[data-testid="expand"]')!.click());

      const world = container.querySelector<HTMLElement>('.mv-world')!;
      // Read the camera the way the DOM does: translate(x, y) scale(s).
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(
        world.style.transform,
      );
      expect(m, `unreadable camera transform: ${world.style.transform}`).not.toBeNull();
      const [camX, camY, scale] = [Number(m![1]), Number(m![2]), Number(m![3])];

      const onScreen = (id: string) => {
        const el = container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
        const nx = parseFloat(el.style.getPropertyValue('--nx'));
        const ny = parseFloat(el.style.getPropertyValue('--ny'));
        return { x: camX + nx * scale, y: camY + ny * scale };
      };

      for (const id of [
        PARENT,
        ...WORLD.nodes.filter((n) => n.parentId === PARENT).map((n) => n.id),
      ]) {
        const { x, y } = onScreen(id);
        expect(x, `${id} is off-stage horizontally`).toBeGreaterThanOrEqual(0);
        expect(x, `${id} is off-stage horizontally`).toBeLessThanOrEqual(VIEWPORT.w);
        expect(y, `${id} is off-stage vertically`).toBeGreaterThanOrEqual(0);
        expect(y, `${id} is off-stage vertically`).toBeLessThanOrEqual(VIEWPORT.h);
      }
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('unfolds a breakdown off its parent when the node is expanded', () => {
    const { container } = render(<Harness />);
    const at = (id: string): string =>
      container.querySelector<HTMLElement>(`[data-id="${id}"]`)!.style.getPropertyValue('--nx');
    const children = WORLD.nodes.filter((n) => n.parentId === PARENT);
    expect(children.length).toBeGreaterThan(1);

    // Folded: a child sits exactly on its parent, present in the layout but hidden under its card.
    for (const child of children) expect(at(child.id)).toBe(at(PARENT));

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="expand"]')!.click());
    for (const child of children) expect(at(child.id)).not.toBe(at(PARENT));

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="expand"]')!.click());
    for (const child of children) expect(at(child.id)).toBe(at(PARENT));
  });

  it('never offers a folded breakdown as something to click or tab to', () => {
    const { container } = render(<Harness />);
    const child = WORLD.nodes.find((n) => n.parentId === PARENT)!;
    const at = (id: string): HTMLElement =>
      container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;

    // Folded, it sits exactly on its parent's card — so it must not be the thing that answers.
    expect(at(child.id).dataset.folded).toBe('');
    expect(at(child.id).getAttribute('tabindex')).toBeNull();
    expect(at(child.id).getAttribute('role')).toBeNull();
    expect(at(child.id).getAttribute('aria-hidden')).toBe('true');
    expect(at(PARENT).getAttribute('role')).toBe('button');

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="expand"]')!.click());
    expect(at(child.id).dataset.folded).toBeUndefined();
    expect(at(child.id).getAttribute('role')).toBe('button');
  });

  // The stage pans, so it wants the pointer; the cards, the affordances and the arrows on it want
  // the click. Pointer capture redirects the compatibility mouse events to the capturing element
  // as well, so taking it on pointerdown sent every mouseup — and therefore every click — to the
  // viewport instead of whatever the reader had pressed: in a real browser the whole surface was
  // unclickable, and only the keyboard path opened anything. jsdom has no capture semantics to
  // reproduce that with, so what is pinned is the rule that avoids it — capture is taken when the
  // gesture PROVES itself a pan, never on the way in.
  describe('pointer capture', () => {
    const press = (
      el: Element,
      init: { clientX: number; clientY: number },
    ): { capture: ReturnType<typeof vi.fn>; move: (to: { x: number; y: number }) => void } => {
      const capture = vi.fn();
      Object.assign(el, { setPointerCapture: capture, hasPointerCapture: () => false });
      fireEvent.pointerDown(el, { pointerId: 1, ...init });
      return {
        capture,
        move: (to) => fireEvent.pointerMove(el, { pointerId: 1, clientX: to.x, clientY: to.y }),
      };
    };

    it('is not taken by a press that never moves', () => {
      const { container } = render(<Harness />);
      const viewport = container.querySelector('.mv-viewport')!;
      const { capture, move } = press(viewport, { clientX: 40, clientY: 40 });
      expect(capture).not.toHaveBeenCalled();

      // A tremor inside the drag slop is still a click, not a pan.
      move({ x: 41, y: 40 });
      expect(capture).not.toHaveBeenCalled();
    });

    it('is taken once — the moment the press becomes a pan', () => {
      const { container } = render(<Harness />);
      const viewport = container.querySelector('.mv-viewport')!;
      const { capture, move } = press(viewport, { clientX: 40, clientY: 40 });

      move({ x: 80, y: 40 });
      expect(capture).toHaveBeenCalledTimes(1);
      move({ x: 120, y: 40 });
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it('is taken at once by a second finger, which is a pinch and never a click', () => {
      const { container } = render(<Harness />);
      const viewport = container.querySelector('.mv-viewport')!;
      const { capture } = press(viewport, { clientX: 40, clientY: 40 });

      fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 200, clientY: 200 });
      expect(capture).toHaveBeenCalledTimes(1);
    });
  });

  it('lets a narration driver step the representations', () => {
    const { container } = render(<Harness />);
    const claimed = claim(DRIVER_ID);
    expect(claimed).not.toBeNull();
    // Read against the published list rather than a literal: adding a representation is a supported
    // extension, and a hard-coded count would make every one of them a test failure.
    expect(claimed!.controller.count).toBe(REPRESENTATIONS.length);
    for (let i = 0; i < REPRESENTATIONS.length; i += 1) {
      expect(
        claimed!.controller.captionFor(i),
        `no caption for ${REPRESENTATIONS[i]}`,
      ).toBeTruthy();
    }

    // Stepping to the chart is what turns a card into a mark, so find it rather than assume where
    // in the order it sits.
    const chartAt = REPRESENTATIONS.indexOf('chart');
    act(() => claimed!.controller.setIndex(chartAt));
    expect(container.querySelector<HTMLElement>(`[data-id="${PARENT}"]`)!.dataset.face).toBe(
      'mark',
    );

    // Out-of-range steps clamp to the LAST representation rather than throwing — a driver's step
    // count can outrun this block's. Stated as "lands where the last index lands".
    const faceNow = (): string | undefined =>
      container.querySelector<HTMLElement>(`[data-id="${PARENT}"]`)!.dataset.face;
    act(() => claimed!.controller.setIndex(REPRESENTATIONS.length - 1));
    const atLast = faceNow();
    act(() => claimed!.controller.setIndex(REPRESENTATIONS.length + 6));
    expect(faceNow()).toBe(atLast);
    claimed!.release();
  });

  it('tears down its timers on unmount', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container, unmount } = render(<Harness />);
      flip(container, 'timeline');
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.advanceTimersByTime(5000));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});

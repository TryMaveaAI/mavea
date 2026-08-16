// What the morph stage costs while nobody is asking it for anything.
//
// The surface is open for as long as the reader is reading, and three things used to be charged
// for that whole time rather than for the moves that need them: a permanent compositor layer on
// the world, a permanent transform transition on every one of N nodes (which the counter-scale
// re-ran on every wheel tick), and a full React reconciliation of the node list on every camera
// frame, because the camera is state the node list rendered under. These pin the three levers that
// fixed it — a flight flag, a `--mv-flight` duration inherited from the world, and a memo boundary
// between the camera and the world's contents.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCallback } from 'react';
import { MorphStage } from '../src/canvas/spatial/morph/MorphStage';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { useMorphStage } from '../src/canvas/spatial/morph/useMorphStage';
import type { MorphNodeDatum } from '../src/canvas/spatial/morph/types';
import { WORLD_SEED } from '../src/live/world/seed';

const WORLD = worldToMorph(WORLD_SEED);
const CSS = readFileSync('src/canvas/spatial/morph/morph.css', 'utf8');
const VIEWPORT = { w: 1000, h: 700 };

/** jsdom has no layout, so the camera never fits unless the viewport reports a box. */
function stubViewport(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (!this.classList.contains('mv-viewport')) return original.call(this);
    const box = { x: 0, y: 0, left: 0, top: 0, right: VIEWPORT.w, bottom: VIEWPORT.h };
    return { ...box, width: VIEWPORT.w, height: VIEWPORT.h, toJSON: () => ({}) } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/** Counts how many times the stage asked the host to render a face — one call per node per render
 *  of the node list, so it counts renders of the list without reaching inside the module. */
function Harness({ onFace }: { onFace: () => void }): React.ReactNode {
  const stage = useMorphStage({ world: WORLD });
  const renderFace = useCallback(
    (_node: MorphNodeDatum): React.ReactNode => {
      onFace();
      return null;
    },
    [onFace],
  );
  const onNodeClick = useCallback(() => {}, []);
  return (
    <>
      <button type="button" data-testid="to-chart" onClick={() => stage.setRep('chart')}>
        chart
      </button>
      <MorphStage stage={stage} world={WORLD} renderFace={renderFace} onNodeClick={onNodeClick} />
    </>
  );
}

const world = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('.mv-world')!;

/** A press that moves past DRAG_SLOP — the gesture that makes the camera pan. */
function drag(viewport: Element, dx: number): void {
  Object.assign(viewport, { setPointerCapture: () => {}, hasPointerCapture: () => false });
  fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 40 + dx, clientY: 40 });
  fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 40 + dx, clientY: 40 });
}

afterEach(cleanup);

describe('the morph stage at rest', () => {
  it('does not re-render the node list when the camera pans', () => {
    let faces = 0;
    const { container } = render(<Harness onFace={() => (faces += 1)} />);
    expect(faces).toBeGreaterThan(0);
    const settled = faces;
    const before = world(container).style.transform;

    drag(container.querySelector('.mv-viewport')!, 120);

    // The camera really moved — otherwise this proves nothing.
    expect(world(container).style.transform).not.toBe(before);
    expect(faces).toBe(settled);
  });

  it('retires the flight — and its compositor layer — when the world settles', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<Harness onFace={() => {}} />);
      // The opening fit is a choreographed move, so the world flies and asks to be promoted.
      expect(world(container).dataset.morphing).toBe('');

      fireEvent.transitionEnd(world(container), { propertyName: 'transform' });
      expect(world(container).dataset.morphing).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('retires a flight the browser never animated, without waiting to be touched', () => {
    // The transitionend above is the normal exit. Some moves never produce one — a dropped
    // transition, a reduced-motion reader, a transform that ends up visually identical — and until
    // this net existed the surface then held a promoted layer and an armed transition on every
    // node for as long as it stayed open, which is precisely the idle cost nobody sees coming.
    const restore = stubViewport();
    vi.useFakeTimers();
    try {
      const { container } = render(<Harness onFace={() => {}} />);
      expect(world(container).dataset.morphing).toBe('');

      act(() => vi.advanceTimersByTime(1400));
      expect(world(container).dataset.morphing).toBeUndefined();
    } finally {
      vi.useRealTimers();
      restore();
    }
  });

  it('does not re-fly a fit that lands exactly where the camera already is', () => {
    // Re-fitting is the commonest camera call there is and most re-fits land on the same numbers.
    // Raising a flight for one arms a transition that, having nothing to move, never ends.
    const restore = stubViewport();
    try {
      const { container } = render(<Harness onFace={() => {}} />);
      fireEvent.transitionEnd(world(container), { propertyName: 'transform' });
      expect(world(container).dataset.morphing).toBeUndefined();

      // Same content, same viewport → same camera. Nothing should start moving again.
      act(() => window.dispatchEvent(new Event('resize')));
      expect(world(container).dataset.morphing).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('is morphing on the very render that moves the nodes', () => {
    // The nodes' new positions and the camera's new fit land in DIFFERENT commits — React writes
    // the positions on the render that follows the rep flip, the camera comes from an effect after
    // it. A morph flag sourced from the camera would arrive after the move it was meant to animate
    // and every node would jump. No viewport is stubbed here, so the camera cannot be the source.
    const { container } = render(<Harness onFace={() => {}} />);
    fireEvent.transitionEnd(world(container), { propertyName: 'transform' });
    expect(world(container).dataset.morphing).toBeUndefined();

    const node = container.querySelector<HTMLElement>('.mv-node')!;
    const before = node.style.getPropertyValue('--nx');
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="to-chart"]')!.click());

    expect(node.style.getPropertyValue('--nx')).not.toBe(before);
    expect(world(container).dataset.morphing).toBe('');
  });

  it('never flies for a drag — the world lands where the pointer put it', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<Harness onFace={() => {}} />);
      drag(container.querySelector('.mv-viewport')!, 90);
      expect(world(container).dataset.morphing).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('asks for a compositor layer only while something is moving', () => {
    const asking = [...CSS.matchAll(/([^{}]+)\{([^{}]*will-change[^{}]*)\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(asking.length).toBeGreaterThan(0);
    for (const selector of asking) {
      expect(selector, `"${selector}" holds a layer at rest`).toMatch(
        /\[data-morphing\]|\[data-panning='true'\]/,
      );
    }
  });

  it('gives a node no transform transition unless the world is morphing', () => {
    // The node's transform carries the counter-scale, which every camera scale change rewrites —
    // so a duration that is not gated is a transition restarted on all N nodes per wheel tick.
    expect(CSS).toMatch(/transform var\(--mv-flight, 0ms\)/);
    expect(CSS).toMatch(/\.mv-world \{[^}]*--mv-flight: 0ms;/);
    expect(CSS).toMatch(/\.mv-world\[data-morphing\] \{\s*--mv-flight: var\(--m-cinematic/);
  });
});

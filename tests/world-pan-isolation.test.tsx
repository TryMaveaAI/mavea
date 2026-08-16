// Panning a world costs one thing: the world moves. It must not cost a re-render of the rail
// beside it.
//
// The camera is state, and it lives in the hook the overlay itself calls — so every frame of a
// drag re-renders the overlay, and with it the levers, the what-if readout and the evidence panel,
// none of which the drag touched. At trackpad rates that is a hundred reconciliations a second of
// components that had nothing to say. These pin the two halves of the fix: the pointer stream is
// spent once per frame, and the chrome is memoized so a frame that changes only the camera stops
// at the memo boundary.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, memo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { WORLD_SEED } from '../src/live/world/seed';

const renders = { lever: 0, whatIf: 0 };

vi.mock('../src/live/trust/LeverRail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/trust/LeverRail')>();
  return {
    ...actual,
    // Memoized like the real export, so the count answers the question that matters: does a pan
    // frame reach this component with props it has to re-render for?
    LeverRail: memo((props: Parameters<typeof actual.LeverRail>[0]) => {
      renders.lever += 1;
      return createElement(actual.LeverRail, props);
    }),
  };
});

vi.mock('../src/live/trust/WhatIfFrame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/trust/WhatIfFrame')>();
  return {
    ...actual,
    WhatIfFrame: memo((props: Parameters<typeof actual.WhatIfFrame>[0]) => {
      renders.whatIf += 1;
      return createElement(actual.WhatIfFrame, props);
    }),
  };
});

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

afterEach(cleanup);
beforeEach(() => {
  renders.lever = 0;
  renders.whatIf = 0;
});

describe('panning the world', () => {
  it('leaves the rail beside it alone', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      const viewport = container.querySelector<HTMLElement>('.mv-viewport')!;
      Object.assign(viewport, { setPointerCapture: () => {}, hasPointerCapture: () => false });
      const world = container.querySelector<HTMLElement>('.mv-world')!;
      const settled = { ...renders };
      const before = world.style.transform;

      act(() => {
        fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 40, clientY: 40 });
        for (let i = 1; i <= 8; i += 1) {
          fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 40 + i * 15, clientY: 40 });
        }
        fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 160, clientY: 40 });
      });

      // The camera really moved — otherwise this proves nothing.
      expect(world.style.transform).not.toBe(before);
      expect(renders.lever).toBe(settled.lever);
      expect(renders.whatIf).toBe(settled.whatIf);
    } finally {
      restore();
    }
  });

  it('spends a whole stream of pointer moves as one camera write', () => {
    const restore = stubViewport();
    const frames: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      const viewport = container.querySelector<HTMLElement>('.mv-viewport')!;
      Object.assign(viewport, { setPointerCapture: () => {}, hasPointerCapture: () => false });
      const world = container.querySelector<HTMLElement>('.mv-world')!;

      act(() => {
        fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 40, clientY: 40 });
      });
      const before = world.style.transform;
      const queued = frames.length;

      act(() => {
        for (let i = 1; i <= 6; i += 1) {
          fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 40 + i * 12, clientY: 40 });
        }
      });
      // Six moves, one frame asked for, and nothing painted until that frame runs.
      expect(frames.length).toBe(queued + 1);
      expect(world.style.transform).toBe(before);

      act(() => frames[frames.length - 1](0));
      expect(world.style.transform).not.toBe(before);
    } finally {
      raf.mockRestore();
      restore();
    }
  });
});

describe('the chrome around the stage', () => {
  it('is memoized, so stable props actually stop at its boundary', async () => {
    // The test above proves the props hold still across a pan; this proves something is there to
    // catch them. Both halves are needed — either one alone lets the cost back in.
    const MEMO = Symbol.for('react.memo');
    const [rail, frame, panel] = await Promise.all([
      vi.importActual<typeof import('../src/live/trust/LeverRail')>('../src/live/trust/LeverRail'),
      vi.importActual<typeof import('../src/live/trust/WhatIfFrame')>(
        '../src/live/trust/WhatIfFrame',
      ),
      vi.importActual<typeof import('../src/live/trust/EdgeEvidencePanel')>(
        '../src/live/trust/EdgeEvidencePanel',
      ),
    ]);
    expect((rail.LeverRail as { $$typeof?: symbol }).$$typeof).toBe(MEMO);
    expect((frame.WhatIfFrame as { $$typeof?: symbol }).$$typeof).toBe(MEMO);
    expect((panel.EdgeEvidencePanel as { $$typeof?: symbol }).$$typeof).toBe(MEMO);
  });
});

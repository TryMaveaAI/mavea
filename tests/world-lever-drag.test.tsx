// What a what-if lever costs, and what it is allowed to move.
//
// A lever is a continuous gesture: one drag fires a change event per pointer move. It used to
// rebuild a second "hypothetical" lane on each of those, re-running the layout for BOTH lanes and
// re-fitting the camera — so the surface spent the whole drag animating toward positions it had
// already been told to abandon, and needed a special case to tell a lane RESHAPING under the
// reader's hand from one arriving.
//
// Shown in place, that whole class of cost is gone by construction: a shift is a render channel, no
// layout reads it, and the camera is never asked for anything. These tests pin that — the map holds
// still, to the pixel, and the cinematic never opens.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorldOverlay } from '../src/live/world/WorldOverlay';
import { WORLD_SEED } from '../src/live/world/seed';

const VIEWPORT = { w: 1000, h: 700 };

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

const world = (c: HTMLElement): HTMLElement => c.querySelector<HTMLElement>('.mv-world')!;
/** The world's own transform transition ending is what normally retires a morph. */
const land = (c: HTMLElement): void => {
  act(() => {
    fireEvent.transitionEnd(world(c), { propertyName: 'transform' });
  });
};
/** Where every node sits, as the sheet sees it. */
const placements = (c: HTMLElement): string[] =>
  [...c.querySelectorAll<HTMLElement>('.mv-node')].map(
    (n) =>
      `${n.dataset.id}:${n.style.getPropertyValue('--nx')},${n.style.getPropertyValue('--ny')}`,
  );
const pull = (value: string): void => {
  const lever = screen.getByLabelText(WORLD_SEED.nodes[0].label);
  act(() => fireEvent.change(lever, { target: { value } }));
};

afterEach(cleanup);

describe('dragging a what-if lever', () => {
  it('never re-opens the cinematic — not on the first pull, nor on any frame after it', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      expect(world(container).dataset.morphing).toBeUndefined();

      for (const value of ['60', '55', '50', '45', '40']) {
        pull(value);
        expect(
          world(container).dataset.morphing,
          `lever at ${value} opened a flight`,
        ).toBeUndefined();
      }
    } finally {
      restore();
    }
  });

  it('holds the map still: every node sits exactly where it did before the lever moved', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      const before = placements(container);
      pull('25');
      // A counterfactual changes how much a cause MATTERS, never where it sits. If this ever fails,
      // a shift has leaked into a layout.
      expect(placements(container)).toEqual(before);
    } finally {
      restore();
    }
  });

  it('re-weights the world in place rather than drawing a second copy of it', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      const nodeCount = container.querySelectorAll('.mv-node').length;
      pull('25');
      expect(container.querySelectorAll('.mv-node')).toHaveLength(nodeCount);
      expect(container.querySelectorAll('.mv-node[data-hypothetical]')).toHaveLength(0);
      expect(container.querySelectorAll('.mv-node[data-shift]').length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('shows the what-if on EVERY view, including the one that could never fork', () => {
    // The timeline places a cause by its date, so a fork of it was pixel-identical to the actual
    // lane and had to be suppressed. A re-weight has no such problem: "this cause matters less" is
    // true and legible whether the view arranges by cause, by time, or by measurement.
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      pull('25');
      expect(container.querySelectorAll('.mv-node[data-shift]').length).toBeGreaterThan(0);

      act(() => screen.getByRole('button', { name: 'Over time' }).click());
      land(container);
      expect(container.querySelectorAll('.mv-node[data-shift]').length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('leaves a cause the levers never reached completely unmarked', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      pull('25');
      const shifted = new Set(
        [...container.querySelectorAll<HTMLElement>('.mv-node[data-shift]')].map(
          (n) => n.dataset.id,
        ),
      );
      // The OTHER root is not downstream of the one that moved, so it must carry no mark at all —
      // "unchanged" has to be visibly different from "changed a little".
      const otherRoot = WORLD_SEED.nodes.find(
        (n) => n.role === 'root' && n.id !== WORLD_SEED.nodes[0].id,
      );
      expect(otherRoot).toBeDefined();
      expect(shifted.has(otherRoot!.id)).toBe(false);
    } finally {
      restore();
    }
  });

  it('clears every mark when the reader resets', () => {
    const restore = stubViewport();
    try {
      const { container } = render(<WorldOverlay spec={WORLD_SEED} onClose={() => {}} />);
      land(container);
      pull('45');
      expect(container.querySelectorAll('.mv-node[data-shift]').length).toBeGreaterThan(0);

      // The rail's own Reset, not the stage's view reset.
      const railReset = container.querySelector<HTMLButtonElement>('.tr-levers button')!;
      act(() => railReset.click());
      expect(container.querySelectorAll('.mv-node[data-shift]')).toHaveLength(0);
    } finally {
      restore();
    }
  });
});

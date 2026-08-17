// annotate-collapsed-target.test.ts — a pen stroke needs somewhere honest to land.
//
// A mark attaches to text the model explicitly named. `getClientRects` reports where that text WOULD
// be and knows nothing about an ancestor's overflow — so a collapsed accordion, which keeps its
// content laid out and clips it to no height, hands back a perfectly ordinary box sitting at the
// CLOSED section's own position. The circle was drawn there: looping blank space beside the header,
// which a reader reads as the feature being broken rather than as a gesture with nowhere to go.
//
// The rule is COLLAPSED, not "currently on screen" — and the second test is why. Refusing anything
// clipped would also refuse a target the reader has merely scrolled past, and that one is still a
// target, because the layer scrolls its own scroller to bring it back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findSaidMatch, saidRect } from '../src/live/annotate/saidTarget';

/** jsdom measures nothing: a Range has no getClientRects and every element reports a zero box. Both
 *  are stubbed here — an element's box comes from `data-box="wxh"`, defaulting to a roomy one, so a
 *  fixture states only the geometry the rule actually reads. */
const ROOMY = { x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 };
const WORD = { x: 10, y: 10, top: 10, left: 10, width: 40, height: 16, right: 50, bottom: 26 };

beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(
    () => [{ ...WORD, toJSON: () => ({}) }] as unknown as DOMRectList,
  );
  Range.prototype.getBoundingClientRect = vi.fn(() => ({ ...WORD, toJSON: () => ({}) }) as DOMRect);
  Element.prototype.getBoundingClientRect = vi.fn(function (this: Element): DOMRect {
    const spec = this.getAttribute('data-box');
    if (!spec) return { ...ROOMY, toJSON: () => ({}) } as DOMRect;
    const [w, h] = spec.split('x').map(Number);
    return { ...ROOMY, width: w, height: h, right: w, bottom: h, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A host holding one paragraph, wrapped in whatever the fixture describes. */
function host(inner: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = inner;
  document.body.appendChild(el);
  return el;
}

const rectFor = (el: HTMLElement, word: string): DOMRect | null => {
  const match = findSaidMatch(el, [word]);
  expect(match, `"${word}" was not even found in the DOM`).not.toBeNull();
  return saidRect(match!);
};

describe('a mark whose target is collapsed', () => {
  it('refuses text inside a section clipped to no height', () => {
    // The reported bug, exactly: the words are findable and their box is real, but the section
    // holding them is closed.
    const el = host(
      '<div style="overflow:hidden" data-box="400x0"><p>In the 1960s planners aimed high.</p></div>',
    );
    expect(rectFor(el, '1960s')).toBeNull();
  });

  it('refuses text inside a section clipped to no WIDTH as well', () => {
    const el = host(
      '<div style="overflow:hidden" data-box="0x400"><p>In the 1960s planners aimed high.</p></div>',
    );
    expect(rectFor(el, '1960s')).toBeNull();
  });

  it('refuses a hidden ancestor however it is hidden', () => {
    for (const style of ['display:none', 'visibility:hidden', 'opacity:0']) {
      const el = host(`<div style="${style}"><p>In the 1960s planners aimed high.</p></div>`);
      expect(rectFor(el, '1960s'), style).toBeNull();
    }
  });
});

describe('a mark whose target is merely out of view', () => {
  it('KEEPS text scrolled past inside a real scroller — the layer scrolls it back', () => {
    // The false negative to avoid. Refusing everything clipped would kill legitimate marks on any
    // card with an inner scroller, which is most of the long ones.
    const el = host(
      '<div style="overflow:auto" data-box="400x40"><p>In the 1960s planners aimed high.</p></div>',
    );
    expect(rectFor(el, '1960s')).not.toBeNull();
  });

  it('keeps ordinary text with nothing clipping it at all', () => {
    const el = host('<div><p>In the 1960s planners aimed high.</p></div>');
    expect(rectFor(el, '1960s')).not.toBeNull();
  });

  it('keeps text whose clipping ancestor is roomy', () => {
    const el = host(
      '<div style="overflow:hidden"><section style="overflow:hidden"><p>In the 1960s planners aimed high.</p></section></div>',
    );
    expect(rectFor(el, '1960s')).not.toBeNull();
  });
});

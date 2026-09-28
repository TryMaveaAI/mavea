// A concept section is tiled for the width IT has, not the board's. On an ultrawide window the
// board sets sections two abreast; spans chosen for the whole board then drew a quarter-width card
// at ~190px inside a half. jsdom has no layout, so the section's measured width is stated here.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { SectionGroup } from '../src/canvas/depth/SectionGroup';
import { retileSection } from '../src/canvas/hooks/useResponsiveGrid';

const card = (type: string, col: number, title: string): Block =>
  ({ type, col, delay: 0, props: { title } }) as unknown as Block;

// Four quarter-width cards: the shape that broke, since a quarter of a half is an eighth.
const STANDARD = ['a', 'b', 'c', 'd'].map((title) => card('insight', 3, title));

/** The narrowest card the board itself draws on its full-width layout: a quarter of the
 *  narrowest grid that still gets that layout (useResponsiveGrid's 1100px step). */
const BOARD_FLOOR_PX = (3 / 12) * 1100;

class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Renders one section whose grid measures `width` px and returns each card's painted width. */
function cardWidths(width: number): number[] {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => width,
  });
  const { container, unmount } = render(
    <SectionGroup
      section={{ label: '', order: 1, standard: STANDARD, deeper: [] }}
      renderCard={(b) => (
        <div key={(b.props as { title: string }).title} className={`col-${b.col}`} />
      )}
      readingMode={false}
    />,
  );
  const spans = [...container.querySelectorAll('.card-grid > [class^="col-"]')].map((el) =>
    Number(el.className.slice(4)),
  );
  unmount();
  return spans.map((span) => (span / 12) * width);
}

describe('a section is tiled for its own width', () => {
  const realObserver = globalThis.ResizeObserver;
  const realOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

  beforeEach(() => {
    globalThis.ResizeObserver = InertResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = realObserver;
    if (realOffsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', realOffsetWidth);
  });

  it('keeps the board’s own layout where a section spans the board', () => {
    const board = retileSection(STANDARD, 12).map((b) => ((b.col ?? 12) / 12) * 1640);
    expect(cardWidths(1640)).toEqual(board);
  });

  it('re-tiles a half-width section so no card drops under the board’s own narrowest card', () => {
    // 2560 with the note gutter leaves a half about 819px wide, without it about 1037; 3840 about
    // 1530. Tiled for the board, the 819 half split four ways at ~205px.
    for (const half of [819, 1037, 1530]) {
      expect(Math.min(...cardWidths(half)), `${half}px half`).toBeGreaterThanOrEqual(
        BOARD_FLOOR_PX,
      );
    }
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CausationChain } from '../src/canvas/blocks/diagrams/CausationChain';
import type { CausationLink } from '../src/canvas/blocks/diagrams/types';

// Regression coverage for CausationChain's data-driven layout: column height, node placement,
// and connector anchors are all computed from the item count and card metrics rather than
// assumed from the ~5-cause/~4-consequence demo fixture. A layout that only worked for that
// fixture size would pack cards past the viewBox or collide once a side carried many more
// items than the demo, or would let a long node label bleed outside its fixed-width card.

function links(n: number, labelLen = 8): CausationLink[] {
  return Array.from({ length: n }, (_, i) => ({
    label: 'x'.repeat(labelLen) + ` factor ${i}`,
    weight: (i % 5) / 4,
    term: i % 2 === 0 ? ('short' as const) : ('long' as const),
  }));
}

/** Cause/consequence node cards, top-to-bottom, read off their <rect> geometry. */
function nodeCards(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect.cau-node'))
    .map((r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      w: Number(r.getAttribute('width')),
      h: Number(r.getAttribute('height')),
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

function viewBoxHeight(container: HTMLElement) {
  const svg = container.querySelector('svg.cau-svg')!;
  const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  return h;
}

describe('CausationChain', () => {
  it.each([4, 12, 24])(
    'stacks %i causes and consequences without overlap or overflowing the viewBox',
    (n) => {
      const { container } = render(
        <CausationChain
          title="Chain"
          event={{ label: 'Central event' }}
          causes={links(n)}
          consequences={links(n)}
        />,
      );
      const cards = nodeCards(container);
      expect(cards).toHaveLength(n * 2);
      const vbH = viewBoxHeight(container);

      // Group by column (shared x) and check no card starts before the previous one in that
      // column ends — that's the illegible-overlap failure mode a fixed-height column would hit
      // once item count outgrows the demo fixture's ~5 rows.
      const byX = new Map<number, typeof cards>();
      for (const c of cards) {
        const arr = byX.get(c.x) ?? [];
        arr.push(c);
        byX.set(c.x, arr);
      }
      expect(byX.size).toBe(2); // exactly the cause column and the consequence column
      for (const col of byX.values()) {
        for (let i = 1; i < col.length; i++) {
          expect(col[i].y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h);
        }
        // The whole column must stay within the (content-driven) viewBox height.
        const last = col[col.length - 1];
        expect(last.y + last.h).toBeLessThanOrEqual(vbH);
        expect(col[0].y).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it('wraps a long node label to fit the fixed card width instead of overflowing it', () => {
    const longLabel =
      'A very long causal factor description that is far wider than a single card line';
    const { container } = render(
      <CausationChain
        title="Chain"
        event={{ label: 'Event' }}
        causes={[{ label: longLabel, weight: 0.5 }]}
        consequences={[]}
      />,
    );
    const tspans = Array.from(container.querySelectorAll('text.cau-node-lbl tspan'));
    expect(tspans.length).toBeGreaterThan(0);
    // Each rendered line must be short enough to fit the card at the node font (mirrors the
    // component's own NODE_CHARS budget); no single tspan may carry the whole raw label.
    for (const t of tspans) {
      expect((t.textContent ?? '').length).toBeLessThanOrEqual(24);
    }
    // The untruncated label is preserved via a native <title> tooltip, same pattern as EtymTree.
    const title = container.querySelector('text.cau-node-lbl title');
    expect(title?.textContent).toBe(longLabel);
  });

  it('renders BlockEmpty-free but stable with empty causes/consequences (no NaN geometry)', () => {
    const { container } = render(
      <CausationChain title="Chain" event={{ label: 'Event' }} causes={[]} consequences={[]} />,
    );
    const svg = container.querySelector('svg.cau-svg')!;
    const viewBox = svg.getAttribute('viewBox') ?? '';
    expect(viewBox).not.toMatch(/NaN/);
    expect(container.querySelectorAll('rect.cau-node')).toHaveLength(0);
    // The central event card still renders at a sane, finite position.
    const eventRect = container.querySelector('rect.cau-event')!;
    expect(Number(eventRect.getAttribute('y'))).toBeGreaterThanOrEqual(0);
  });
});

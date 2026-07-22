import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpaceFit } from '../src/canvas/blocks/media/SpaceFit';
import type { SpaceItem } from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage: the item label's font-size shrinks by a character-count heuristic
// (label.length * 0.52), not real SVG text metrics — a label that's merely "long enough" can
// still render wider than the item's own footprint (it.w * 0.84) once the heuristic's assumed
// glyph width undershoots the real one. Same bug class already fixed for FloorPlan/EtymTree/
// TamSam/Treemap: budget a hard truncation from the box's own width at the chosen font-size.

describe('SpaceFit', () => {
  it('truncates a long item label instead of letting it overflow the footprint', () => {
    const items: SpaceItem[] = [
      // Long label on a modest footprint — wide enough to clear the "hide label" gate
      // (min(w,d) > max(W,D)*0.12) but not wide enough to hold this label at its shrunk size.
      { label: 'Reclining Sectional Sofa With Chaise', w: 6, d: 3, x: 2, y: 2 },
      // Short label — must render untouched.
      { label: 'Rug', w: 4, d: 4, x: 12, y: 2 },
    ];
    const { container } = render(
      <SpaceFit title="Living Room" room={{ w: 20, d: 12, unit: 'ft' }} items={items} />,
    );

    const labels = Array.from(container.querySelectorAll('text.spf-item-lbl'));
    expect(labels).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own item's width (in
    // viewBox units, at the label's own font-size) — no unbounded text past the footprint.
    labels.forEach((node, i) => {
      const boxW = items[i].w * 0.84;
      const fontSize = parseFloat((node as HTMLElement).style.fontSize);
      const maxChars = Math.max(2, Math.floor(boxW / (fontSize * 0.56)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long label was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Reclining Sectional Sofa With Chaise');

    // The short label renders untouched, with no tooltip attached to it.
    expect(visibleText(labels[1])).toBe('Rug');
  });

  it('leaves a short label on a roomy footprint untouched', () => {
    const items: SpaceItem[] = [{ label: 'Desk', w: 10, d: 6, x: 2, y: 2 }];
    const { container } = render(<SpaceFit title="Office" room={{ w: 20, d: 12 }} items={items} />);
    const label = container.querySelector('text.spf-item-lbl');
    expect(label?.textContent).toBe('Desk');
    expect(container.querySelector('title')).toBeNull();
  });

  it('does not render clipped/overlapping text past the SVG viewBox for a crowded room', () => {
    // Several long-labeled items packed into a modest room — the exact shape that would
    // previously spill labels past their rects and into their neighbours.
    const items: SpaceItem[] = [
      { label: 'King Size Bed Frame', w: 5, d: 5, x: 1, y: 1 },
      { label: 'Walk-In Wardrobe Unit', w: 4, d: 3, x: 7, y: 1 },
      { label: 'Bedside Reading Nook', w: 3, d: 3, x: 1, y: 7 },
    ];
    const { container } = render(
      <SpaceFit title="Bedroom" room={{ w: 14, d: 10, unit: 'ft' }} items={items} />,
    );
    const svg = container.querySelector('svg.spf-svg')!;
    const vbW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);

    const labels = Array.from(container.querySelectorAll('text.spf-item-lbl'));
    labels.forEach((node, i) => {
      const boxW = items[i].w * 0.84;
      const fontSize = parseFloat((node as HTMLElement).style.fontSize);
      const maxChars = Math.max(2, Math.floor(boxW / (fontSize * 0.56)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
      // Sanity: nothing renders anywhere near wider than the whole figure.
      expect(fontSize * visibleText(node).length).toBeLessThan(vbW);
    });
  });
});

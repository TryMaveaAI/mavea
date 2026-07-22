import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SeasonBand } from '../src/canvas/blocks/charts2/SeasonBand';
import type { SeasonRow } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the row label <text> sits at a fixed x = PAD_L - 8
// (right-anchored into an 86px-wide left gutter) with no truncation, sized only for the demo
// fixture's longest label ("Winter squash", 13 chars). A longer real-data row label (a species
// name, a multi-word produce item) rendered wide enough to run past the SVG's left edge (x=0)
// instead of fitting inside the gutter — clipped or drawn off-canvas.

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

function rowsWith(labels: string[]): SeasonRow[] {
  return labels.map((label) => ({
    label,
    windows: [{ from: 3, to: 6, kind: 'available' }],
  }));
}

describe('SeasonBand', () => {
  it('leaves a short demo-fixture-sized row label untouched', () => {
    const { container } = render(
      <SeasonBand title="Produce" rows={rowsWith(['Tomatoes', 'Winter squash'])} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels.map((n) => visibleText(n))).toEqual(['Tomatoes', 'Winter squash']);
    expect(container.querySelectorAll('text.c2-sb-row-lbl title')).toHaveLength(0);
  });

  it('truncates a row label longer than the left-gutter can hold instead of overflowing it', () => {
    const longLabel = 'Gravitationally Anomalous Heirloom Squash';
    const { container } = render(
      <SeasonBand title="Produce" rows={rowsWith(['Tomatoes', longLabel])} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels).toHaveLength(2);

    const longNode = labels[1];
    const rendered = visibleText(longNode);
    // Every rendered row label must fit inside the fixed 86px-wide left gutter at the class's
    // 10px font-size — this is the exact ceiling the unbounded label blew past.
    expect(rendered.length).toBeLessThan(longLabel.length);
    expect(rendered.endsWith('…')).toBe(true);

    // Rendered text never starts left of the SVG's viewBox origin (x=0) — the concrete
    // "off-canvas" failure mode: an unclamped label's glyph run extending past x=0.
    const x = Number(longNode.getAttribute('x'));
    const approxWidth = rendered.length * 10 * 0.6; // same glyph-width heuristic as the fix
    expect(x - approxWidth).toBeGreaterThanOrEqual(0);

    // The full label is still available, via a native <title> tooltip.
    const title = longNode.querySelector('title');
    expect(title?.textContent).toBe(longLabel);
  });

  it('holds the truncation ceiling steady as more rows are added, not just at the demo fixture count', () => {
    const longLabel = 'Extraordinarily Long Multi-Word Produce Designation';
    const rows = rowsWith(Array.from({ length: 12 }, (_, i) => `${longLabel} ${i}`));
    const { container } = render(<SeasonBand title="Produce" rows={rows} />);
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels).toHaveLength(12);
    for (const node of labels) {
      const rendered = visibleText(node);
      expect(rendered.length).toBeLessThanOrEqual(13);
      expect(rendered.endsWith('…')).toBe(true);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ConfusionMatrix } from '../src/canvas/blocks/stats/ConfusionMatrix';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: row/column class labels are plain SVG <text> with no wrap
// or clip, positioned into a fixed-width LEFT gutter (rows) or a per-column share of the grid
// that shrinks as the class count grows (columns). The demo fixture's short names ("Setosa",
// "Virginica") never exposed it, but a longer label or more classes bled the label past its
// gutter/cell — into the frame, a neighbouring label, or off the card entirely.

function square(n: number, labels: string[]): number[][] {
  return Array.from({ length: n }, (_, i) => labels.map((__, j) => (i === j ? 20 : 2)));
}

describe('ConfusionMatrix', () => {
  it('truncates a long row/column class label instead of letting it overflow its gutter/cell', () => {
    const classes = ['Non-Small-Cell Lung Carcinoma', 'Benign'];
    const { container } = render(
      <ConfusionMatrix title="Diagnosis" classes={classes} matrix={square(2, classes)} />,
    );
    const rowLabel = container.querySelector('text.cfm-class[text-anchor="end"]');
    const colLabel = container.querySelector('text.cfm-class[text-anchor="middle"]');
    expect(rowLabel).toBeTruthy();
    expect(colLabel).toBeTruthy();

    // The rendered glyphs are short enough to fit the fixed LEFT gutter / a single column's
    // share of the grid — the old unclipped text rendered the full 30-char label every time.
    expect(visibleText(rowLabel!).length).toBeLessThan(classes[0].length);
    expect(visibleText(rowLabel!).endsWith('…')).toBe(true);
    expect(visibleText(colLabel!).length).toBeLessThan(classes[0].length);
    expect(visibleText(colLabel!).endsWith('…')).toBe(true);

    // The untruncated string is still available, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(classes[0]);
  });

  it.each([2, 5, 8])('keeps every column label within its share of the grid at %i classes', (n) => {
    const classes = Array.from({ length: n }, (_, i) => `Category ${i + 1} Extended Name`);
    const { container } = render(
      <ConfusionMatrix title="Diagnosis" classes={classes} matrix={square(n, classes)} />,
    );
    const colLabels = Array.from(
      container.querySelectorAll('text.cfm-class[text-anchor="middle"]'),
    );
    expect(colLabels).toHaveLength(n);

    // Column width shrinks as n grows (side / n), so the character budget must shrink with
    // it — a label that fit at n=2 must truncate harder by n=8, never render at full length.
    for (const node of colLabels) {
      const shown = visibleText(node);
      expect(shown.length).toBeLessThan(classes[0].length);
      if (shown.length > 2) expect(shown.endsWith('…')).toBe(true);
    }
  });

  it('leaves a short label untouched and adds no tooltip', () => {
    const classes = ['Cat', 'Dog'];
    const { container } = render(
      <ConfusionMatrix title="Pets" classes={classes} matrix={square(2, classes)} />,
    );
    const rowLabels = Array.from(container.querySelectorAll('text.cfm-class[text-anchor="end"]'));
    expect(rowLabels.map((n) => visibleText(n))).toEqual(classes);
    expect(container.querySelector('title')).toBeNull();
  });
});

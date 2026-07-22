import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DpTable } from '../src/canvas/blocks/diagrams/DpTable';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: DpTable renders row/col headers and cell values as
// plain SVG text with no wrap or clip, centred inside fixed-size boxes (HDR_W=48 / CELL=44).
// The demo fixture only ever uses single-character labels ("A", "ε") and small integers, but
// the model can hand back longer header labels ("knapsack[7]") or large memoized values
// ("987654"), which used to render wider than their box and bleed into neighbouring cells.

describe('DpTable', () => {
  it('truncates long row/column header labels instead of letting them overflow the cell', () => {
    const { container } = render(
      <DpTable
        rows={['subproblem-root', 'A']}
        cols={['knapsack-capacity', 'B']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const hdrNodes = Array.from(container.querySelectorAll('text.dp-hdr-val'));
    expect(hdrNodes).toHaveLength(4); // 2 col headers + 2 row headers
    for (const node of hdrNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    // The long header (row 0 and col 0) is truncated with an ellipsis…
    const truncated = hdrNodes.filter((n) => visibleText(n).endsWith('…'));
    expect(truncated.length).toBeGreaterThanOrEqual(2);
    // …but the full text is still available via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('subproblem-root');
    expect(titles).toContain('knapsack-capacity');
  });

  it('truncates a large memoized cell value instead of letting it overflow the cell', () => {
    const { container } = render(
      <DpTable
        rows={['A', 'B']}
        cols={['0', '1']}
        cells={[
          [0, 1],
          [1, 987654321],
        ]}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dp-val'));
    expect(valNodes).toHaveLength(4);
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(5);
    }
    const bigCell = valNodes.find((n) => visibleText(n).endsWith('…'));
    expect(bigCell).toBeTruthy();
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('987654321');
  });

  it('leaves short headers and values untouched, with no stray title tooltips', () => {
    const { container } = render(
      <DpTable
        rows={['ε', 'A']}
        cols={['ε', 'B']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const hdrNodes = Array.from(container.querySelectorAll('text.dp-hdr-val'));
    expect(hdrNodes.map((n) => visibleText(n))).toEqual(['ε', 'B', 'ε', 'A']);
    const valNodes = Array.from(container.querySelectorAll('text.dp-val'));
    expect(valNodes.map((n) => visibleText(n))).toEqual(['0', '0', '0', '1']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps every cell within the fixed viewBox bounds regardless of label length', () => {
    const { container } = render(
      <DpTable
        rows={['a-very-long-row-header-label', 'B']}
        cols={['a-very-long-column-header-label', 'C']}
        cells={[
          [0, 0],
          [0, 1],
        ]}
      />,
    );
    const svg = container.querySelector('svg.dp-svg');
    expect(svg).toBeTruthy();
    const viewBox = svg!.getAttribute('viewBox');
    expect(viewBox).toBeTruthy();
    const [, , vbW, vbH] = viewBox!.split(' ').map(Number);
    // The viewBox is sized purely from fixed cell/header constants (independent of label
    // length) — 2 cols/2 rows must still map to the same small, bounded box.
    expect(vbW).toBeLessThan(300);
    expect(vbH).toBeLessThan(200);
  });
});

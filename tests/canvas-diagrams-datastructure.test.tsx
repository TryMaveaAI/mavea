import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataStructure } from '../src/canvas/blocks/diagrams/DataStructure';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: tree-node and linked-list-cell values are plain SVG text
// with no wrap or clip, centred inside a fixed-size circle/cell — the demo fixtures only ever
// used 1-2 digit numbers, so a longer value (a name, a hash, a multi-digit id) rendered far
// wider than its shape and bled into neighbouring nodes. Every rendered value must fit.

describe('DataStructure', () => {
  it('truncates a long linked-list value instead of letting it overflow the cell', () => {
    const { container } = render(
      <DataStructure
        title="Linked list"
        kind="linkedlist"
        cells={['short', 'a-very-long-node-value-12345']}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes).toHaveLength(2);
    // "short" (5 chars) already exceeds the tiny value-cell budget and must truncate too —
    // only a value at or under the budget may pass through untouched.
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(3);
    }
    expect(visibleText(valNodes[1]).endsWith('…')).toBe(true);
    // The untruncated string survives as a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('a-very-long-node-value-12345');
  });

  it('leaves a demo-sized (2-digit) linked-list value untouched', () => {
    const { container } = render(<DataStructure title="List" kind="linkedlist" cells={[42, 7]} />);
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes.map((n) => visibleText(n))).toEqual(['42', '7']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('truncates a long tree-node value instead of letting it overflow the node circle', () => {
    const { container } = render(
      <DataStructure
        title="Tree"
        kind="tree"
        nodes={[
          { id: 'n0', value: 'root-alpha-long', left: 'n1' },
          { id: 'n1', value: 99 },
        ]}
      />,
    );
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    expect(valNodes).toHaveLength(2);
    for (const node of valNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(3);
    }
    const longNode = valNodes.find((n) => visibleText(n).endsWith('…'));
    expect(longNode).toBeTruthy();
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('root-alpha-long');
  });

  it('leaves a demo-sized (2-digit) tree value untouched', () => {
    const { container } = render(<DataStructure title="Tree" kind="tree" level={[50, 25]} />);
    const valNodes = Array.from(container.querySelectorAll('text.dst-val'));
    // In-order placement draws the left child before the root, so DOM order tracks x-position,
    // not level order — compare as a set.
    expect(new Set(valNodes.map((n) => visibleText(n)))).toEqual(new Set(['50', '25']));
    expect(container.querySelector('title')).toBeNull();
  });
});

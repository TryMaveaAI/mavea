import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BinaryTree } from '../src/canvas/blocks/diagrams/BinaryTree';
import type { BinaryTreeNode } from '../src/canvas/blocks/diagrams/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: node-value labels were plain SVG text with no wrap or
// clip against the 32px-diameter node circle (NODE_R=16). Font-size only dropped from 11px to
// 9px for values over 2 characters, with no further scaling or truncation — a longer node value
// (e.g. a real BST key or a multi-digit number) rendered wider than its circle and visually
// collided with neighbouring nodes.

const smallTree: BinaryTreeNode[] = [
  { id: 'a', value: 8, left: 'b', right: 'c' },
  { id: 'b', value: 3 },
  { id: 'c', value: 10 },
];

function longValueTree(): BinaryTreeNode[] {
  return [
    { id: 'a', value: 'Warehouse', left: 'b', right: 'c' },
    { id: 'b', value: 'Distribution' },
    { id: 'c', value: 42 },
  ];
}

describe('BinaryTree', () => {
  it('shrinks and truncates a node value too long for its circle instead of letting it overflow', () => {
    const { container } = render(<BinaryTree title="BST" nodes={longValueTree()} root="a" />);
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    expect(labels).toHaveLength(3);

    // Every rendered label's visible glyphs must fit a conservative character budget for the
    // 32px node circle — the old fixed 9px/11px switch let "Warehouse"/"Distribution" bleed
    // far wider than the node and collide with its siblings.
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }

    // Long values get a smaller font than the 2-char-or-fewer default (11px).
    const warehouse = labels.find((n) => visibleText(n).startsWith('Wareh'))!;
    expect(warehouse).toBeTruthy();
    expect(Number(warehouse.getAttribute('font-size'))).toBeLessThan(9);

    // The full value is preserved via a native <title> tooltip, so nothing is silently lost.
    const titles = Array.from(container.querySelectorAll('text.dg-bt-label title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Warehouse');
    expect(titles).toContain('Distribution');
  });

  it('leaves short node values untouched at full size with no tooltip', () => {
    const { container } = render(<BinaryTree title="BST" nodes={smallTree} root="a" />);
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    // Inorder traversal (left, self, right) places the left child before the root.
    expect(labels.map((n) => visibleText(n))).toEqual(['3', '8', '10']);
    for (const node of labels) {
      expect(Number(node.getAttribute('font-size'))).toBe(11);
    }
    expect(container.querySelector('text.dg-bt-label title')).toBeNull();
  });

  it('keeps every node circle within the tree viewBox at a larger node count', () => {
    // A wider/deeper tree than the two-level demo fixture, to catch layout regressions too.
    const nodes: BinaryTreeNode[] = [];
    const n = 15; // a full 4-level binary tree
    for (let i = 0; i < n; i++) {
      nodes.push({
        id: `n${i}`,
        value: `Item-${i}`,
        left: 2 * i + 1 < n ? `n${2 * i + 1}` : undefined,
        right: 2 * i + 2 < n ? `n${2 * i + 2}` : undefined,
      });
    }
    const { container } = render(<BinaryTree title="Heap" nodes={nodes} root="n0" />);
    const svg = container.querySelector('svg.dg-bt-svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const circles = Array.from(container.querySelectorAll('circle.dg-bt-node'));
    expect(circles).toHaveLength(n);
    for (const c of circles) {
      const g = c.closest('g')!;
      const [tx, ty] = g
        .getAttribute('transform')!
        .replace('translate(', '')
        .replace(')', '')
        .split(' ')
        .map(Number);
      const r = Number(c.getAttribute('r'));
      expect(tx - r).toBeGreaterThanOrEqual(0);
      expect(tx + r).toBeLessThanOrEqual(vbW);
      expect(ty - r).toBeGreaterThanOrEqual(0);
      expect(ty + r).toBeLessThanOrEqual(vbH);
    }

    // Long values in this bigger tree are still truncated to fit, never bleeding into siblings.
    const labels = Array.from(container.querySelectorAll('text.dg-bt-label'));
    for (const label of labels) {
      expect(visibleText(label).length).toBeLessThanOrEqual(6);
    }
  });
});

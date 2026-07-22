import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PhyloTree } from '../src/canvas/blocks/learn/PhyloTree';
import type { PhyloNode } from '../src/canvas/blocks/learn/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: the right-hand label gutter reserved for taxon names
// (labelPx) is capped at 150px regardless of how long the actual names are, but the tip <text>
// rendering the name was never clamped to that budget — the demo fixture's short names
// ("Orangutan", "Chimpanzee") fit, but a real phylogenetic tree's full binomial + subspecies
// names ("Panthera tigris tigris", "Tyrannosaurus rex osborni") ran well past their reserved
// gutter (capped once the longest name exceeds ~27 characters) and bled silently into the clade
// brackets / the card's right edge.

const W = 360; // must track PhyloTree.tsx's internal viewBox width

function longNameTree(): PhyloNode {
  return {
    children: [
      { name: 'Tyrannosaurus rex osborni maximus' },
      {
        children: [
          { name: 'Velociraptor mongoliensis parvus' },
          { name: 'Deinonychus antirrhopus ostromi' },
        ],
      },
    ],
  };
}

describe('PhyloTree', () => {
  it('truncates long taxon names instead of letting them overflow the label gutter', () => {
    const { container } = render(<PhyloTree title="Theropod relations" root={longNameTree()} />);

    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels).toHaveLength(3);

    // Every rendered tip label's visible glyphs must be short enough to fit the reserved 150px
    // gutter at the class's 10px font-size — none may be long enough to bleed past the card edge.
    for (const node of tipLabels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(27);
    }
    expect(tipLabels.every((n) => visibleText(n).endsWith('…'))).toBe(true);

    // The untruncated names are still available, via native <title> tooltips.
    const titles = Array.from(container.querySelectorAll('text.phy-tip-lbl title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Tyrannosaurus rex osborni maximus');
    expect(titles).toContain('Velociraptor mongoliensis parvus');
    expect(titles).toContain('Deinonychus antirrhopus ostromi');
  });

  it('never lays a tip label past the SVG viewBox, even for a very long name', () => {
    const root: PhyloNode = {
      children: [{ name: 'Supercalifragilisticexpialidocious species name' }, { name: 'Short' }],
    };
    const { container } = render(<PhyloTree title="Extreme name" root={root} />);
    const svg = container.querySelector('svg.phy-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')!.startsWith(`0 0 ${W} `)).toBe(true);

    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels).toHaveLength(2);
    // The reserved gutter is capped at 150px regardless of name length, so every tip label's x
    // origin must sit within the reserved gutter (never past the viewBox edge), and its rendered
    // char count must fit the same 150px-cap ceiling the fix derives it from.
    for (const node of tipLabels) {
      const x = Number(node.getAttribute('x'));
      expect(x).toBeLessThan(W);
      expect(visibleText(node).length).toBeLessThanOrEqual(27);
    }
    const longTip = tipLabels.find((n) => visibleText(n).endsWith('…'));
    expect(longTip).toBeTruthy();
    expect(longTip!.querySelector('title')?.textContent).toBe(
      'Supercalifragilisticexpialidocious species name',
    );
  });

  it('leaves short taxon names (the demo-fixture shape) untouched', () => {
    const root: PhyloNode = {
      children: [
        { name: 'Orangutan' },
        {
          children: [
            { name: 'Gorilla' },
            { children: [{ name: 'Human' }, { name: 'Chimpanzee' }] },
          ],
        },
      ],
    };
    const { container } = render(<PhyloTree title="Great apes" root={root} />);
    const tipLabels = Array.from(container.querySelectorAll('text.phy-tip-lbl'));
    expect(tipLabels.map((n) => n.textContent)).toEqual([
      'Orangutan',
      'Gorilla',
      'Human',
      'Chimpanzee',
    ]);
    expect(container.querySelector('text.phy-tip-lbl title')).toBeNull();
  });
});

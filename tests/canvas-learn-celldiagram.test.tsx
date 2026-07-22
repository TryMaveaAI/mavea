import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CellDiagram } from '../src/canvas/blocks/learn/CellDiagram';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: organelle labels are plain SVG <text> drawn at fixed,
// hand-tuned anchor coordinates on a fixed 320×230 canvas with no width check — a model-authored
// `label` override longer than the preset names ("Nucleus", "Golgi apparatus") ran past the
// gutter/card edge instead of staying inside the diagram.

describe('CellDiagram', () => {
  it('truncates a label override longer than the demo fixture instead of letting it overflow', () => {
    const longLabel = 'Rough Endoplasmic Reticulum With Attached Ribosomes';
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={[{ key: 'golgi', label: longLabel }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    expect(labelNodes).toHaveLength(1);
    // The visible glyphs must stay short enough to fit the gutter at the label's font-size —
    // the untruncated 52-char override rendered far past the card edge before the fix.
    expect(visibleText(labelNodes[0]).length).toBeLessThanOrEqual(20);
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The full text is preserved, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short label untouched', () => {
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={[{ key: 'nucleus' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    expect(labelNodes.map(visibleText)).toEqual(['Nucleus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('renders every resolvable organelle for a cell type without label collisions or an empty diagram', () => {
    // The full animal-eligible set (all 'both' + 'animal'-only glyphs) — the largest count the
    // preset library can ever resolve to, since GLYPHS is a fixed catalog and duplicates are
    // deduped. Every anchor is hand-placed by the component, so at full occupancy no two labels
    // should land on the same point.
    const allAnimalKeys = [
      'nucleus',
      'nucleolus',
      'mitochondria',
      'er',
      'golgi',
      'ribosomes',
      'vacuole',
      'lysosome',
      'centrosome',
      'cytoplasm',
      'membrane',
    ];
    const { container } = render(
      <CellDiagram title="Cell" cellType="animal" parts={allAnimalKeys.map((key) => ({ key }))} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.cel-label'));
    // 'cytoplasm' and 'membrane' are label-only entries that still get a leader + label, so
    // every requested key produces exactly one label.
    expect(labelNodes).toHaveLength(allAnimalKeys.length);
    const positions = labelNodes.map((n) => `${n.getAttribute('x')},${n.getAttribute('y')}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('stays within the fixed diagram viewBox regardless of label length', () => {
    const { container } = render(
      <CellDiagram
        title="Cell"
        cellType="plant"
        parts={[
          { key: 'chloroplast', label: 'Chloroplasts Performing Photosynthesis Constantly' },
          { key: 'vacuole', label: 'The Large Central Storage Vacuole' },
        ]}
      />,
    );
    const svg = container.querySelector('svg.cel-svg');
    expect(svg).toBeTruthy();
    // The viewBox is the fixed 320×230 canvas plus its gutters — unchanged by label content,
    // since truncation (not rescaling) is what keeps long labels inside it.
    expect(svg?.getAttribute('viewBox')).toBe('-42 0 372 230');
  });
});

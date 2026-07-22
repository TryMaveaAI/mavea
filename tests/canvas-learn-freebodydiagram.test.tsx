import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FreeBodyDiagram } from '../src/canvas/blocks/learn/FreeBodyDiagram';
import type { FBDForce } from '../src/canvas/blocks/learn/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
// Same helper as the EtymTree regression test (same truncate-with-tooltip idiom).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: force labels are placed at a fixed offset beyond the
// arrowhead with no wrap and no width check. A model-authored label longer than the demo
// fixture's ("Weight", "Normal") — or several forces packed around the same small object —
// used to run past the SVG viewBox edge and collide with neighbouring labels/arrows.

describe('FreeBodyDiagram', () => {
  it('truncates a long force label instead of letting it overflow the diagram', () => {
    const forces: FBDForce[] = [
      { label: 'Applied horizontal friction force', angle: 0, magnitude: 12 },
    ];
    const { container } = render(<FreeBodyDiagram title="Block on a ramp" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(1);
    // No rendered label's visible glyphs may run longer than the character budget the
    // component truncates to — an unbounded string is what caused the overflow.
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still available, via a native <title> tooltip — nothing is
    // silently lost, it's just not painted wider than the diagram.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Applied horizontal friction force');
  });

  it('leaves a short force label untouched', () => {
    const forces: FBDForce[] = [
      { label: 'Weight', angle: 270, magnitude: 10 },
      { label: 'Normal', angle: 90, magnitude: 10 },
    ];
    const { container } = render(<FreeBodyDiagram title="Block at rest" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(2);
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Weight', 'Normal']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('renders many forces around the same object with no label exceeding the char budget', () => {
    // More forces than any demo fixture uses — every one still needs a legible, bounded label.
    const forces: FBDForce[] = [
      { label: 'Gravitational pull downward', angle: 270, magnitude: 10 },
      { label: 'Normal reaction from surface', angle: 90, magnitude: 10 },
      { label: 'Applied push to the right', angle: 0, magnitude: 8 },
      { label: 'Kinetic friction opposing motion', angle: 180, magnitude: 3 },
      { label: 'Air resistance drag force', angle: 200, magnitude: 2 },
      { label: 'Tension', angle: 45, magnitude: 6 },
    ];
    const { container } = render(<FreeBodyDiagram title="Crowded object" forces={forces} />);
    const labelNodes = Array.from(container.querySelectorAll('text.fbd-lbl'));
    expect(labelNodes).toHaveLength(forces.length);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    // The SVG itself stays fixed-size (overflow containment lives at the viewBox/CSS level);
    // labels must fit within it rather than growing it.
    const svg = container.querySelector('svg.fbd-svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 420 340');
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { OrbitDiagram } from '../src/canvas/blocks/media/OrbitDiagram';
import type { OrbitBody } from '../src/canvas/blocks/media/types';

// Regression coverage for a real bug: a body label's anchor point was pushed outward from its
// body by a fixed 4 SVG-unit offset that has no notion of text width, so a name longer than the
// "Mercury"/"Venus"-length demo fixture (~7 chars) — or a system with more bodies than the demo's
// 8-planet fixture, forcing rings closer together — rendered wide enough to overflow into a
// neighboring body's space. A <title> tooltip nested inside a <text> node is part of its DOM
// textContent too, so reading the actually-rendered glyphs means the node's own direct text
// children, not the <title>'s (mirrors EtymTree's / SportsPitch's helper).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

function labelNodes(container: HTMLElement) {
  return Array.from(container.querySelectorAll('text.orb-body-lbl'));
}

describe('OrbitDiagram', () => {
  it('truncates a long body name instead of letting its label overflow toward a neighbor', () => {
    const bodies: OrbitBody[] = [
      { name: 'Trappist-1e', orbitRadius: 0.4, distance: '0.4 AU' },
      { name: 'Kepler-452b', orbitRadius: 1.0, distance: '1.0 AU' },
    ];
    const { container } = render(<OrbitDiagram title="Exoplanets" center="Star" bodies={bodies} />);
    const labels = labelNodes(container);
    expect(labels).toHaveLength(2);
    for (const node of labels) {
      const rendered = visibleText(node);
      // Visible glyphs must be short enough that neighboring labels at the ring spacing used
      // here can't collide — the old unbounded fixed-offset label had no such ceiling.
      expect(rendered.length).toBeLessThanOrEqual(9);
    }
    expect(visibleText(labels[0])).toBe('Trappist…');
    expect(visibleText(labels[1])).toBe('Kepler-4…');
    // The untruncated names are still present, via native <title> tooltips — never silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Trappist-1e');
    expect(titles).toContain('Kepler-452b');
  });

  it('leaves short body names untouched', () => {
    const bodies: OrbitBody[] = [
      { name: 'Mercury', orbitRadius: 0.39, distance: '0.39 AU' },
      { name: 'Venus', orbitRadius: 0.72, distance: '0.72 AU' },
    ];
    const { container } = render(
      <OrbitDiagram title="Inner planets" center="Sun" bodies={bodies} />,
    );
    const labels = labelNodes(container).map((n) => visibleText(n));
    expect(labels).toEqual(['Mercury', 'Venus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps every label within the diagram frame even with more bodies than the demo fixture', () => {
    // 12 bodies — beyond the 8-entry ANGLES cycle and the 8-planet demo fixture — packed onto
    // rings that get proportionally closer together as count grows.
    const bodies: OrbitBody[] = Array.from({ length: 12 }, (_, i) => ({
      name: `Planetesimal-${i}`,
      orbitRadius: 0.3 + i * 0.25,
      distance: `${(0.3 + i * 0.25).toFixed(2)} AU`,
    }));
    const { container } = render(
      <OrbitDiagram title="Crowded system" center="Star" bodies={bodies} />,
    );
    const labels = labelNodes(container);
    expect(labels).toHaveLength(12);
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(9);
    }
    // Every label anchor must stay inside the 0..200 viewBox — no coordinate escapes the frame.
    for (const node of labels) {
      const x = Number(node.getAttribute('x'));
      const y = Number(node.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    }
  });
});

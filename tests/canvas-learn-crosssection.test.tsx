import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CrossSection } from '../src/canvas/blocks/learn/CrossSection';
import type { CrossLayer } from '../src/canvas/blocks/learn/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for two real bugs: concentric ring labels used a fixed 18-unit vertical
// step per ring, which ran labels off the bottom of the 240-unit viewBox once there were 8+
// layers; and horizontal band labels had no width constraint, so a layer name longer than the
// demo fixture's ("Crust", "Epidermis") ran past the 320-unit viewBox's right edge.

function layers(n: number, longNames = false): CrossLayer[] {
  return Array.from({ length: n }, (_, i) => ({
    name: longNames ? `Sedimentary Layer Formation Type ${i + 1}` : `Layer ${i + 1}`,
    thickness: 10 + i,
  }));
}

describe('CrossSection — concentric orientation', () => {
  it('spreads ring labels within the viewBox instead of a fixed step that runs off the bottom', () => {
    const { container } = render(
      <CrossSection title="Planet interior" orientation="concentric" layers={layers(9)} />,
    );
    const svg = container.querySelector('svg.lr-xs-svg--ring')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const vbHeight = viewBox[3];

    const labels = Array.from(container.querySelectorAll('text.lr-xs-ring-lbl'));
    expect(labels).toHaveLength(9);
    // Every label's y must land inside the viewBox — the old fixed 18-unit-per-ring step put
    // the last of 9 labels at y = 10 + 8*18 = 154 off a 240 box's usable band, but a denser
    // fixture (12+) exposed it running past the edge entirely.
    for (const label of labels) {
      const y = Number(label.getAttribute('y'));
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(vbHeight);
    }
    // No two adjacent labels may collide (share the same y): with dynamic spacing the step
    // shrinks but never collapses to zero.
    const ys = labels.map((l) => Number(l.getAttribute('y')));
    const uniqueYs = new Set(ys);
    expect(uniqueYs.size).toBe(ys.length);
  });

  it('truncates a long ring label instead of letting it overflow, preserving the full name via title', () => {
    const { container } = render(
      <CrossSection
        title="Planet interior"
        orientation="concentric"
        layers={[{ name: 'Upper Mantle Transition Zone', thickness: 10 }]}
      />,
    );
    const label = container.querySelector('text.lr-xs-ring-lbl')!;
    expect(visibleText(label).length).toBeLessThanOrEqual(16);
    expect(visibleText(label).endsWith('…')).toBe(true);
    expect(label.querySelector('title')?.textContent).toBe('Upper Mantle Transition Zone');
  });
});

describe('CrossSection — horizontal orientation', () => {
  it('truncates a band label longer than the available width instead of overflowing the viewBox', () => {
    const { container } = render(
      <CrossSection title="Earth's crust" orientation="horizontal" layers={layers(3, true)} />,
    );
    const svg = container.querySelector('svg.lr-xs-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const vbWidth = viewBox[2];

    const names = Array.from(container.querySelectorAll('text.lr-xs-band-name'));
    expect(names).toHaveLength(3);
    for (const name of names) {
      const x = Number(name.getAttribute('x'));
      // Rough width estimate: bold 12px SVG text averages ~7.5px/char. The visible (truncated)
      // text plus its x-origin must stay inside the viewBox — the untruncated 40+ char names in
      // this fixture would have run roughly 300px past a 320-unit viewBox before the fix.
      const estWidth = visibleText(name).length * 7.5;
      expect(x + estWidth).toBeLessThanOrEqual(vbWidth);
      // Full text preserved via native tooltip.
      expect(name.querySelector('title')?.textContent).toMatch(/^Sedimentary Layer Formation/);
    }
  });

  it('leaves a short band label untouched with no tooltip', () => {
    const { container } = render(
      <CrossSection title="Earth's crust" orientation="horizontal" layers={layers(2)} />,
    );
    const names = Array.from(container.querySelectorAll('text.lr-xs-band-name'));
    expect(names.map((n) => visibleText(n))).toEqual(['Layer 1', 'Layer 2']);
    expect(container.querySelector('.lr-xs-band-name title')).toBeNull();
  });
});

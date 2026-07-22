import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CircuitDiagram } from '../src/canvas/blocks/diagrams/CircuitDiagram';
import type {
  CircuitComponent,
  CircuitKind,
  CircuitWire,
} from '../src/canvas/blocks/diagrams/types';

// Regression coverage for a real bug: component labels sat at a fixed y=-8 offset regardless of
// glyph kind, so a taller glyph (ground's lead runs to y=-7, battery/bulb to y=-5) or a longer
// label than the small demo fixture used collided with the glyph itself or bled outside the
// SVG's fixed viewBox (`-10 -15 120 130`). Every rendered label must clear its own glyph and stay
// inside that viewBox regardless of label length or which kind it annotates.

const VIEWBOX_MIN_Y = -15;

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

const ALL_KINDS: CircuitKind[] = [
  'battery',
  'resistor',
  'capacitor',
  'bulb',
  'switch',
  'ground',
  'node',
];

function circuit(labels: Partial<Record<CircuitKind, string>> = {}): {
  components: CircuitComponent[];
  wires: CircuitWire[];
} {
  const components: CircuitComponent[] = ALL_KINDS.map((kind, i) => ({
    id: `c${i}`,
    kind,
    x: 10 + i * 14,
    y: 50,
    label: labels[kind] ?? `${kind} label`,
  }));
  const wires: CircuitWire[] = components.slice(1).map((c, i) => ({
    from: components[i].id,
    to: c.id,
  }));
  return { components, wires };
}

describe('CircuitDiagram', () => {
  it('clears every glyph kind with a per-kind label offset instead of one fixed y', () => {
    const { container } = render(<CircuitDiagram title="Circuit" {...circuit()} />);
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    expect(labelNodes).toHaveLength(ALL_KINDS.length);

    // The old fixed y=-8 sat inside the tallest glyphs (ground's lead reaches y=-7, battery/bulb
    // reach y=-5): every label's y must clear its own glyph's top edge, and the offsets must not
    // all collapse to the same fixed value once more than one glyph kind is present.
    const ys = labelNodes.map((n) => Number(n.getAttribute('y')));
    expect(new Set(ys).size).toBeGreaterThan(1);
    // ground's own top edge is y=-7 (its lead runs highest of every glyph); a fixed y=-8 offset
    // only barely cleared it, so any per-kind offset shallower than that regresses the bug.
    const groundY = Number(labelNodes[ALL_KINDS.indexOf('ground')]?.getAttribute('y'));
    expect(groundY).toBeLessThanOrEqual(-8);
    for (const y of ys) {
      // Must stay inside the SVG's fixed viewBox, however tall the glyph.
      expect(y).toBeGreaterThanOrEqual(VIEWBOX_MIN_Y);
    }
  });

  it('truncates a label longer than the demo fixture instead of letting it overflow', () => {
    const longLabel = 'R₁ = 4.7 kilohm precision resistor';
    const { container } = render(
      <CircuitDiagram title="Circuit" {...circuit({ resistor: longLabel })} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    // Every rendered label's visible text must stay within a bounded character budget so it
    // can't collide with neighbouring glyphs once components are packed at ~14 units apart.
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    const truncated = labelNodes.find((n) => visibleText(n).endsWith('…'));
    expect(truncated).toBeTruthy();
    // The untruncated string is preserved via a native <title> tooltip, same idiom as EtymTree.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short label untouched with no tooltip', () => {
    const components: CircuitComponent[] = [
      { id: 'b1', kind: 'battery', x: 20, y: 50, label: '9V' },
    ];
    const { container } = render(
      <CircuitDiagram title="Circuit" components={components} wires={[]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.dg-cir-lbl'));
    expect(labelNodes.map(visibleText)).toEqual(['9V']);
    expect(container.querySelectorAll('title')).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProtocolStack } from '../src/canvas/blocks/diagrams/ProtocolStack';
import type { ProtocolLayer, ProtocolPacketField } from '../src/canvas/blocks/diagrams/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: each nested encapsulation box shrinks with depth, but its
// label keeps a fixed font-size (.pst-box-lbl / .pst-box-lbl--inner) — so a header name longer
// than the demo fixture's short ones ("Ethernet", "IP", "TCP"…) overflowed the box at the
// innermost, most cramped depths, exactly where there is the least room to spare.

const LAYERS: ProtocolLayer[] = [{ name: 'Application' }, { name: 'Transport' }];

function longPacket(n: number): ProtocolPacketField[] {
  // Every header is long — including the innermost "payload" — so the tightest budget (the
  // last, smallest box) is exercised the same as every other depth.
  return Array.from({ length: n }, (_, i) => ({
    header: `Extremely Long Header Name ${i}`,
  }));
}

describe('ProtocolStack', () => {
  it.each([2, 3, 5, 8])(
    'truncates every encapsulation label to fit its box at %i nested headers',
    (n) => {
      const { container } = render(
        <ProtocolStack title="Stack" layers={LAYERS} packet={longPacket(n)} />,
      );
      const boxes = Array.from(container.querySelectorAll<SVGGElement>('.pst-box'));
      expect(boxes).toHaveLength(n);

      boxes.forEach((box, i) => {
        const rect = box.querySelector('rect')!;
        const size = Number(rect.getAttribute('width'));
        const label = box.querySelector('text.pst-box-lbl')!;
        const inner = box.classList.contains('pst-box--inner');
        const fontSize = inner ? 5 : 4.2;
        // Same budget formula the component uses: no rendered label may be wide enough (at its
        // class's font-size) to plausibly overflow its own box width.
        const maxChars = Math.max(2, Math.floor((size * 0.92) / (fontSize * 0.62)));
        const text = visibleText(label);
        expect(text.length).toBeLessThanOrEqual(maxChars);
        // The full header always survives the truncation, either verbatim or via a tooltip.
        const original = longPacket(n)[i].header;
        if (text !== original) {
          expect(text.endsWith('…')).toBe(true);
          const title = label.querySelector('title');
          expect(title?.textContent).toBe(original);
        }
      });
    },
  );

  it('leaves short headers untouched and adds no tooltip', () => {
    const { container } = render(
      <ProtocolStack
        title="Stack"
        layers={LAYERS}
        packet={[{ header: 'IP' }, { header: 'TCP' }, { header: 'Data' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.pst-box-lbl'));
    expect(labels.map((l) => visibleText(l))).toEqual(['IP', 'TCP', 'Data']);
    expect(container.querySelector('.pst-encaps title')).toBeNull();
  });

  it('truncates the innermost payload label even when only the payload name is long', () => {
    // The exact shape from the shipped demo fixture: short header chain, but the innermost
    // "payload" field carries a longer, human-readable label ("Your request").
    const { container } = render(
      <ProtocolStack
        title="Stack"
        layers={LAYERS}
        packet={[
          { header: 'Ethernet' },
          { header: 'IP' },
          { header: 'TCP' },
          { header: 'HTTP' },
          { header: 'Your request' },
        ]}
      />,
    );
    const inner = container.querySelector('.pst-box--inner rect')!;
    const size = Number(inner.getAttribute('width'));
    const label = container.querySelector('.pst-box--inner text.pst-box-lbl')!;
    const maxChars = Math.max(2, Math.floor((size * 0.92) / (5 * 0.62)));
    const text = visibleText(label);
    expect(text.length).toBeLessThanOrEqual(maxChars);
    expect(text.length).toBeLessThan('Your request'.length);
    expect(label.querySelector('title')?.textContent).toBe('Your request');
  });
});

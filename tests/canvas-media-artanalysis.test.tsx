import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ArtAnalysis } from '../src/canvas/blocks/media/ArtAnalysis';
import type { ArtRegion } from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage: region labels were drawn at a hardcoded x+2.5/y+6.5 offset with no
// maximum-width constraint, so a longer label (or a smaller/closely-packed region box) rendered
// far wider than its box and overflowed into the neighbouring region. Every rendered label must
// fit inside its own region box at .art-region-lbl's font-size.

describe('ArtAnalysis', () => {
  it('truncates a region label that is longer than its box instead of letting it overflow', () => {
    const regions: ArtRegion[] = [
      // A small box paired with a long label — exactly the case the demo fixture never exercises.
      { x: 10, y: 10, w: 12, h: 10, label: 'The Weeping Figure in the Lower-Left Foreground' },
      { x: 60, y: 60, w: 10, h: 10, label: 'Ok' },
    ];
    const { container } = render(<ArtAnalysis title="Composition" regions={regions} />);

    const labels = Array.from(container.querySelectorAll('text.art-region-lbl'));
    expect(labels).toHaveLength(2);

    const boxes = Array.from(container.querySelectorAll('rect.art-region-box'));
    expect(boxes).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own box width (in viewBox
    // units, at ~2.6px average glyph advance for the 4.4px bold face) — no fixed/unbounded text.
    labels.forEach((node, i) => {
      const boxW = Number(boxes[i].getAttribute('width'));
      const maxChars = Math.max(3, Math.floor((boxW - 5) / 2.6));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long label was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('The Weeping Figure in the Lower-Left Foreground');
  });

  it('leaves a short region label untouched', () => {
    const regions: ArtRegion[] = [{ x: 20, y: 20, w: 30, h: 20, label: 'Subject' }];
    const { container } = render(<ArtAnalysis title="Composition" regions={regions} />);
    const label = container.querySelector('text.art-region-lbl');
    expect(label?.textContent).toBe('Subject');
    expect(container.querySelector('title')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FloorPlan } from '../src/canvas/blocks/media/FloorPlan';
import type { FloorRoom } from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage: room names were only truncated when `room.w < 20`, with a fixed 10-char
// cutoff regardless of the room's actual width. A moderately long name (>15 chars) in a
// medium-width room (20-40 units, well past the old gate) rendered at full length, wider than
// the room rect, and visually bled past its walls — the exact bug class already fixed for
// TamSam/Treemap-adjacent SVG labels (ArtAnalysis, ConfusionMatrix, EtymTree): budget the
// truncation from the box's own width, not a single hardcoded cutoff.

describe('FloorPlan', () => {
  it('truncates a moderately long room name in a medium-width room instead of overflowing it', () => {
    const rooms: FloorRoom[] = [
      // 21 chars, w=30 — clears the old "w < 20" gate untouched, which was the bug: at
      // fontSize 3 a 21-char name is far wider than a 30-unit-wide room.
      { name: 'Primary Bedroom Suite', x: 5, y: 5, w: 30, h: 25 },
      // Short name, medium room — must render untouched.
      { name: 'Office', x: 40, y: 5, w: 30, h: 25 },
    ];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);

    const labels = Array.from(container.querySelectorAll('text.fp-room-name'));
    expect(labels).toHaveLength(2);

    const boxes = Array.from(container.querySelectorAll('rect.fp-room-rect'));
    expect(boxes).toHaveLength(2);

    // Every rendered label's visible glyph count must fit within its own room's width (in
    // viewBox units, at the label's own font-size) — no fixed-length/unbounded text.
    labels.forEach((node, i) => {
      const boxW = Number(boxes[i].getAttribute('width'));
      const fontSize = Number(node.getAttribute('font-size'));
      const maxChars = Math.max(3, Math.floor((boxW - 2) / (fontSize * 0.62)));
      expect(visibleText(node).length).toBeLessThanOrEqual(maxChars);
    });

    // The long name was actually shortened (with an ellipsis)...
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    // ...but the untruncated text survives as a native <title> tooltip, so nothing is lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Primary Bedroom Suite');

    // The short name in the same size room renders untouched, with no tooltip.
    expect(visibleText(labels[1])).toBe('Office');
  });

  it('leaves a short name in a narrow room untouched', () => {
    const rooms: FloorRoom[] = [{ name: 'Den', x: 5, y: 5, w: 15, h: 15 }];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);
    const label = container.querySelector('text.fp-room-name');
    expect(label?.textContent).toBe('Den');
    expect(container.querySelector('title')).toBeNull();
  });

  it('still truncates a long name in a genuinely narrow room, as before', () => {
    const rooms: FloorRoom[] = [{ name: 'Walk-In Closet Storage', x: 5, y: 5, w: 12, h: 30 }];
    const { container } = render(<FloorPlan title="Floor Plan" rooms={rooms} />);
    const label = container.querySelector('text.fp-room-name');
    expect(visibleText(label!).length).toBeLessThan('Walk-In Closet Storage'.length);
    expect(visibleText(label!).endsWith('…')).toBe(true);
  });
});

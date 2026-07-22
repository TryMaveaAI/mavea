import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BodyMap } from '../src/canvas/blocks/learn/BodyMap';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage: region labels render as plain SVG <text> at a fixed lx/ly with no width
// constraint (viewBox is only 120 wide). A long anatomical/custom label — well within what a
// caller can legitimately pass via `label` or the built-in guide names — would run past the
// viewBox edge or collide with a neighbouring label. Every rendered label must be capped to a
// character budget, with the untruncated text preserved via a native <title> tooltip.

describe('BodyMap', () => {
  it('truncates a long region label instead of letting it overflow the viewBox', () => {
    const longLabel = 'Left gastrocnemius and soleus complex';
    const { container } = render(
      <BodyMap title="Injury" regions={[{ id: 'leftShin', label: longLabel, note: 'Strain' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes).toHaveLength(1);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still available, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('leaves a short region label untouched', () => {
    const { container } = render(
      <BodyMap title="Injury" regions={[{ id: 'leftShin', label: 'Calf' }]} />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Calf']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('truncates every always-on guide label the same way when nothing is highlighted', () => {
    // GUIDE_SEGMENTS renders ~13 labels from a fixed SEGMENT_LABEL table — all short today, but
    // the truncation guard must hold for this path too since it shares the same render loop.
    const { container } = render(<BodyMap title="Body" />);
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label--muted'));
    expect(labelNodes.length).toBeGreaterThan(5);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
  });

  it('keeps multiple long labels from colliding by capping each to the same budget', () => {
    const { container } = render(
      <BodyMap
        title="Injury"
        regions={[
          { id: 'leftShoulder', label: 'Rotator cuff impingement syndrome' },
          { id: 'rightShoulder', label: 'Acromioclavicular joint sprain' },
          { id: 'chest', label: 'Costochondral junction inflammation' },
        ]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.bm-label'));
    expect(labelNodes).toHaveLength(3);
    for (const node of labelNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(14);
    }
  });
});

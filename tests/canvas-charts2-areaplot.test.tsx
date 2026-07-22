import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AreaPlot } from '../src/canvas/blocks/charts2/AreaPlot';
import type { AreaCurve } from '../src/canvas/blocks/charts2/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: the area read-out badge (.apl-area) is plain SVG <text>
// centred in the shaded region with no width constraint or wrapping, sized off the demo's short
// "area ≈ N" text. A long caller-supplied areaLabel — or a narrow integration interval, which
// shrinks the region's own pixel width — let the badge render wider than the shaded fill and
// bleed out past it. Every rendered badge must fit inside the region it's centred in.

function curve(): AreaCurve {
  return {
    label: 'f(x)',
    points: [
      { x: 0, y: 1 },
      { x: 2, y: 4 },
      { x: 4, y: 2 },
      { x: 6, y: 5 },
      { x: 8, y: 1 },
      { x: 10, y: 3 },
    ],
  };
}

describe('AreaPlot', () => {
  it('truncates a long areaLabel instead of letting the badge overflow the shaded region', () => {
    const longLabel = 'A Much Longer Symbolic Area Label Than The Demo Ever Used ∫ f(x) dx';
    const { container } = render(
      <AreaPlot
        title="Integral"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 0, x1: 10 }}
        areaLabel={longLabel}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();

    // The region here spans the full plot width, so this is a "long label" case: the visible
    // glyphs must be short enough to plausibly fit within the region's own pixel width at the
    // badge's font-size, not the raw ~68-character label.
    expect(visibleText(badge!).length).toBeLessThan(longLabel.length);
    expect(visibleText(badge!).endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('truncates even a short areaLabel when the integration interval narrows the region', () => {
    // Same short label the demo would use, but a narrow x0..x1 shrinks the shaded region to a
    // sliver — the label must still fit the region's actual pixel width, not just be "short".
    const label = 'area of narrow slice';
    const { container } = render(
      <AreaPlot
        title="Narrow slice"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 4.9, x1: 5.1 }}
        areaLabel={label}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();
    expect(visibleText(badge!).length).toBeLessThan(label.length);
    expect(visibleText(badge!).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(label);
  });

  it('leaves a short areaLabel untouched when the region is wide enough', () => {
    const label = 'area ≈ 24';
    const { container } = render(
      <AreaPlot
        title="Integral"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 0, x1: 10 }}
        areaLabel={label}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();
    expect(visibleText(badge!)).toBe(label);
    expect(container.querySelector('title')).toBeNull();
  });
});

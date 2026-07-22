import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DotPlot } from '../src/canvas/blocks/charts2/DotPlot';

// Regression coverage for a real bug: the hover "×N" count badge above a stack of duplicate
// values was positioned with a fixed top margin that never accounted for the badge's own
// height. The badge for the tallest stack always rendered at a fixed negative y (independent
// of stack height), floating above the SVG's y=0 boundary — with `overflow: visible` on the
// wrapping <svg>, that means visible clipping/overlap above the card on any data with 2+
// duplicate values, not just tall ones. The demo fixture used no duplicates at all, so this
// never surfaced there.

/** The hovered stack's count badge, if rendered. */
function badgeRect(container: HTMLElement) {
  return container.querySelector<SVGRectElement>('.ch2-dp-badge-bg');
}

describe('DotPlot', () => {
  it('keeps the hover count badge within the chart bounds for a tall duplicate stack', () => {
    // Far more duplicates at one value than the demo fixture (which has none) — this is the
    // shape that pushed the badge's fixed offset past the top of the viewBox.
    const values = [7, 7, 7, 7, 7, 7, 7, 7, 3, 12];
    const { container } = render(<DotPlot title="Scores" values={values} />);

    // Scope to the chart's own <svg> — the card-eyebrow icon is also an inline <svg>.
    const svg = container.querySelector('svg.ch2-dp-svg');
    expect(svg).toBeTruthy();
    const viewBox = svg!.getAttribute('viewBox')!.split(' ').map(Number);
    const svgH = viewBox[3];

    // Hover the <g> that owns the tallest stack (8 dots at the same cx) to reveal its badge.
    const groups = Array.from(svg!.querySelectorAll('g')).filter(
      (g) => g.querySelectorAll('.ch2-dp-dot').length === 8,
    );
    expect(groups).toHaveLength(1);
    fireEvent.mouseEnter(groups[0]);

    const badge = badgeRect(container);
    expect(badge).toBeTruthy();
    const badgeY = Number(badge!.getAttribute('y'));
    const badgeH = Number(badge!.getAttribute('height'));

    // The badge's top edge must not float above the chart's own top boundary (y=0 in its
    // local viewBox coordinates) — that's the illegible upward-overflow failure mode.
    expect(badgeY).toBeGreaterThanOrEqual(0);
    // And it must stay inside the chart's declared height, not just above zero.
    expect(badgeY + badgeH).toBeLessThanOrEqual(svgH);
  });

  it.each([2, 5, 12, 30])(
    'never floats the count badge above y=0 as the tallest stack grows to %i dots',
    (count) => {
      const values = Array.from({ length: count }, () => 4).concat([1, 9]);
      const { container } = render(<DotPlot title="Scores" values={values} />);

      const svg = container.querySelector('svg.ch2-dp-svg')!;
      const groups = Array.from(svg.querySelectorAll('g')).filter(
        (g) => g.querySelectorAll('.ch2-dp-dot').length === count,
      );
      expect(groups).toHaveLength(1);
      fireEvent.mouseEnter(groups[0]);

      const badge = badgeRect(container);
      expect(badge).toBeTruthy();
      expect(Number(badge!.getAttribute('y'))).toBeGreaterThanOrEqual(0);
    },
  );

  it('renders no badge for a stack with a single dot (nothing to overflow)', () => {
    const { container } = render(<DotPlot title="Scores" values={[1, 2, 3]} />);
    const svg = container.querySelector('svg.ch2-dp-svg')!;
    const groups = Array.from(svg.querySelectorAll('g')).filter(
      (g) => g.querySelectorAll('.ch2-dp-dot').length === 1,
    );
    expect(groups.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(groups[0]);
    expect(badgeRect(container)).toBeNull();
  });
});

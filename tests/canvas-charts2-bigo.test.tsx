import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BigO } from '../src/canvas/blocks/charts2/BigO';

// Regression coverage for a real bug: each curve's inline label rode a start-anchored <text>
// nudged a fixed +5px past its anchor point, which sits near the plot's right edge by design
// (the anchor is the curve's last in-view sample). Start-anchored text grows RIGHTWARD from
// that x, so the longer class labels ("O(n log n)", the widest of the six canonical strings)
// ran past the fixed 340×230 viewBox instead of staying inside the PAD_R gutter reserved for
// them. All six classes shown together is exactly the case that reproduces it — the demo
// fixture typically shows fewer.

const W = 340; // must track BigO.tsx's internal W — fixed-viewBox, not measured live.
const H = 230;

describe('BigO', () => {
  it('parks every curve label inside the fixed viewBox, even the longest class label', () => {
    const { container } = render(
      <BigO
        title="Growth rates"
        classes={['o-1', 'o-logn', 'o-n', 'o-nlogn', 'o-n2', 'o-2n']}
        maxN={16}
      />,
    );
    const svg = container.querySelector('svg.bgo-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);

    const labels = Array.from(container.querySelectorAll('text.bgo-curve-lbl'));
    // All six canonical classes, including "O(n log n)" — the widest label string.
    expect(labels).toHaveLength(6);
    expect(labels.map((l) => l.textContent)).toContain('O(n log n)');

    // End-anchored at a fixed right-edge margin: text grows LEFTWARD from x, so as long as x
    // itself never exceeds the viewBox width, no label can bleed past the right edge —
    // regardless of string length. This is what the old start-anchored + fixed nudge broke.
    for (const label of labels) {
      expect(label.getAttribute('text-anchor')).toBe('end');
      const x = Number(label.getAttribute('x'));
      expect(x).toBeLessThanOrEqual(W);
      expect(x).toBeGreaterThan(0);
    }
  });

  it('keeps a single short curve label anchored the same way, unbroken by the fix', () => {
    const { container } = render(<BigO title="Growth rates" classes={['o-1']} maxN={8} />);
    const labels = Array.from(container.querySelectorAll('text.bgo-curve-lbl'));
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe('O(1)');
    expect(labels[0].getAttribute('text-anchor')).toBe('end');
    expect(Number(labels[0].getAttribute('x'))).toBeLessThanOrEqual(W);
  });
});

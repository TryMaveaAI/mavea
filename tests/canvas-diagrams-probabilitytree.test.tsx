import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProbabilityTree } from '../src/canvas/blocks/diagrams/ProbabilityTree';
import type { ProbabilityBranch } from '../src/canvas/blocks/diagrams/types';

// Regression coverage for a real bug: the right-edge outcome label was left-anchored
// (`textAnchor="start"`, the SVG default) at a fixed x near the viewBox's right edge, so any
// outcome text wider than the small sliver of remaining room — a caller-supplied `outcome`
// string, or a computed probability with several decimal places — grew rightward and ran past
// the SVG viewBox instead of staying inside the card.

const VB_W = 560; // must track ProbabilityTree.tsx's VB_W — the SVG is a fixed viewBox.

function branches(outcome?: string): ProbabilityBranch[] {
  return [
    {
      label: 'Draw',
      prob: 0.123456789,
      children: [{ label: 'Ace', prob: 0.076923077, outcome }],
    },
  ];
}

describe('ProbabilityTree', () => {
  it('right-anchors the outcome label at the viewBox edge instead of overflowing rightward', () => {
    const { container } = render(
      <ProbabilityTree title="Odds" branches={branches('P = 0.00949317406...')} />,
    );
    const outcomeLabels = Array.from(container.querySelectorAll('text.dg-pt-outcome-lbl'));
    expect(outcomeLabels.length).toBeGreaterThan(0);

    for (const label of outcomeLabels) {
      // Right-anchored text grows leftward from its x, so its x must sit at (or inside) the
      // viewBox's right edge — the old start-anchored label instead grew rightward from x,
      // which is exactly how long text ran past VB_W.
      expect(label.getAttribute('text-anchor')).toBe('end');
      expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(VB_W);
    }
  });

  it('keeps a long computed probability outcome (many decimal places) inside the viewBox', () => {
    // No supplied `outcome` — falls through to the computed `P = parent × child` label, whose
    // formatting is bounded, but still sits at the same right-anchored x as any custom string.
    const { container } = render(<ProbabilityTree title="Odds" branches={branches()} />);
    const svg = container.querySelector('svg.dg-pt-svg')!;
    const [, , vbWidth] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const label = container.querySelector('text.dg-pt-outcome-lbl')!;
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(vbWidth);
    expect(label.textContent).toMatch(/^P = /);
  });

  it('matches the outcome column header to the same right-anchored edge', () => {
    const { container } = render(<ProbabilityTree title="Odds" branches={branches()} />);
    const header = Array.from(container.querySelectorAll('text.dg-pt-col-hdr')).find(
      (n) => n.textContent === 'Outcome',
    )!;
    expect(header).toBeTruthy();
    expect(header.getAttribute('text-anchor')).toBe('end');

    const outcomeLabel = container.querySelector('text.dg-pt-outcome-lbl')!;
    expect(header.getAttribute('x')).toBe(outcomeLabel.getAttribute('x'));
  });
});

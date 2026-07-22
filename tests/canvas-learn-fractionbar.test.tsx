import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FractionBar } from '../src/canvas/blocks/learn/FractionBar';

// Regression coverage for a real bug: the fraction label and decimal readout had no width
// constraint, so a caller-supplied label longer than the demo fixture's ("½", "¾", "⅔") or a
// large denominator overflowed the row and bled past the card edge instead of truncating.

const CONTAINER_WIDTH = 260; // narrower than a long label's natural rendered width

function renderConstrained(node: React.ReactElement) {
  return render(<div style={{ width: CONTAINER_WIDTH }}>{node}</div>);
}

describe('FractionBar', () => {
  it('constrains a long custom label to the row width instead of overflowing', () => {
    const longLabel = 'Probability of drawing a red marble from the bag on the first try';
    const { container } = renderConstrained(
      <FractionBar
        title="Long label"
        fractions={[{ numerator: 1, denominator: 8, label: longLabel }]}
      />,
    );
    const fraction = container.querySelector<HTMLElement>('.lr-fb-fraction');
    expect(fraction).toBeTruthy();
    expect(fraction!.textContent).toBe(longLabel);
    // The full text is preserved in the DOM (for a11y / copy), but the rendered box must be
    // capped and clipped rather than left to grow past its row.
    expect(fraction!.style.maxWidth).toBe('100%');
    expect(fraction!.style.overflow).toBe('hidden');
    expect(fraction!.style.textOverflow).toBe('ellipsis');
  });

  it('constrains a large denominator so the decimal readout does not overflow', () => {
    const { container } = renderConstrained(
      <FractionBar title="Large denominator" fractions={[{ numerator: 37, denominator: 97 }]} />,
    );
    const decimal = container.querySelector<HTMLElement>('.lr-fb-decimal');
    expect(decimal).toBeTruthy();
    expect(decimal!.style.maxWidth).toBe('100%');
    expect(decimal!.style.overflow).toBe('hidden');
    expect(decimal!.style.textOverflow).toBe('ellipsis');
  });

  it('scales past the demo fixture (3 rows) without any row losing its width cap', () => {
    const fractions = Array.from({ length: 10 }, (_, i) => ({
      numerator: i + 1,
      denominator: 97,
      label: `Extremely long descriptive row label number ${i + 1} for stress testing`,
    }));
    const { container } = renderConstrained(
      <FractionBar title="Many long rows" fractions={fractions} />,
    );
    const rows = container.querySelectorAll('.lr-fb-row');
    expect(rows).toHaveLength(10);
    const fractionSpans = container.querySelectorAll<HTMLElement>('.lr-fb-fraction');
    const decimalSpans = container.querySelectorAll<HTMLElement>('.lr-fb-decimal');
    expect(fractionSpans).toHaveLength(10);
    expect(decimalSpans).toHaveLength(10);
    for (const span of [...fractionSpans, ...decimalSpans]) {
      expect(span.style.maxWidth).toBe('100%');
      expect(span.style.overflow).toBe('hidden');
      expect(span.style.textOverflow).toBe('ellipsis');
    }
  });
});

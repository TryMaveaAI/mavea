import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Bubble } from '../src/canvas/blocks/charts2/Bubble';
import type { BubbleCategory, BubblePoint } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the hover tooltip (.c2-bub-tip) is `position: absolute`
// with `white-space: nowrap` and no width cap, sized only for the short demo-fixture labels.
// A real-world point label far longer than the fixture pushes the tooltip's rendered width out
// past any reasonable card boundary instead of truncating — illegible overflow, not a small
// alignment nit.

const categories: BubbleCategory[] = [{ name: 'Segment', color: 'var(--presence)' }];

function longLabelPoints(): BubblePoint[] {
  return [
    {
      label:
        'Enterprise Cloud Infrastructure Modernization & Multi-Region Disaster Recovery Program',
      x: 10,
      y: 20,
      size: 8,
      cat: 'Segment',
    },
    { label: 'Small deal', x: 30, y: 40, size: 4, cat: 'Segment' },
  ];
}

describe('Bubble', () => {
  it('caps the hover tooltip width and ellipsizes a long point label instead of overflowing', () => {
    const { container } = render(
      <Bubble title="Deals" categories={categories} points={longLabelPoints()} />,
    );
    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles).toHaveLength(2);

    // Hover the bubble carrying the very long label.
    fireEvent.mouseEnter(circles[0]);

    const tip = container.querySelector<HTMLElement>('.c2-bub-tip');
    expect(tip).toBeTruthy();
    // Inline maxWidth caps the tooltip box itself so it can't grow to fit an arbitrarily long
    // label — this is the exact dimension that was previously unconstrained.
    expect(tip!.style.maxWidth).toBe('200px');

    const labelEl = tip!.querySelector('b')!;
    expect(labelEl.textContent).toBe(longLabelPoints()[0].label);
    // The label itself must be set up to truncate rather than force the tooltip wider: hidden
    // overflow + ellipsis + a width ceiling relative to its (capped) container.
    expect(labelEl.style.overflow).toBe('hidden');
    expect(labelEl.style.textOverflow).toBe('ellipsis');
    expect(labelEl.style.whiteSpace).toBe('nowrap');
    expect(labelEl.style.maxWidth).toBe('100%');
  });

  it('still shows the short demo-fixture-sized label untruncated', () => {
    const { container } = render(
      <Bubble title="Deals" categories={categories} points={longLabelPoints()} />,
    );
    const circles = Array.from(container.querySelectorAll('circle'));
    fireEvent.mouseEnter(circles[1]);
    const tip = container.querySelector<HTMLElement>('.c2-bub-tip');
    expect(tip!.querySelector('b')!.textContent).toBe('Small deal');
  });
});

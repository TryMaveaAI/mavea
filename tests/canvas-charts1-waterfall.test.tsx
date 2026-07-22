import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Waterfall } from '../src/canvas/blocks/charts1/Waterfall';
import type { WaterfallStep } from '../src/canvas/blocks/charts1/types';

// Regression coverage for the waterfall cascade entrance: each bar must carry the
// .c1-waterfall-bar class (the shared stagger/glow animation in charts1/styles.css
// keys off it) and its own --bar-idx so the cascade reads left-to-right instead of
// every bar animating in unison. Also guards bar-width/slot sizing at a step count
// well past the demo fixture, so bars can't crowd into illegible overlap.

function steps(n: number): WaterfallStep[] {
  return [
    { label: 'Start', value: 100, total: true },
    ...Array.from({ length: n - 2 }, (_, i) => ({
      label: `Step ${i + 1}`,
      value: i % 2 === 0 ? 12 : -7,
    })),
    {
      label: 'End',
      value: 100 + Math.ceil((n - 2) / 2) * 12 - Math.floor((n - 2) / 2) * 7,
      total: true,
    },
  ];
}

describe('Waterfall', () => {
  it('stamps every bar with the cascade-entrance class and a unique --bar-idx stagger', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(6)} />);
    const bars = Array.from(container.querySelectorAll<SVGRectElement>('.c1-waterfall-bar'));
    expect(bars).toHaveLength(6);
    bars.forEach((bar, i) => {
      expect(bar.style.getPropertyValue('--bar-idx')).toBe(String(i));
    });
  });

  it('marks exactly one bar as salient for the glow beat', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(8)} />);
    const marked = container.querySelectorAll('.c1-waterfall-bar[data-mark="circle"]');
    expect(marked).toHaveLength(1);
  });

  it('keeps bars legible (non-degenerate width, no overlap) well past the demo fixture size', () => {
    // The demo fixture is a handful of steps; a real answer can run much longer. Bar width
    // and slot spacing must still keep every bar readable and non-overlapping.
    const n = 24;
    const { container } = render(<Waterfall title="Long bridge" steps={steps(n)} />);
    const bars = Array.from(container.querySelectorAll<SVGRectElement>('.c1-waterfall-bar'));
    expect(bars).toHaveLength(n);

    const spans = bars
      .map((bar) => {
        const x = Number(bar.getAttribute('x'));
        const width = Number(bar.getAttribute('width'));
        return { x, width };
      })
      .sort((a, b) => a.x - b.x);

    spans.forEach((s) => {
      // Every bar keeps a legible minimum width — it never collapses to a hairline.
      expect(s.width).toBeGreaterThanOrEqual(2);
    });
    for (let i = 1; i < spans.length; i++) {
      // Consecutive bars (sorted left-to-right) must not overlap horizontally.
      expect(spans[i].x).toBeGreaterThanOrEqual(spans[i - 1].x + spans[i - 1].width);
    }
  });

  it('dims non-hovered bars so the hovered one reads as the spotlighted datum', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(5)} />);
    const groups = Array.from(container.querySelectorAll<SVGGElement>('svg > g'));
    expect(groups).toHaveLength(5);

    fireEvent.mouseEnter(groups[1]);
    groups.forEach((g, i) => {
      expect(g.style.opacity).toBe(i === 1 ? '1' : '0.45');
    });

    fireEvent.mouseLeave(groups[1]);
    groups.forEach((g) => {
      expect(g.style.opacity).toBe('1');
    });
  });
});

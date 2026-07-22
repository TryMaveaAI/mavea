import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LifeWheel } from '../src/canvas/blocks/charts1/LifeWheel';
import type { LifeDomain } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a real bug: LifeWheel's on-spoke score labels used a fixed
// dx={3} dy={-4} offset regardless of where the spoke sat around the wheel, so on a
// crowded wheel (16+ domains) labels on the left side got shoved further into their
// neighbor instead of away from it, and the score node right at the top could get its
// label offset sideways past the card edge.

function domains(n: number): LifeDomain[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `Domain ${i + 1}`,
    score: 3 + (i % 8),
  }));
}

describe('LifeWheel', () => {
  it('renders one score label per domain even on a crowded (16-item) wheel', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(16)} />);
    const scores = container.querySelectorAll('.c1-lw-score');
    expect(scores).toHaveLength(16);
  });

  it('offsets score labels away from center instead of a fixed dx/dy — left- and right-side spokes diverge', () => {
    // Four domains: right (angle 90°), bottom (180°), left (270°), top (0°/360° wraps to i=0).
    // With even spacing across N=4: i=0 → 0° (top), i=1 → 90° (right), i=2 → 180° (bottom),
    // i=3 → 270° (left).
    const { container } = render(<LifeWheel title="Balance" domains={domains(4)} />);
    const scores = Array.from(container.querySelectorAll('.c1-lw-score'));
    expect(scores).toHaveLength(4);

    const rightLabel = scores[1]; // spoke pointing right of center
    const leftLabel = scores[3]; // spoke pointing left of center

    const rightDx = Number(rightLabel.getAttribute('dx'));
    const leftDx = Number(leftLabel.getAttribute('dx'));

    // The old fixed dx={3} pushed every label the same direction regardless of side, which
    // is exactly what crowds labels on the left half of the wheel into their spokes/neighbors.
    // A correct fix mirrors the sign so left-side labels point further left, right-side further right.
    expect(rightDx).toBeGreaterThan(0);
    expect(leftDx).toBeLessThan(0);
    expect(rightLabel.getAttribute('text-anchor')).toBe('start');
    expect(leftLabel.getAttribute('text-anchor')).toBe('end');
  });

  it('anchors a near-vertical spoke score label to the middle instead of drifting sideways', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(4)} />);
    const scores = Array.from(container.querySelectorAll('.c1-lw-score'));
    const topLabel = scores[0]; // spoke pointing straight up (x ≈ CX)

    expect(topLabel.getAttribute('text-anchor')).toBe('middle');
    expect(Number(topLabel.getAttribute('dx'))).toBe(0);
  });

  it('renders the legend rollup with matching score count regardless of item count', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(20)} />);
    expect(container.querySelectorAll('.c1-lw-leg')).toHaveLength(20);
    expect(container.querySelectorAll('.c1-lw-score')).toHaveLength(20);
  });
});

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkillTree } from '../src/canvas/blocks/flows/SkillTree';
import type { SkillNode } from '../src/canvas/blocks/flows/types';

// Regression coverage for a real bug: node buttons were capped at a fixed `max-width: 38%`,
// which only fit the 2-3-item-per-tier demo fixture. A tier with 4+ nodes (or a tier with
// long labels) needs each node's max-width to shrink with its actual band size, or adjacent
// buttons overlap illegibly.

function wideBand(n: number): SkillNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    label: `Skill ${i + 1} Long Name`,
    tier: 0,
    state: 'unlocked' as const,
  }));
}

describe('SkillTree', () => {
  it('shrinks each node max-width to its band share instead of a fixed 38%', () => {
    const { container } = render(<SkillTree title="Tree" nodes={wideBand(5)} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(5);
    for (const b of buttons) {
      const maxW = b.style.getPropertyValue('--max-node-w');
      expect(maxW).not.toBe('');
      const pct = parseFloat(maxW);
      // 5 nodes in one band: an even share is 20% each. A fixed 38% cap would let each
      // button claim nearly double its slot and collide with its neighbors.
      expect(pct).toBeLessThan(38);
      expect(pct).toBeGreaterThan(0);
    }
  });

  it('keeps a small band close to its old fixed-width footprint', () => {
    const { container } = render(<SkillTree title="Tree" nodes={wideBand(2)} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      const pct = parseFloat(b.style.getPropertyValue('--max-node-w'));
      // Two nodes share a row generously — the cap should stay well clear of overlap (< 50%
      // combined would guarantee no touch) while still being roomier than a crowded 5-up row.
      expect(pct).toBeLessThanOrEqual(50);
      expect(pct).toBeGreaterThan(20);
    }
  });

  it('never lets a node claim the whole band width, even with just one node in a tier', () => {
    const { container } = render(
      <SkillTree
        title="Tree"
        nodes={[{ id: 'solo', label: 'Solo Skill With A Very Long Descriptive Name', tier: 0 }]}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>('.fl-sk-node')!;
    const pct = parseFloat(button.style.getPropertyValue('--max-node-w'));
    // A lone node in a sparse band must still be floored well under 100% so its pill never
    // spans the full card edge-to-edge.
    expect(pct).toBeLessThanOrEqual(60);
  });

  it('sizes independent multi-tier bands by their own counts, not a shared global count', () => {
    const nodes: SkillNode[] = [
      ...wideBand(2).map((n) => ({ ...n, tier: 0 })),
      ...wideBand(6).map((n, i) => ({ ...n, id: `t1-${i}`, tier: 1 })),
    ];
    const { container } = render(<SkillTree title="Tree" nodes={nodes} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(8);
    const tier0Max = Math.max(
      ...buttons.slice(0, 2).map((b) => parseFloat(b.style.getPropertyValue('--max-node-w'))),
    );
    const tier1Max = Math.max(
      ...buttons.slice(2).map((b) => parseFloat(b.style.getPropertyValue('--max-node-w'))),
    );
    // The crowded 6-up tier must be capped tighter than the roomy 2-up tier.
    expect(tier1Max).toBeLessThan(tier0Max);
  });
});

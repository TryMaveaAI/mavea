import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas';
import { buildLiveSeed } from '../src/live/liveSeed';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

// TopicCanvas resolves extended blocks through the per-family loader (async chunks in the
// app). Tests assert on the same tick, so prime the merged registry — every lookup is then
// synchronous, exactly like the gallery.
primeExtendedRegistry(EXTENDED_REGISTRY);

/** Read a block's confidence label without assuming the union member. */
function conf(b: unknown): string | undefined {
  return (b as { props?: { conf?: string } }).props?.conf;
}

describe('live opening seed', () => {
  it('is a renderable sampler with several varied visuals, each spotlightable', () => {
    const seed = buildLiveSeed();
    expect(seed.blocks.length).toBeGreaterThanOrEqual(3);
    for (const b of seed.blocks) {
      expect(b.id).toBeTruthy(); // stable id → spotlightable
      expect(b.col).toBeGreaterThanOrEqual(1);
      expect(b.col).toBeLessThanOrEqual(12);
      // HONESTY: the opener is an illustration, never a "strong"/grounded claim.
      expect(conf(b)).not.toBe('strong');
    }
    expect(new Set(seed.blocks.map((b) => b.type)).size).toBeGreaterThanOrEqual(3);
  });

  it('renders through the real canvas without crashing', () => {
    const { container } = render(
      <TopicCanvas data={buildLiveSeed()} spot={null} built={{}} onProve={() => {}} />,
    );
    const grid = container.querySelector('.card-grid');
    expect(grid).not.toBeNull();
    expect(grid!.children.length).toBeGreaterThanOrEqual(3);
  });
});

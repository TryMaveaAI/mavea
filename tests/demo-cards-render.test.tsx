// Every card a recorded demo shows renders its own component. A baked session is real model
// output replayed as it happened, so a card that paints as its plain-text fallback, or as an
// empty-state notice, is either a renderer that cannot read a real shape or a shard to re-bake,
// and neither should reach a visitor.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';
import { loadDemoConversation } from '../src/demo/corpus';

primeExtendedRegistry(EXTENDED_REGISTRY);

const PERSONAS = ['dev', 'pm', 'student', 'traveler'];

describe('recorded demo cards', () => {
  it.each(PERSONAS)('%s: every frame renders each card as its own component', async (persona) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const frames = (await loadDemoConversation(persona))?.frames ?? [];
    expect(frames.length).toBeGreaterThan(0);
    const degraded: string[] = [];
    frames.forEach((frame, i) => {
      const { container, unmount } = render(
        <TopicCanvas data={frame.spec} spot={null} built={{}} onProve={() => {}} />,
      );
      expect(container.querySelectorAll('[data-spot-id]').length).toBe(frame.spec.blocks.length);
      for (const el of container.querySelectorAll('.fb-card, .cx-empty')) {
        const card = el.closest('[data-spot-id]');
        degraded.push(`frame ${i} ${card?.getAttribute('data-spot-id') ?? '?'} ${el.className}`);
      }
      unmount();
    });
    expect(degraded).toEqual([]);
  });
});

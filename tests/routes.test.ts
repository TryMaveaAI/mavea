import { describe, it, expect } from 'vitest';
import { routeFor } from '../src/routes';

// import.meta.env.DEV is true under vitest (mode 'test' !== 'production'), so this suite can
// assert the lab routes resolve here. Proving they're DROPPED from a production bundle is a
// build-time fact, not a runtime one — verified by building and checking dist/assets for the
// absence of the lab chunk names (WhyLab, SlidesLab, ExportLab, PageViewLab, SynthesisLab,
// ReelGallery), not by a unit test.
describe('routeFor', () => {
  it('maps every public hash prefix to a component', () => {
    const publicPrefixes = [
      '#/live',
      '#/dashboards',
      '#/flashcards',
      '#/gallery',
      '#/deepzoom',
      '#/courses',
      '#/synthesis',
      '#/prism',
      '#/ripple',
    ];
    for (const prefix of publicPrefixes) {
      expect(routeFor(prefix), `${prefix} should resolve`).not.toBeNull();
    }
  });

  it('matches a hash carrying extra path/query beyond the bare prefix', () => {
    expect(routeFor('#/live?tour=1')).not.toBeNull();
    expect(routeFor('#/deepzoom?q=black+holes')).not.toBeNull();
  });

  it('resolves the lab routes under a dev build (this test suite runs in dev mode)', () => {
    const labPrefixes = [
      '#/reel',
      '#/slidelab',
      '#/exportlab',
      '#/synlab',
      '#/pageviewlab',
      '#/whylab',
    ];
    for (const prefix of labPrefixes) {
      expect(routeFor(prefix), `${prefix} should resolve in dev`).not.toBeNull();
    }
  });

  it('falls through to null (the caller renders the landing) for an unknown hash', () => {
    expect(routeFor('')).toBeNull();
    expect(routeFor('#/')).toBeNull();
    expect(routeFor('#/nonsense')).toBeNull();
  });

  it('does not collide #/synthesis and #/synlab', () => {
    expect(routeFor('#/synthesis')).not.toBe(routeFor('#/synlab'));
  });
});

import { blockLabel } from '../src/canvas/blockLabel';
import type { Block } from '../src/data/conversation';

// blockLabel gives any block a short, human name for the "ask about this" affordance, the
// pinned-element chips, and the on-screen context the model receives.
describe('blockLabel', () => {
  it('uses the block heading when one is present', () => {
    expect(
      blockLabel({
        type: 'list',
        col: 12,
        props: { title: 'Revenue by region', items: [] },
      } as Block),
    ).toBe('Revenue by region');
  });

  it('falls through title → label, then to a friendly kind name', () => {
    expect(
      blockLabel({ type: 'bars', col: 6, props: { label: 'Costs' } } as unknown as Block),
    ).toBe('Costs');
    expect(blockLabel({ type: 'bars', col: 6, props: {} } as unknown as Block)).toBe('Bar chart');
  });

  it('falls back to the raw type for an unknown kind with no heading', () => {
    expect(blockLabel({ type: 'somethingNovel', col: 6, props: {} } as unknown as Block)).toBe(
      'somethingNovel',
    );
  });

  it('truncates an overlong heading with an ellipsis', () => {
    const out = blockLabel({
      type: 'list',
      col: 12,
      props: { title: 'x'.repeat(200), items: [] },
    } as Block);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('…')).toBe(true);
  });
});

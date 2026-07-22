import { buildSelectedBlockContext } from '../src/live/generateLive';
import type { Block } from '../src/data/conversation';

// buildSelectedBlockContext turns the blocks a user pinned ("ask about this") into the compact,
// real-data context prepended to the model's question. It must stay lean even on data-heavy blocks.
const insight = (id: string, title: string): Block =>
  ({
    type: 'insight',
    id,
    col: 12,
    num: '1',
    props: { title, summary: 's', conf: 'inferred' },
  }) as Block;

describe('buildSelectedBlockContext', () => {
  it('is empty when nothing is pinned', () => {
    expect(buildSelectedBlockContext(undefined)).toBe('');
    expect(buildSelectedBlockContext([])).toBe('');
  });

  it('serializes a single pinned block with its label and real props (singular intro)', () => {
    const out = buildSelectedBlockContext([insight('i1', 'Revenue')]);
    expect(out).toContain('this specific element');
    expect(out).toContain('[1] insight "Revenue"');
    expect(out).toContain('"summary":"s"');
  });

  it('uses the plural intro and numbers each pinned block', () => {
    const out = buildSelectedBlockContext([insight('i1', 'A'), insight('i2', 'B')]);
    expect(out).toContain('these specific elements');
    expect(out).toContain('[1] insight "A"');
    expect(out).toContain('[2] insight "B"');
  });

  it('truncates very large props so the added context stays bounded', () => {
    const big = {
      type: 'list',
      id: 'l',
      col: 12,
      props: { title: 'Big', items: Array.from({ length: 500 }, (_, i) => `item-${i}`) },
    } as Block;
    const out = buildSelectedBlockContext([big]);
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(1000);
  });
});

import { describe, expect, it } from 'vitest';
import { buildBriefing } from '../src/live/prism/briefing';
import type { Placed } from '../src/live/prism/layout';
import type { Thread } from '../src/live/prism/types';
import type { Verdict } from '../src/live/prism/veracity';

// buildBriefing composes a deterministic flight from the settled map. Captions are assembled ONLY from
// real titles/quotes/relations/verdicts — these pin that the arc opens on the spine, dwells on real
// tensions/verdicts, and lands on the weakest point, with no invented prose.

function claim(over: Partial<Placed>): Placed {
  return {
    id: 'c',
    kind: 'finding',
    title: 'title',
    ask: 'ask',
    role: 'supporting',
    region: 'R',
    source: 0,
    quote: 'quote',
    page: 1,
    x: 0,
    y: 0,
    ...over,
  };
}

describe('buildBriefing', () => {
  it('returns no beats for an empty map', () => {
    expect(buildBriefing([], [], new Map())).toEqual([]);
  });

  it('opens on the load-bearing claim and closes honestly when nothing contradicts', () => {
    const claims = [
      claim({ id: 'k', role: 'load-bearing', quote: 'the market reaches $87B by 2030', page: 2 }),
    ];
    const beats = buildBriefing(claims, [], new Map());
    expect(beats).toHaveLength(2);
    expect(beats[0].kind).toBe('open');
    expect(beats[0].claimIds).toEqual(['k']);
    expect(beats[0].caption).toContain('the market reaches $87B by 2030');
    expect(beats.at(-1)?.kind).toBe('close');
    expect(beats.at(-1)?.caption).toContain('Nothing here contradicts itself');
  });

  it('picks the most-connected load-bearing claim as the spine', () => {
    const claims = [
      claim({ id: 'k1', role: 'load-bearing', page: 1 }),
      claim({ id: 'k2', role: 'load-bearing', page: 2 }),
      claim({ id: 's', role: 'supporting', page: 3 }),
    ];
    const threads: Thread[] = [{ a: 'k2', b: 's', relation: 'contradicts' }];
    const beats = buildBriefing(claims, threads, new Map());
    expect(beats[0].claimIds).toEqual(['k2']); // k2 has a thread, k1 has none
  });

  it('dwells on a contradiction and lands on it when there are no verdicts', () => {
    const claims = [
      claim({ id: 'a', role: 'load-bearing', quote: 'growth is 40%', page: 1 }),
      claim({ id: 'b', role: 'load-bearing', quote: 'growth is 30%', page: 5 }),
    ];
    const threads: Thread[] = [{ a: 'a', b: 'b', relation: 'contradicts' }];
    const beats = buildBriefing(claims, threads, new Map());
    const tension = beats.find((x) => x.kind === 'tension');
    expect(tension?.claimIds).toEqual(['a', 'b']);
    expect(tension?.caption).toContain('contradicts');
    const close = beats.at(-1);
    expect(close?.caption).toContain('contradicts itself');
    expect(close?.caption).toContain('p.1');
    expect(close?.caption).toContain('p.5');
  });

  it('surfaces a troubled verdict and lands on the weakest point', () => {
    const claims = [
      claim({ id: 'k', role: 'load-bearing', quote: 'core thesis', page: 1 }),
      claim({ id: 'm', role: 'supporting', quote: 'a shaky stat', page: 4 }),
    ];
    const verdicts = new Map<string, Verdict>([['m', 'contradicted']]);
    const beats = buildBriefing(claims, [], verdicts);
    const verdict = beats.find((x) => x.kind === 'verdict');
    expect(verdict?.claimIds).toEqual(['m']);
    expect(verdict?.caption).toContain('CONTRADICTED');
    const close = beats.at(-1);
    expect(close?.caption).toContain('The weak point');
    expect(close?.caption).toContain('CONTRADICTED');
  });

  it('paces every beat to a readable, bounded dwell', () => {
    const beats = buildBriefing([claim({ id: 'k', role: 'load-bearing' })], [], new Map());
    for (const b of beats) {
      expect(b.dwellMs).toBeGreaterThanOrEqual(2600);
      expect(b.dwellMs).toBeLessThanOrEqual(7000);
    }
  });
});

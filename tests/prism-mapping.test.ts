import { describe, expect, it } from 'vitest';
import {
  chunkPages,
  selectGroundedClaims,
  skimPagesToPrompt,
  parseSkimPages,
  selectedPagesToPrompt,
} from '../src/live/prism/mapping';

describe('chunkPages', () => {
  it('groups pages into windows with 1-indexed ranges', () => {
    const pages = Array.from({ length: 10 }, (_, i) => `page ${i + 1} text`);
    const windows = chunkPages(pages, 4);
    expect(windows).toHaveLength(3);
    expect(windows[0]).toMatchObject({ startPage: 1, endPage: 4 });
    expect(windows[1]).toMatchObject({ startPage: 5, endPage: 8 });
    expect(windows[2]).toMatchObject({ startPage: 9, endPage: 10 }); // short final window
  });

  it('marks each page with its number so the model can attribute claims', () => {
    const windows = chunkPages(['alpha', 'beta'], 4);
    expect(windows[0].text).toContain('[p.1]');
    expect(windows[0].text).toContain('[p.2]');
    expect(windows[0].text).toContain('alpha');
  });

  it('clamps a degenerate window size to 1', () => {
    expect(chunkPages(['a', 'b'], 0)).toHaveLength(2);
  });

  it('returns no windows for an empty document', () => {
    expect(chunkPages([])).toEqual([]);
  });
});

describe('selectGroundedClaims', () => {
  const pages = ['cost parity with beef in Q1', 'EU rules add three years'];

  it('keeps real claims and drops fabricated or mis-cited ones', () => {
    const candidates = [
      { id: 'a', quote: 'cost parity with beef', page: 1 }, // real, right page
      { id: 'b', quote: 'cost parity with chicken', page: 1 }, // fabricated → drop
      { id: 'c', quote: 'EU rules add three years', page: 1 }, // real text, wrong page → drop
      { id: 'd', quote: 'EU rules add three years', page: 2 }, // real, right page
    ];
    expect(selectGroundedClaims(candidates, pages).map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('preserves the original claim objects (carries title/kind/etc. through)', () => {
    const candidates = [
      { quote: 'cost parity with beef', page: 1, kind: 'finding', title: 'Parity' },
    ];
    const kept = selectGroundedClaims(candidates, pages);
    expect(kept[0]).toMatchObject({ kind: 'finding', title: 'Parity' });
  });
});

// Skim-then-deep: the cheap first pass reads a thin outline of the whole document; the deep pass
// reads only the chosen pages, keeping their real page numbers.

describe('skimPagesToPrompt', () => {
  it('slices every page thin and collapses whitespace so the outline stays small', () => {
    const pages = ['a'.repeat(1000), 'b\n\n  b   b'];
    const out = skimPagesToPrompt(pages, 50);
    expect(out).toContain('[page 1] ' + 'a'.repeat(50));
    expect(out).toContain('[page 2] b b b'); // whitespace collapsed
    expect(out).not.toContain('a'.repeat(51)); // capped per page
  });
});

describe('parseSkimPages', () => {
  it('keeps valid in-range integers, deduped, sorted, and capped', () => {
    expect(parseSkimPages('{"pages":[3,1,3,2,99,0,-1]}', 10, 40)).toEqual([1, 2, 3]);
  });
  it('caps to the requested count', () => {
    expect(parseSkimPages('{"pages":[1,2,3,4,5]}', 10, 3)).toEqual([1, 2, 3]);
  });
  it('reads JSON embedded in surrounding prose', () => {
    expect(parseSkimPages('Sure! {"pages":[2,4]} done', 10, 40)).toEqual([2, 4]);
  });
  it('falls back to an even spread when the model returns nothing usable', () => {
    const spread = parseSkimPages('{}', 20, 4);
    expect(spread.length).toBeGreaterThan(0);
    expect(spread.length).toBeLessThanOrEqual(4);
    expect(spread[0]).toBe(1);
    expect(spread.every((n) => n >= 1 && n <= 20)).toBe(true);
  });
  it('falls back on malformed JSON rather than throwing', () => {
    expect(() => parseSkimPages('not json at all', 10, 40)).not.toThrow();
    expect(parseSkimPages('not json at all', 10, 40).length).toBeGreaterThan(0);
  });
});

describe('selectedPagesToPrompt', () => {
  it('emits only the chosen pages but with their ORIGINAL page numbers in the markers', () => {
    const pages = Array.from({ length: 100 }, (_, i) => `PAGE-${i + 1}-BODY`);
    const out = selectedPagesToPrompt(pages, [3, 42], 2000);
    expect(out).toContain('[page 3]\nPAGE-3-BODY');
    expect(out).toContain('[page 42]\nPAGE-42-BODY');
    expect(out).not.toContain('PAGE-1-BODY'); // unchosen pages are not sent
    expect(out).not.toContain('[page 1]');
  });
  it('annotates a marker with a sheet label when present', () => {
    const out = selectedPagesToPrompt(['x', 'y'], [2], 2000, ['Sheet A', 'Revenue']);
    expect(out).toContain('[page 2 — "Revenue"]');
  });
});

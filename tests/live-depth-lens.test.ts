import { describe, expect, it } from 'vitest';
import { depthLens, hasSections } from '../src/live/depth/depthLens';
import type { Block } from '../src/data/conversation';

// Minimal block factory — only the fields depthLens needs.
function block(
  id: string,
  overrides: { section?: string; order?: number; depth?: number; facet?: string } = {},
): Block {
  return {
    type: 'insight',
    col: 4,
    id,
    num: '1',
    props: { head: id, body: '' },
    ...overrides,
  } as unknown as Block;
}

describe('hasSections', () => {
  it('returns false when no blocks have a section', () => {
    expect(hasSections([block('a'), block('b')])).toBe(false);
  });

  it('returns false when section is empty string', () => {
    expect(hasSections([block('a', { section: '' })])).toBe(false);
  });

  it('returns true when any block has a non-empty section', () => {
    expect(hasSections([block('a'), block('b', { section: 'What it is' })])).toBe(true);
  });
});

describe('depthLens — fallback (no sections)', () => {
  it('returns a single section with all blocks as standard and no deeper', () => {
    const blocks = [block('a'), block('b'), block('c')];
    const sections = depthLens(blocks);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('');
    expect(sections[0].standard).toEqual(blocks);
    expect(sections[0].deeper).toHaveLength(0);
  });

  it('treats undefined depth as standard', () => {
    const b = block('a', { section: '' }); // no depth field
    const sections = depthLens([b]);
    expect(sections[0].standard).toContain(b);
  });
});

describe('depthLens — with sections', () => {
  it('groups blocks by section label', () => {
    const a = block('a', { section: 'What it is', order: 1, depth: 1 });
    const b = block('b', { section: 'The handshake', order: 2, depth: 1 });
    const c = block('c', { section: 'What it is', order: 1, depth: 1 });

    const sections = depthLens([a, b, c]);
    expect(sections).toHaveLength(2);
    const first = sections[0]; // "What it is" — order 1
    expect(first.label).toBe('What it is');
    expect(first.standard).toEqual([a, c]);
    expect(first.deeper).toHaveLength(0);
  });

  it('sorts sections by order ascending', () => {
    const a = block('a', { section: 'Second', order: 2, depth: 1 });
    const b = block('b', { section: 'First', order: 1, depth: 1 });

    const sections = depthLens([a, b]);
    expect(sections[0].label).toBe('First');
    expect(sections[1].label).toBe('Second');
  });

  it('routes depth≥2 blocks to deeper array', () => {
    const std = block('std', { section: 'Concept', order: 1, depth: 1 });
    const deep2 = block('d2', { section: 'Concept', order: 1, depth: 2 });
    const deep3 = block('d3', { section: 'Concept', order: 1, depth: 3 });

    const sections = depthLens([std, deep2, deep3]);
    expect(sections[0].standard).toEqual([std]);
    expect(sections[0].deeper).toEqual([deep2, deep3]);
  });

  it('treats depth=0 as standard', () => {
    const b = block('a', { section: 'Concept', order: 1, depth: 0 });
    const sections = depthLens([b]);
    expect(sections[0].standard).toContain(b);
    expect(sections[0].deeper).toHaveLength(0);
  });

  it('treats undefined depth as standard (non-empty-standard invariant)', () => {
    const b = block('a', { section: 'Concept', order: 1 }); // no depth
    const sections = depthLens([b]);
    expect(sections[0].standard).toContain(b);
  });

  it('promotes first deeper block to standard when all blocks in section are depth≥2', () => {
    const d1 = block('d1', { section: 'All deep', order: 1, depth: 2 });
    const d2 = block('d2', { section: 'All deep', order: 1, depth: 3 });

    const sections = depthLens([d1, d2]);
    expect(sections[0].standard).toHaveLength(1);
    expect(sections[0].standard[0]).toBe(d1);
    expect(sections[0].deeper).toHaveLength(1);
    expect(sections[0].deeper[0]).toBe(d2);
  });

  it('preserves document order within each section', () => {
    const a = block('a', { section: 'Concept', order: 1, depth: 1 });
    const b = block('b', { section: 'Concept', order: 1, depth: 1 });
    const c = block('c', { section: 'Concept', order: 1, depth: 2 });

    const sections = depthLens([a, b, c]);
    expect(sections[0].standard).toEqual([a, b]);
    expect(sections[0].deeper).toEqual([c]);
  });

  it('handles blocks without section mixed with sectioned blocks (ungrouped bucket)', () => {
    const unsec = block('u', {}); // no section
    const sec = block('s', { section: 'Named', order: 1, depth: 1 });

    const sections = depthLens([unsec, sec]);
    // hasSections=true because 'Named' block exists; ungrouped gets empty label
    const ungrouped = sections.find((s) => s.label === '');
    const named = sections.find((s) => s.label === 'Named');
    expect(ungrouped).toBeDefined();
    expect(named).toBeDefined();
    expect(ungrouped!.standard).toContain(unsec);
    expect(named!.standard).toContain(sec);
  });
});

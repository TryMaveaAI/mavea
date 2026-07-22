import { describe, it, expect, beforeEach } from 'vitest';
import { saveCanvas, getLibrary, removeEntry, clearLibrary } from '../src/live/library/store';
import { extractLead } from '../src/live/library/extractLead';
import type { Block, ConversationSpec } from '../src/data/conversation';

function spec(blocks: Block[], title = 'Title', id = 't'): ConversationSpec {
  return {
    id,
    workspace: 'T',
    title,
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}
function insight(stat?: string, delta?: string, deltaDir?: string): Block {
  return {
    type: 'insight',
    id: 'i1',
    col: 12,
    num: '1',
    props: { title: 'Spending', summary: 's', conf: 'inferred', stat, delta, deltaDir },
  } as Block;
}

beforeEach(() => {
  localStorage.clear();
  clearLibrary(); // resets the in-session cache to empty
});

describe('extractLead — the honest card face', () => {
  it('pulls the real lead stat + delta from an insight', () => {
    const lead = extractLead(spec([insight('$214/mo', '−$310', 'good')]));
    expect(lead?.value).toBe('$214/mo');
    expect(lead?.delta).toBe('−$310');
    expect(lead?.deltaDir).toBe('good');
    expect(lead?.kind).toBe('insight');
  });

  it('reads a value + real sparkline points from a stat block', () => {
    const stat: Block = {
      type: 'sparkstat',
      id: 's1',
      col: 6,
      props: { title: 'Sleep', value: '6h 10m', points: [{ v: 5.9 }, { v: 6.4 }, { v: 6.1 }] },
    } as unknown as Block;
    const lead = extractLead(spec([stat]));
    expect(lead?.value).toBe('6h 10m');
    expect(lead?.points).toEqual([5.9, 6.4, 6.1]);
  });

  it('returns null rather than invent a number when the lead block has no stat', () => {
    expect(extractLead(spec([insight(undefined)]))).toBeNull();
    expect(
      extractLead(
        spec([
          { type: 'list', id: 'l1', col: 12, props: { title: 'Notes', items: ['a'] } } as Block,
        ]),
      ),
    ).toBeNull();
  });

  it('never fabricates a delta — a stat without one carries none', () => {
    const lead = extractLead(spec([insight('6h 12m')]));
    expect(lead?.value).toBe('6h 12m');
    expect(lead?.delta).toBeUndefined();
  });
});

describe('library store', () => {
  it('saves a canvas with its real face and an honest timestamp', () => {
    saveCanvas(spec([insight('$214/mo')]), 'where does my money go?', 1000);
    const lib = getLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0].question).toBe('where does my money go?');
    expect(lib[0].lead?.value).toBe('$214/mo');
    expect(lib[0].savedAt).toBe(1000);
    // No "since you left" / passive-monitoring field exists on an entry — honesty by construction.
    expect(Object.keys(lib[0])).not.toContain('sinceYouLeft');
  });

  it('dedupes by question — the newest version wins and moves to the front', () => {
    saveCanvas(spec([insight('$200')], 'A'), 'my money', 1);
    saveCanvas(spec([insight('$999')], 'B'), 'other', 2);
    saveCanvas(spec([insight('$214')], 'A2'), 'my money', 3); // same question as the first
    const lib = getLibrary();
    expect(lib).toHaveLength(2);
    expect(lib[0].question).toBe('my money');
    expect(lib[0].lead?.value).toBe('$214');
  });

  it('caps the library and keeps the most recent', () => {
    for (let i = 0; i < 15; i++) saveCanvas(spec([insight(`$${i}`)]), `q${i}`, i);
    const lib = getLibrary();
    expect(lib).toHaveLength(12);
    expect(lib[0].question).toBe('q14'); // newest first
  });

  it('ignores an empty question or an empty canvas', () => {
    saveCanvas(spec([insight('$1')]), '   ');
    saveCanvas(spec([]), 'no blocks');
    expect(getLibrary()).toHaveLength(0);
  });

  it('strips a large inline data: URI before storage', () => {
    const photo: Block = {
      type: 'insight',
      id: 'i1',
      col: 12,
      num: '1',
      props: {
        title: 'x',
        summary: 's',
        conf: 'inferred',
        stat: '1',
        img: 'data:image/png;base64,' + 'A'.repeat(6000),
      },
    } as unknown as Block;
    saveCanvas(spec([photo]), 'pic', 1);
    const saved = getLibrary()[0].spec.blocks[0].props as unknown as Record<string, unknown>;
    expect(saved.img).toBe('');
  });

  it('removes one entry and clears all', () => {
    saveCanvas(spec([insight('$1')]), 'a', 1);
    saveCanvas(spec([insight('$2')]), 'b', 2);
    removeEntry(getLibrary()[0].id);
    expect(getLibrary()).toHaveLength(1);
    clearLibrary();
    expect(getLibrary()).toHaveLength(0);
  });
});

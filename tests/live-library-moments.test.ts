import { describe, expect, it } from 'vitest';
import { momentsFor } from '../src/live/library/moments';
import type { LibraryEntry } from '../src/live/library/store';
import type { Block } from '../src/data/conversation';

// momentsFor retells a saved canvas honestly: the ask first, then each block's OWN heading —
// never a summary it didn't contain. Overflow collapses to a count instead of disappearing.

function entry(blocks: Block[], question = 'Should I refinance?'): LibraryEntry {
  return {
    id: 'e1',
    question,
    title: 'Refi math',
    savedAt: 0,
    lead: null,
    spec: { title: 'Refi math', blocks } as LibraryEntry['spec'],
  };
}

const insight = (title: string) => ({ type: 'insight', props: { title } }) as unknown as Block;
const bars = (title: string) => ({ type: 'bars', props: { title } }) as unknown as Block;

describe('momentsFor', () => {
  it('leads with the ask, then real block headings with finding/evidence icons', () => {
    const { moments, more } = momentsFor(
      entry([insight('Break-even at 11 months'), bars('Rates')]),
    );
    expect(moments.map((m) => m.icon)).toEqual(['ask', 'finding', 'evidence']);
    expect(moments[0].text).toBe('Should I refinance?');
    expect(moments[1].text).toBe('Break-even at 11 months');
    expect(moments[2].text).toBe('Rates');
    expect(more).toBe(0);
  });

  it('collapses overflow into an honest "+N more" count', () => {
    const blocks = [insight('a'), bars('b'), bars('c'), bars('d'), bars('e')];
    const { moments, more } = momentsFor(entry(blocks));
    expect(moments).toHaveLength(4); // ask + 3 blocks
    expect(more).toBe(2);
  });

  it('a label-less block still reads as its friendly kind, never blank', () => {
    const { moments } = momentsFor(entry([{ type: 'bars', props: {} } as unknown as Block]));
    expect(moments[1].text).toBe('Bar chart');
  });
});

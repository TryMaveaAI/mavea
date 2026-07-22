import { describe, it, expect } from 'vitest';
import { groupByTopic } from '../src/live/library/grouping';
import type { LibraryEntry } from '../src/live/library/store';
import type { ConversationSpec } from '../src/data/conversation';

const spec = { id: 't', title: '', blocks: [] } as unknown as ConversationSpec;

function entry(over: Partial<LibraryEntry> & { id: string }): LibraryEntry {
  return {
    question: '',
    title: '',
    savedAt: 0,
    lead: null,
    spec,
    ...over,
  };
}

describe('groupByTopic', () => {
  it('folds a same-subject family into one thread named from its shared words', () => {
    const now = 1_000_000_000;
    const entries = [
      entry({ id: 'a', title: 'Baseball batting-average since 1900', question: '', savedAt: now }),
      entry({ id: 'b', title: 'Batting average before vs after', question: '', savedAt: now - 1 }),
      entry({
        id: 'c',
        title: 'Batting average: use hits at bats',
        question: '',
        savedAt: now - 2,
      }),
      entry({ id: 'd', title: 'Batting-average split by month', question: '', savedAt: now - 3 }),
    ];
    const groups = groupByTopic(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(4);
    // Named from the words the majority share, in reading order — not a shout, not one outlier.
    expect(groups[0].name).toBe('Batting average');
    // Members keep newest-first order.
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps genuinely unrelated canvases in their own threads', () => {
    const entries = [
      entry({ id: 'a', title: 'Batting average basics', savedAt: 3 }),
      entry({ id: 'b', title: 'Sourdough starter schedule', savedAt: 2 }),
      entry({ id: 'c', title: 'Plan a Lisbon itinerary', savedAt: 1 }),
    ];
    const groups = groupByTopic(entries);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.entries.length === 1)).toBe(true);
  });

  it('does not bond two same-domain asks that share no subject words (tight threads, not buckets)', () => {
    // Both are Finance by the model's label, but a mortgage question and an index-fund question are
    // different subjects — a personal library should keep them apart, not merge into "Finance".
    const entries = [
      entry({ id: 'a', title: 'How do mortgages work', topic: 'Finance', savedAt: 2 }),
      entry({ id: 'b', title: 'Explain index funds', topic: 'Finance', savedAt: 1 }),
    ];
    const groups = groupByTopic(entries);
    expect(groups).toHaveLength(2);
  });

  it('orders threads freshest-first — the one you touched last leads', () => {
    const entries = [
      entry({ id: 'old1', title: 'Batting average basics', savedAt: 100 }),
      entry({ id: 'old2', title: 'Batting average splits', savedAt: 90 }),
      entry({ id: 'new', title: 'Sourdough hydration ratio', savedAt: 500 }),
    ];
    const groups = groupByTopic(entries);
    expect(groups[0].entries[0].id).toBe('new');
  });

  it('keeps a shared proper noun capitalized — quotes the entries, never invents a casing', () => {
    // Regression: sentence() only capitalizes the name's first letter, so a shared term drawn from
    // the (lowercased, for matching) salient-term vocabulary used to render "tokyo" verbatim even
    // though every entry itself wrote "Tokyo".
    const now = 2_000_000_000;
    const entries = [
      entry({ id: 'a', title: 'Solo Dining in Tokyo', savedAt: now }),
      entry({ id: 'b', title: 'Tokyo Dining: Booking a Table', savedAt: now - 1 }),
      entry({ id: 'c', title: 'Best Tokyo Dining Spots', savedAt: now - 2 }),
      entry({ id: 'd', title: 'Tokyo Dining for Foodies', savedAt: now - 3 }),
    ];
    const groups = groupByTopic(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Dining Tokyo');
  });

  it('names a lone thread by its own title, and is deterministic', () => {
    const entries = [
      entry({ id: 'a', title: 'Your money this month', question: 'where does it go' }),
    ];
    const once = groupByTopic(entries);
    const twice = groupByTopic(entries);
    expect(once[0].name).toBe('Your money this month');
    expect(once).toEqual(twice);
  });
});

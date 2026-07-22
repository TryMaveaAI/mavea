import { describe, expect, it } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { composeDeck } from '../src/slides/model/compose';

function block(id: string, title: string): Block {
  return { type: 'insight', id, col: 12, props: { title, summary: `${title} explained` } } as Block;
}

function spec(blocks: Block[], sources?: { title: string; url: string }[]): ConversationSpec {
  return {
    id: 'live',
    workspace: 'Live',
    title: 'Quarterly review',
    sub: 'How Q3 went',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
    ...(sources ? { sources } : {}),
  } as unknown as ConversationSpec;
}

// composeDeck is the deterministic spine shared by the export and Present mode: it derives a cover
// + one slide per real visual (+ a Sources closing when there is provenance) from the answer on
// screen, inventing nothing.
describe('composeDeck — deterministic deck from a real answer', () => {
  it('with no answer yet, it is just a cover', () => {
    const { slides } = composeDeck([], 0);
    expect(slides.map((s) => s.kind)).toEqual(['cover']);
  });

  it('a source-less answer is cover → one slide per real block, ending on substance', () => {
    const { slides } = composeDeck([spec([block('a', 'Revenue'), block('b', 'Costs')])], 0);
    expect(slides[0].kind).toBe('cover');
    expect(slides.slice(1).map((s) => s.kind)).toEqual(['prose', 'prose']);
  });

  it('every content slide carries its own real block title — nothing invented', () => {
    const { slides } = composeDeck([spec([block('a', 'Revenue'), block('b', 'Costs')])], 0);
    const headings = slides.flatMap((s) => (s.kind === 'prose' ? [s.data.heading] : []));
    expect(headings).toEqual(['Revenue', 'Costs']);
  });

  it('a richer answer gains an agenda that lists the real titles', () => {
    const blocks = ['Revenue', 'Costs', 'Runway', 'Margin', 'Cash'].map((t, i) =>
      block(String(i), t),
    );
    const { slides } = composeDeck([spec(blocks)], 0);
    const agenda = slides.find((s) => s.kind === 'agenda');
    expect(agenda?.kind).toBe('agenda');
    if (agenda?.kind === 'agenda') {
      expect(agenda.data.items.map((it) => it.title)).toEqual([
        'Revenue',
        'Costs',
        'Runway',
        'Margin',
        'Cash',
      ]);
    }
  });

  it('a Sources closing appears exactly when the answer has provenance to attribute', () => {
    const { slides } = composeDeck(
      [spec([block('a', 'Revenue')], [{ title: 'SEC filing', url: 'https://sec.gov' }])],
      0,
    );
    const closing = slides.at(-1);
    expect(closing?.kind).toBe('closing');
    if (closing?.kind === 'closing') {
      expect(closing.data.title).toBe('Sources');
      expect(closing.data.sources).toEqual(['SEC filing']);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  blockYieldsCards,
  cardsFromBlock,
  initialCardsForBlock,
  seedCardFromBlock,
} from '../src/live/srs/suggestCards';
import type { Block } from '../src/data/conversation';

// suggestCards turns an answer block into editable flashcard suggestions. The contract: real Q/A
// blocks yield real cards instantly (HTML stripped); any other block yields a deterministic seed
// from its OWN title/body (never fabricated). The model-refine path degrades to [] offline, so it's
// not exercised here — these guard the pure, deterministic surface the UI always shows first.

const mk = (type: string, props: Record<string, unknown>, id = 'b1'): Block =>
  ({ type, id, col: 6, props }) as unknown as Block;

describe('cardsFromBlock', () => {
  it('flashcard → real pairs, HTML stripped, blanks dropped', () => {
    const b = mk('flashcard', {
      title: 'T',
      cards: [
        { front: '<b>Q</b>', back: 'A', tag: 'u1' },
        { front: '', back: 'x' },
      ],
    });
    expect(cardsFromBlock(b)).toEqual([{ front: 'Q', back: 'A', tag: 'u1' }]);
  });

  it('faq → q/a', () => {
    const b = mk('faq', { title: 'T', items: [{ q: 'Why?', a: 'Because' }] });
    expect(cardsFromBlock(b)).toEqual([{ front: 'Why?', back: 'Because', tag: undefined }]);
  });

  it('deflist → term/def', () => {
    const b = mk('deflist', { title: 'T', items: [{ term: 'Mole', def: '6.022e23' }] });
    expect(cardsFromBlock(b)[0]).toMatchObject({ front: 'Mole', back: '6.022e23' });
  });

  it('quiz → question + correct option (+ explanation)', () => {
    const b = mk('quiz', {
      title: 'T',
      question: 'Capital of France?',
      options: [{ text: 'Paris', correct: true }, { text: 'Lyon' }],
      explanation: 'It is Paris.',
    });
    expect(cardsFromBlock(b)[0]).toEqual({
      front: 'Capital of France?',
      back: 'Paris — It is Paris.',
      tag: undefined,
    });
  });

  it('non-card block → []', () => {
    expect(cardsFromBlock(mk('chart', { title: 'Trend', summary: 'up' }))).toEqual([]);
  });
});

describe('blockYieldsCards gate', () => {
  it('true for Q/A blocks with content, false otherwise', () => {
    expect(blockYieldsCards(mk('faq', { items: [{ q: 'a', a: 'b' }] }))).toBe(true);
    expect(blockYieldsCards(mk('chart', { title: 'x' }))).toBe(false);
    // a quiz with no correct option can't make a complete card
    expect(blockYieldsCards(mk('quiz', { question: 'q', options: [{ text: 'o' }] }))).toBe(false);
  });
});

describe('seed + initial', () => {
  it('seedCardFromBlock uses the block’s real title + body (never fabricated)', () => {
    const seed = seedCardFromBlock(
      mk('insight', { title: 'Photosynthesis', summary: 'Plants make sugar from light.' }),
    );
    expect(seed.front).toBe('Photosynthesis');
    expect(seed.back).toBe('Plants make sugar from light.');
  });

  it('initialCardsForBlock: exact for Q/A, seed for anything else', () => {
    expect(initialCardsForBlock(mk('faq', { items: [{ q: 'a', a: 'b' }] })).exact).toBe(true);
    const other = initialCardsForBlock(mk('insight', { title: 'X', summary: 'Y' }));
    expect(other.exact).toBe(false);
    expect(other.cards).toHaveLength(1);
  });
});

// The early board cue says what a follow-up will do to the board BEFORE its cards land. Its one
// promise: whenever it speaks, the settle agrees. These pin that promise across hints, tiers and
// wordings, and the cases where it must stay quiet (no board, a board too full to be sure of).
import { describe, it, expect } from 'vitest';
import { boardCueFor, settleTurn } from '../src/live/settleTurn';
import { AUGMENT_CAP, type Mode, type TurnSnapshot } from '../src/live/lifecycle';
import type { AnswerFraming, LiveResult } from '../src/live/generateLive';
import type { Block, ConversationSpec } from '../src/data/conversation';

const blk = (n: number): Block =>
  ({ type: 'stat', col: 6, delay: 0, props: { title: `Card ${n}` } }) as unknown as Block;
const blocks = (n: number, from = 0): Block[] => Array.from({ length: n }, (_, i) => blk(from + i));

const prior: TurnSnapshot = {
  question: 'monthly budget breakdown',
  narration: 'Your monthly budget splits across rent, food and savings.',
  title: 'Monthly Budget',
  blockTypes: ['stat'],
};

const framing = (over: Partial<AnswerFraming> = {}): AnswerFraming => ({
  narration: 'Here is the budget by channel — rent, food and savings month over month.',
  title: 'Monthly Budget by Channel',
  continuity: 'augment',
  tier: 'frontier',
  ceiling: 7,
  ...over,
});

function settledMode(f: AnswerFraming, ask: string, priorCount: number, newCount: number): Mode {
  const result = {
    spec: { title: f.title, sub: '', blocks: blocks(newCount, 100) } as unknown as ConversationSpec,
    narration: f.narration,
    tier: f.tier,
    ...(f.continuity ? { continuity: f.continuity } : {}),
  } as LiveResult;
  return settleTurn(prior, blocks(priorCount), ask, result).mode;
}

describe('boardCueFor', () => {
  it('names an augment as extend and a refine as revise', () => {
    expect(boardCueFor(prior, 4, 'and by channel?', framing())).toBe('extend');
    expect(boardCueFor(prior, 4, 'and by channel?', framing({ continuity: 'refine' }))).toBe(
      'revise',
    );
  });

  it('stays neutral on a replace, on no prior turn, and on an empty board', () => {
    expect(boardCueFor(prior, 4, 'and by channel?', framing({ continuity: 'replace' }))).toBeNull();
    expect(boardCueFor(null, 4, 'and by channel?', framing())).toBeNull();
    expect(boardCueFor(prior, 0, 'and by channel?', framing())).toBeNull();
  });

  it('stays neutral when an answer at its ceiling could overflow the board into a replace', () => {
    const ceiling = 7;
    expect(boardCueFor(prior, AUGMENT_CAP - ceiling, 'more', framing({ ceiling }))).toBe('extend');
    expect(boardCueFor(prior, AUGMENT_CAP - ceiling + 1, 'more', framing({ ceiling }))).toBeNull();
    // …and that bound is the real one: at the ceiling, one card more is exactly the fallback.
    expect(settledMode(framing({ ceiling }), 'more', AUGMENT_CAP - ceiling + 1, ceiling)).toBe(
      'replace',
    );
  });

  it('never names a cue the settle then contradicts', () => {
    const hints: AnswerFraming['continuity'][] = ['augment', 'refine', 'replace', undefined];
    const tiers: AnswerFraming['tier'][] = ['frontier', 'mid', 'small'];
    const asks = ['and by channel?', 'no, rent is 1200', 'what is bitcoin?', 'tell me more'];
    const titles = ['Monthly Budget by Channel', 'How Bitcoin Works'];
    let spoke = 0;
    for (const continuity of hints)
      for (const tier of tiers)
        for (const ask of asks)
          for (const title of titles)
            for (const priorCount of [1, 5, 9])
              for (const newCount of [1, 4, 7]) {
                const f = framing({ continuity, tier, title, narration: `${title}.` });
                const cue = boardCueFor(prior, priorCount, ask, f);
                if (!cue) continue;
                spoke += 1;
                const mode = settledMode(f, ask, priorCount, newCount);
                expect({ ask, continuity, tier, title, priorCount, newCount, mode }).toEqual({
                  ask,
                  continuity,
                  tier,
                  title,
                  priorCount,
                  newCount,
                  mode: cue === 'extend' ? 'augment' : 'refine',
                });
              }
    // The sweep has to exercise the promise, not pass vacuously.
    expect(spoke).toBeGreaterThan(20);
  });
});

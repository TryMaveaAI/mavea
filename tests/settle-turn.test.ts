// Characterization of settleTurn — the shared settle step between the live turn loop and the
// demo corpus baker. These pin the exact behaviors the extraction lifted out of useLiveTurn
// (mode resolution, merge + overflow fallback, bend drop, spot choice, tour remap) so neither
// caller can drift from what the surface historically did.
import { describe, it, expect } from 'vitest';
import { settleTurn } from '../src/live/settleTurn';
import { AUGMENT_CAP, type TurnSnapshot } from '../src/live/lifecycle';
import type { LiveResult } from '../src/live/generateLive';
import type { Block, ConversationSpec } from '../src/data/conversation';

const blk = (type: string, title: string): Block =>
  ({ type, col: 6, delay: 0, props: { title } }) as unknown as Block;

const spec = (blocks: Block[], extra?: Partial<ConversationSpec>): ConversationSpec =>
  ({ title: 'T', sub: 'S', blocks, ...extra }) as ConversationSpec;

const result = (blocks: Block[], extra?: Partial<LiveResult>): LiveResult => ({
  spec: spec(blocks, extra?.spec as Partial<ConversationSpec>),
  narration: 'Here it is.',
  tier: 'frontier',
  ...extra,
});

const prior = (question: string): TurnSnapshot => ({
  question,
  narration: '',
  title: '',
  blockTypes: [],
});

describe('settleTurn', () => {
  it('first turn (no prior) settles as replace, spots the first block, renumbers ids', () => {
    const r = result([blk('stat', 'Total'), blk('barchart', 'Growth')]);
    const settled = settleTurn(null, [], 'chart my savings', r);
    expect(settled.mode).toBe('replace');
    expect(settled.frame.spec.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2']);
    expect(settled.spot).toBe('live-1');
    expect(settled.frame.question).toBe('chart my savings');
    expect(settled.snap.blockTypes).toEqual(['stat', 'barchart']);
  });

  it('a genuine follow-up with an augment hint appends and spots the first NEW block', () => {
    const priorBlocks = settleTurn(
      null,
      [],
      'monthly budget breakdown',
      result([blk('stat', 'Total')]),
    ).frame.spec.blocks;
    const r = result([blk('barchart', 'By channel')], { continuity: 'augment' });
    const settled = settleTurn(
      prior('monthly budget breakdown'),
      priorBlocks,
      'monthly budget by channel',
      r,
    );
    expect(settled.mode).toBe('augment');
    expect(settled.frame.spec.blocks).toHaveLength(2);
    // The spot is the first appended block, never a prior one the user already saw.
    expect(settled.spot).toBe(settled.frame.spec.blocks[1].id);
  });

  it('forceReplace overrides an augment decision (streamed turns settled mid-reveal)', () => {
    const priorBlocks = [{ ...blk('stat', 'Total'), id: 'live-1' }];
    const r = result([blk('barchart', 'By channel')], { continuity: 'augment' });
    const settled = settleTurn(
      prior('monthly budget breakdown'),
      priorBlocks,
      'monthly budget by channel',
      r,
      {
        forceReplace: true,
      },
    );
    expect(settled.mode).toBe('replace');
    expect(settled.frame.spec.blocks).toHaveLength(1);
    // The render path was forced, but the SUBJECT didn't change — the frame says so, so the
    // session rail keeps chaptering on topic, not on how the canvas happened to render.
    expect(settled.frame.topicShift).toBe(false);
  });

  it('stamps topicShift from the topic decision, not the render path', () => {
    // A genuine new subject: shift on, whether or not the turn streamed.
    const fresh = settleTurn(null, [], 'chart my savings', result([blk('stat', 'Total')]));
    expect(fresh.frame.topicShift).toBe(true);

    const shifted = settleTurn(
      prior('how should i budget my monthly money'),
      [{ ...blk('stat', 'Total'), id: 'live-1' }],
      'plan a three day trip to tokyo',
      result([blk('barchart', 'Days')]),
      { forceReplace: true },
    );
    expect(shifted.frame.topicShift).toBe(true);
  });

  it('an overcrowded augment falls back to a clean replace', () => {
    const priorBlocks = Array.from({ length: AUGMENT_CAP }, (_, i) => ({
      ...blk('stat', `Prior ${i}`),
      id: `live-${i + 1}`,
    }));
    const r = result([blk('barchart', 'More'), blk('table', 'Even more')], {
      continuity: 'augment',
    });
    const settled = settleTurn(
      prior('budget breakdown for the year'),
      priorBlocks,
      'budget breakdown, more detail',
      r,
    );
    expect(settled.mode).toBe('replace');
    expect(settled.frame.spec.blocks).toHaveLength(2);
    // Overflow is a crowding fallback, not a change of subject.
    expect(settled.frame.topicShift).toBe(false);
  });

  it('drops a bend on non-replace turns (its block id belongs to the unmerged canvas)', () => {
    const priorBlocks = [{ ...blk('stat', 'Total'), id: 'live-1' }];
    const bend = {
      blockId: 'live-1',
      label: 'Rate',
      param: { value: 5, min: 1, max: 10, step: 1 },
      outputs: [{ label: 'Result', formula: 'x * 2' }],
    };
    const r = result([blk('barchart', 'By year')], {
      continuity: 'augment',
      spec: spec([blk('barchart', 'By year')], { bend }) as ConversationSpec,
    });
    const settled = settleTurn(
      prior('savings growth over time'),
      priorBlocks,
      'savings growth by year',
      r,
    );
    expect(settled.mode).toBe('augment');
    expect(settled.frame.spec.bend).toBeUndefined();

    const replaced = settleTurn(
      prior('savings growth over time'),
      priorBlocks,
      'savings growth by year',
      r,
      {
        forceReplace: true,
      },
    );
    expect(replaced.frame.spec.bend).toEqual(bend);
  });

  it('remaps the tour onto the merged canvas on augment (stops point at appended slots)', () => {
    const priorBlocks = [
      { ...blk('stat', 'Total'), id: 'live-1' },
      { ...blk('table', 'Detail'), id: 'live-2' },
    ];
    const r = result([blk('barchart', 'By channel')], {
      continuity: 'augment',
      tour: [{ index: 0, say: 'Look here' }],
    });
    const settled = settleTurn(
      prior('budget breakdown channels'),
      priorBlocks,
      'budget by channel',
      r,
    );
    expect(settled.mode).toBe('augment');
    // The response's block 0 landed at merged index 2, so the stop follows it there.
    expect(settled.frame.tour).toEqual([{ index: 2, say: 'Look here' }]);
  });

  it('carries a declared correction onto the frame', () => {
    const corrects = { what: 'the rate', was: '7%', now: '6%' };
    const r = result([blk('stat', 'Total')], { corrects });
    const settled = settleTurn(null, [], 'fix that', r);
    expect(settled.frame.corrects).toEqual(corrects);
  });

  it('carries display and voice-ready twins into the saved frame', () => {
    const r = result([blk('insight', 'Dinner')], {
      narration: 'Try Omakase.',
      spoken: 'Try oh-mah-kah-seh.',
      tour: [
        {
          index: 0,
          say: 'This is Omakase.',
          saySpoken: 'This is oh-mah-kah-seh.',
        },
      ],
    });
    const settled = settleTurn(null, [], 'what is omakase?', r);
    expect(settled.frame.narration).toBe('Try Omakase.');
    expect(settled.frame.spoken).toBe('Try oh-mah-kah-seh.');
    expect(settled.frame.tour[0]).toMatchObject({
      say: 'This is Omakase.',
      saySpoken: 'This is oh-mah-kah-seh.',
    });
  });
});

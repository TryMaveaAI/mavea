import { describe, it, expect } from 'vitest';
import {
  resolveMode,
  topicOverlap,
  topicCohesion,
  likelyFollowUp,
  diffBlocks,
  blockSignature,
  mergeForMode,
  AUGMENT_CAP,
  SAME_SUBJECT_FLOOR,
  type TurnSnapshot,
} from '../src/live/lifecycle';
import { validateLiveResponse } from '../src/engine/liveSchema';
import type { Block } from '../src/data/conversation';

const snap = (question: string, narration = '', title = ''): TurnSnapshot => ({
  question,
  narration,
  title,
  blockTypes: [],
});
const blk = (type: string, title: string): Block =>
  ({ type, col: 6, delay: 0, props: { title } }) as unknown as Block;

describe('resolveMode', () => {
  it('replaces on the first turn (no prior)', () => {
    expect(resolveMode(null, snap('anything'), undefined, 'frontier')).toBe('replace');
  });

  it('replaces on a topic shift even when the model says augment', () => {
    const prior = snap('how should I budget my monthly money');
    const next = snap('plan a three day trip to tokyo');
    expect(topicOverlap(prior, next)).toBeLessThan(0.18);
    expect(resolveMode(prior, next, 'augment', 'frontier')).toBe('replace');
  });

  it('honors a frontier model refine hint on a genuine follow-up', () => {
    const prior = snap('how is my marketing budget split');
    const next = snap('show the marketing budget breakdown by channel');
    expect(topicOverlap(prior, next)).toBeGreaterThan(0.18);
    expect(resolveMode(prior, next, 'refine', 'frontier')).toBe('refine');
  });

  it('ignores the hint on a small local model and adds non-destructively', () => {
    const prior = snap('marketing budget channels');
    const next = snap('marketing budget channels in more detail');
    expect(resolveMode(prior, next, 'refine', 'small')).toBe('augment');
  });

  it('a re-worded follow-up appends when the model says augment, but wipes with no hint', () => {
    // Barely-overlapping wording, but the model knows it's the same thread.
    const prior = snap('plan my monthly household budget spending breakdown');
    const next = snap('save toward retirement goals investments and future budget');
    const ov = topicOverlap(prior, next);
    expect(ov).toBeGreaterThan(0.04);
    expect(ov).toBeLessThan(0.1);
    // Trust the model's keep-hint → append (this is the "stop wiping the page" fix).
    expect(resolveMode(prior, next, 'augment', 'frontier')).toBe('augment');
    // No guidance + low overlap → treat as a new topic and clear.
    expect(resolveMode(prior, next, undefined, 'frontier')).toBe('replace');
  });
});

describe('topicCohesion — same subject survives a full rewording; a pivot does not', () => {
  // Realistic turns: verbose answers about ONE subject share almost no sentence structure but
  // keep re-mentioning the subject vocabulary. Jaccard reads these pairs as unrelated (the
  // union of two long texts swamps the quotient) — the whole reason cohesion exists.
  const tokyoPlan = snap(
    'three days in tokyo, food first',
    'Here is a three day Tokyo itinerary built around food — Tsukiji market mornings, ramen in Shinjuku, and a sushi splurge to finish.',
    'Tokyo: A 3-Day Culinary Journey',
  );
  const tokyoPlanIt = snap(
    'plan it',
    'Day one covers Asakusa street snacks, day two is Shibuya and Harajuku eats, and day three ends with omakase in Ginza — the full Tokyo food plan.',
    'Tokyo: A 3-Day Foodie Itinerary',
  );
  const bitcoin = snap(
    'how does bitcoin work',
    'Bitcoin is a decentralized ledger — miners verify transactions and the network agrees on one shared history.',
    'How Bitcoin Works',
  );

  it('holds above the floor for a reworded same-subject pair the Jaccard check calls unrelated', () => {
    expect(topicOverlap(tokyoPlan, tokyoPlanIt)).toBeLessThan(0.15);
    expect(topicCohesion(tokyoPlan, tokyoPlanIt)).toBeGreaterThanOrEqual(SAME_SUBJECT_FLOOR);
  });

  it('stays below the floor for a genuine pivot', () => {
    expect(topicCohesion(tokyoPlanIt, bitcoin)).toBeLessThan(SAME_SUBJECT_FLOOR);
    expect(topicCohesion(tokyoPlan, snap('how should i budget my monthly money'))).toBeLessThan(
      SAME_SUBJECT_FLOOR,
    );
  });
});

describe('likelyFollowUp (the pre-turn streaming guess)', () => {
  const tokyo = snap(
    'three days in tokyo, food first',
    'Tokyo rewards eating your way through it — sushi at Tsukiji, ramen in Shinjuku.',
    'Tokyo: A 3-Day Foodie Itinerary',
  );

  it('is never a follow-up on the first turn', () => {
    expect(likelyFollowUp(null, 'tell me more')).toBe(false);
  });

  it('reads pure continuation asks as follow-ups (they name no subject of their own)', () => {
    expect(likelyFollowUp(tokyo, 'tell me more')).toBe(true);
    expect(likelyFollowUp(tokyo, 'go deeper with another example')).toBe(true);
    expect(likelyFollowUp(tokyo, 'why?')).toBe(true);
  });

  it('reads a drill-in whose subject words are already on screen as a follow-up', () => {
    expect(likelyFollowUp(tokyo, 'best ramen in shinjuku')).toBe(true);
  });

  it('keeps a short question that names a NEW subject a fresh topic', () => {
    expect(likelyFollowUp(tokyo, 'what is bitcoin?')).toBe(false);
    expect(likelyFollowUp(tokyo, 'how does photosynthesis work')).toBe(false);
  });
});

describe('content diffing', () => {
  it('identifies a block by type + headline', () => {
    expect(blockSignature(blk('insight', 'Net Worth'))).toBe('insight:net worth');
  });

  it('diffs added / kept / removed by signature', () => {
    const prior = [blk('insight', 'A')];
    const next = [blk('insight', 'A'), blk('chart', 'B')];
    const d = diffBlocks(prior, next);
    expect(d.kept).toContain('insight:a');
    expect(d.added).toContain('chart:b');
    expect(d.removed).toEqual([]);
  });
});

describe('mergeForMode', () => {
  const prior = [blk('insight', 'A'), blk('chart', 'B')];
  const next = [blk('insight', 'A'), blk('kpi', 'C')]; // A repeats, C is new

  it('replace uses only the new blocks, renumbered live-1..', () => {
    const r = mergeForMode(prior, next, 'replace');
    expect(r.blocks.map((b) => b.type)).toEqual(['insight', 'kpi']);
    expect(r.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2']);
    expect(r.overflow).toBe(false);
  });

  it('augment keeps prior blocks and appends only genuinely new content', () => {
    const r = mergeForMode(prior, next, 'augment');
    expect(r.blocks.map((b) => b.type)).toEqual(['insight', 'chart', 'kpi']);
    expect(r.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2', 'live-3']);
    expect(r.firstNewId).toBe('live-3');
  });

  it('refine updates a matching block in place and appends the rest', () => {
    const r = mergeForMode(prior, next, 'refine');
    expect(r.blocks.map((b) => b.type)).toEqual(['insight', 'chart', 'kpi']);
    expect(r.firstNewId).toBe('live-3');
  });

  it('treats the first turn (empty prior) as a replace regardless of mode', () => {
    const r = mergeForMode([], next, 'augment');
    expect(r.blocks.map((b) => b.type)).toEqual(['insight', 'kpi']);
  });

  it('flags overflow when an augment grows past the cap', () => {
    const many = Array.from({ length: AUGMENT_CAP }, (_, i) => blk('insight', `P${i}`));
    const r = mergeForMode(many, [blk('chart', 'X'), blk('kpi', 'Y')], 'augment');
    expect(r.overflow).toBe(true);
  });
});

describe('continuity hint parsing', () => {
  it('keeps a valid hint and ignores an invalid one', () => {
    const ok = validateLiveResponse(
      { title: 'T', continuity: 'augment', blocks: [{ type: 'insight', props: { title: 'x' } }] },
      new Set(['insight']),
    );
    expect(ok?.continuity).toBe('augment');
    const bad = validateLiveResponse(
      { title: 'T', continuity: 'sideways', blocks: [{ type: 'insight', props: { title: 'x' } }] },
      new Set(['insight']),
    );
    expect(bad?.continuity).toBeUndefined();
  });
});

describe('model tour parsing', () => {
  // Two DISTINCT block types — a second "insight" here would be dropped by the one-insight
  // rule, leaving only one block and breaking the index-1 assertions below on an unrelated axis.
  const twoBlocks = [
    { type: 'insight', props: { title: 'a' } },
    { type: 'list', props: { title: 'b', items: ['x', 'y'] } },
  ];

  it('keeps in-range indices, drops out-of-range and duplicates', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        tour: [{ index: 1, say: 'two' }, { index: 9 }, { index: 1 }, { index: 0 }],
        blocks: twoBlocks,
      },
      new Set(['insight', 'list']),
    );
    expect(r?.tour).toEqual([{ index: 1, say: 'two' }, { index: 0 }]);
  });

  it('omits the tour when the model gives none', () => {
    const r = validateLiveResponse({ title: 'T', blocks: twoBlocks }, new Set(['insight', 'list']));
    expect(r?.tour).toBeUndefined();
  });
});

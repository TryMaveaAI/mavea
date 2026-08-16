// world-turn.test.ts — what happens to a world block once the turn settles. The world is injected
// into result.spec.blocks BEFORE settleTurn precisely so the merge, the TurnFrame and every replay
// treat it as an ordinary block; these pin the three properties that has to buy us: an augment
// keeps the standing world, a follow-up that EVOLVES it replaces the card in place (because
// props.title is what blockSignature reads), and renumbering block ids never touches the semantic
// node ids the world's own identity is built from. Deterministic — no model, no surface.
import { describe, it, expect } from 'vitest';
import { settleTurn } from '../src/live/settleTurn';
import { blockSignature, type TurnSnapshot } from '../src/live/lifecycle';
import type { LiveResult } from '../src/live/generateLive';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { WorldSpec } from '../src/live/world/types';

const QUESTION = 'Why did the 2008 financial crisis happen?';

const world = (extra?: Partial<WorldSpec>): WorldSpec => ({
  title: QUESTION,
  outcomeId: 'credit-crisis',
  nodes: [
    { id: 'cheap-mortgages', label: 'Cheap credit', role: 'root', depth: 0, tier: 'T0' },
    { id: 'securitization', label: 'Securitization', role: 'mechanism', depth: 1, tier: 'T0' },
    { id: 'credit-crisis', label: 'Credit froze', role: 'outcome', depth: 2, tier: 'T0' },
  ],
  edges: [{ from: 'cheap-mortgages', to: 'credit-crisis', sign: 1, tier: 'T0' }],
  provenance: {},
  ...extra,
});

const worldBlock = (spec: WorldSpec): Block =>
  ({ type: 'world', col: 6, props: { title: spec.title, world: spec } }) as unknown as Block;

const blk = (type: string, title: string): Block =>
  ({ type, col: 6, props: { title } }) as unknown as Block;

const result = (blocks: Block[], extra?: Partial<LiveResult>): LiveResult => ({
  spec: { title: 'The crisis', sub: 'S', blocks } as ConversationSpec,
  narration: 'Here it is.',
  tier: 'frontier',
  ...extra,
});

const prior: TurnSnapshot = {
  question: QUESTION,
  narration: 'The crisis had four causes.',
  title: 'The crisis',
  blockTypes: ['insight', 'world'],
};

/** The single world block on a settled canvas. */
const worldOn = (blocks: Block[]): Block & { props: { world: WorldSpec } } => {
  const found = blocks.filter((b) => b.type === 'world');
  expect(found).toHaveLength(1);
  return found[0] as Block & { props: { world: WorldSpec } };
};

describe('a world block through the turn lifecycle', () => {
  it('survives an augment turn that adds nothing about it', () => {
    const first = settleTurn(
      null,
      [],
      QUESTION,
      result([blk('insight', 'Four causes'), worldBlock(world())]),
    );
    expect(first.mode).toBe('replace');
    expect(worldOn(first.frame.spec.blocks).props.world.nodes).toHaveLength(3);

    const next = settleTurn(
      prior,
      first.frame.spec.blocks,
      'and what did the crisis cost?',
      result([blk('stat', 'Cost of the crisis')], { continuity: 'augment' }),
    );
    expect(next.mode).toBe('augment');
    // The standing world is carried over untouched, and only one exists.
    expect(worldOn(next.frame.spec.blocks).props.world.nodes.map((n) => n.id)).toEqual([
      'cheap-mortgages',
      'securitization',
      'credit-crisis',
    ]);
  });

  it('a refine turn carrying the EVOLVED world replaces the card in place, never beside it', () => {
    const first = settleTurn(
      null,
      [],
      QUESTION,
      result([blk('insight', 'Four causes'), worldBlock(world())]),
    );
    const evolved = world({
      nodes: [
        ...world().nodes,
        { id: 'ratings', label: 'Ratings agencies', role: 'mechanism', depth: 1, tier: 'T0' },
      ],
    });
    // The title is pinned by mapOntoWorld, so the evolved block's signature is the SAME.
    expect(blockSignature(worldBlock(evolved))).toBe(blockSignature(worldBlock(world())));

    const next = settleTurn(
      prior,
      first.frame.spec.blocks,
      'show me that over time',
      result([worldBlock(evolved)], { continuity: 'refine' }),
    );
    expect(next.mode).toBe('refine');
    expect(next.frame.spec.blocks).toHaveLength(2);
    const card = worldOn(next.frame.spec.blocks);
    expect(card.props.world.nodes.map((n) => n.id)).toContain('ratings');
    // Replaced in its own slot — the answer above it is undisturbed.
    expect(next.frame.spec.blocks[0].type).toBe('insight');
  });

  it('a world whose question differs opens a SECOND card rather than overwriting the first', () => {
    const first = settleTurn(null, [], QUESTION, result([worldBlock(world())]));
    const other = world({ title: 'Why did the dot-com bubble burst?' });
    const next = settleTurn(
      prior,
      first.frame.spec.blocks,
      'why did the dot-com bubble burst?',
      result([worldBlock(other)], { continuity: 'refine' }),
    );
    const worlds = next.frame.spec.blocks.filter((b) => b.type === 'world');
    expect(worlds).toHaveLength(2);
  });

  it('renumbering block ids leaves the world’s semantic node ids alone', () => {
    const first = settleTurn(
      null,
      [],
      QUESTION,
      result([blk('insight', 'Four causes'), worldBlock(world())]),
    );
    const next = settleTurn(
      prior,
      first.frame.spec.blocks,
      'add the timeline too',
      result([blk('timeline', 'The collapse, week by week')], { continuity: 'augment' }),
    );
    // Block ids are re-numbered across the merged canvas...
    expect(next.frame.spec.blocks.map((b) => b.id)).toEqual(['live-1', 'live-2', 'live-3']);
    // ...while the ids a follow-up has to echo to evolve this world are untouched.
    const card = worldOn(next.frame.spec.blocks);
    expect(card.id).toBe('live-2');
    expect(card.props.world.nodes.map((n) => n.id)).toEqual([
      'cheap-mortgages',
      'securitization',
      'credit-crisis',
    ]);
    expect(card.props.world.edges[0]).toMatchObject({
      from: 'cheap-mortgages',
      to: 'credit-crisis',
    });
    expect(card.props.world.outcomeId).toBe('credit-crisis');
  });
});

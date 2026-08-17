// world-fitness.test.ts — whether the ANSWER has a causal web worth opening.
//
// The model's own `causal` flag is the primary judge and this is the fallback for one that omits it.
// It used to be a regex over the reader's words whose refusal list WAS the gate: anything not
// obviously a lookup, an artifact ask, a procedure, a comparison or arithmetic got a world card, so
// "tell me about elephants" and "describe Brooklyn" both did. Offering costs no tokens, but it costs
// the answer's last slot, and a card that opens onto nothing is a promise broken twice.
import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { worldFitness } from '../src/live/world/fitness';

// Real block TYPES, chosen one per archetype the gate reasons about — a fitness verdict is only
// meaningful against types the catalog actually knows, and every archetype name below is a
// different thing from the type that carries it (`code` is an archetype; `stacktrace` is a block).
const A = {
  flow: 'sankey',
  graph: 'diagramflow',
  tree: 'treemap',
  timeline: 'gantt',
  prose: 'verse',
  stat: 'gauge',
  code: 'stacktrace',
  media: 'gallery',
  map: 'geomap',
  table: 'receipt',
} as const;

/** Blocks by type only — fitness reads the catalog's archetype, never the props. */
const blocks = (...types: string[]): Block[] =>
  types.map((type, i) => ({ id: `b${i}`, type, props: {} }) as unknown as Block);

describe('worldFitness', () => {
  it('offers on STRUCTURE: a flow, graph or tree is a web the model already drew', () => {
    expect(worldFitness({ blocks: blocks(A.flow) })).toEqual({
      offer: true,
      reason: 'structure',
    });
    // No prose needed — a drawn web is more direct evidence than any reading of the words.
    expect(worldFitness({ blocks: blocks(A.stat, A.flow), narration: '' }).offer).toBe(true);
  });

  it('offers on PROSE when the answer states two distinct causal relations', () => {
    expect(
      worldFitness({
        blocks: blocks(A.prose),
        narration:
          'Rates fell because the central bank cut, and that drove a surge in refinancing.',
      }),
    ).toEqual({ offer: true, reason: 'prose' });
  });

  it('refuses on ONE relation — a passing "because" in an answer about something else', () => {
    expect(
      worldFitness({
        blocks: blocks(A.prose),
        narration:
          'Elephants are the largest land animals, partly because of their long gestation.',
      }),
    ).toEqual({ offer: false, reason: 'no-web' });
  });

  it('refuses the asks the old gate handed a card to', () => {
    // "Tell me about elephants" — a descriptive answer with no mechanism in it.
    expect(
      worldFitness({
        blocks: blocks(A.prose, A.stat, A.media),
        narration:
          'Elephants live in matriarchal herds across Africa and Asia, and are known for memory and grief.',
      }).offer,
    ).toBe(false);
    // "Describe Brooklyn" — a place, not a cascade.
    expect(
      worldFitness({
        blocks: blocks(A.prose, A.map),
        narration:
          'Brooklyn is New York City’s most populous borough, spanning brownstones and beaches.',
      }).offer,
    ).toBe(false);
  });

  it('refuses an answer that is only an ARTIFACT, whatever its prose says', () => {
    // A code answer explains nothing to walk, even when the words around it read causally.
    expect(
      worldFitness({
        blocks: blocks(A.code),
        narration: 'It fails because the ref is stale, which caused the effect to re-run.',
      }),
    ).toEqual({ offer: false, reason: 'artifact-only' });
  });

  it('does not read a TIMELINE as a causal web', () => {
    // A sequence of events is not a claim that any of them caused the next; treating it as one is
    // how a world gets offered on a company history.
    expect(worldFitness({ blocks: blocks(A.timeline), narration: 'Founded in 1971.' })).toEqual({
      offer: false,
      reason: 'no-web',
    });
  });

  it('is not tripped by the same relation stated twice', () => {
    // Distinct MATCHES, not match count: one claim repeated is still one relation.
    expect(
      worldFitness({
        blocks: blocks(A.prose),
        narration: 'It caused the delay. The same thing caused it again the next week.',
      }).offer,
    ).toBe(false);
  });

  it('does not read a temporal "since" as a causal one', () => {
    // "since 2004" dates a claim rather than explaining one, and counting it is the easiest way for
    // a company history to look like a mechanism.
    expect(
      worldFitness({
        blocks: blocks(A.prose),
        narration: 'Revenue has grown since 2004, and margins have held since 2011.',
      }).offer,
    ).toBe(false);
  });

  it('survives an answer with no blocks and no narration', () => {
    expect(worldFitness({ blocks: [] })).toEqual({ offer: false, reason: 'no-web' });
  });

  it('ignores a block type the catalog does not know, rather than guessing at it', () => {
    expect(worldFitness({ blocks: blocks('not-a-real-block-type') }).reason).toBe('no-web');
  });
});

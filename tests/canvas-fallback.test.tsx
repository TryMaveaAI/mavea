// canvas-fallback.test.tsx — the "content never vanishes" invariant.
//
// The failure this guards: a block passed validation (so its concept-section header
// rendered) but its component threw on an unexpected prop shape — BlockBoundary swallowed
// the error and rendered NOTHING, leaving an orphaned section header above an empty grid
// (a whole recipe once disappeared this way). Now every failed block degrades to its
// FallbackCard: the block's real text as a plain card. These tests pin all three failure
// lanes (component throw, unknown type, the original recipecard coercion bug) and the
// projection util itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TopicCanvas } from '../src/canvas/TopicCanvas';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { projectText } from '../src/canvas/lib/projectText';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';
import { primeExtendedRegistry } from '../src/canvas/blocks/loader';

primeExtendedRegistry(EXTENDED_REGISTRY);

function specFor(blocks: Block[]): ConversationSpec {
  return {
    id: 'money',
    workspace: 'Test',
    title: 'Title',
    sub: 'Sub',
    opener: '',
    context: [{ name: 'Source', color: 'var(--presence)' }],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  };
}

// A throwing component logs through React + BlockBoundary — keep the runs quiet.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the recipe regression — recipecard through the real validation path', () => {
  // The exact shape of the failure: the model answers a recipe ask with plain-string
  // steps (as its taught example shows). The old itemShapes entry objectified each step,
  // so RecipeCard rendered objects as React children, threw, and the card vanished under
  // its section header.
  const rawTurn = {
    title: 'Masala chai',
    narration: 'A proper chai is all about the spice blend.',
    blocks: [
      {
        type: 'recipecard',
        section: 'The Recipe',
        order: 1,
        props: {
          title: 'Masala chai latte',
          ingredients: [
            { qty: '2 cups', name: 'whole milk' },
            { qty: '1 tbsp', name: 'black tea leaves' },
          ],
          steps: ['Simmer the spices in water.', 'Add tea and milk, then strain.'],
          tips: ['Crush the cardamom pods first.'],
        },
      },
    ],
  };

  it('renders the REAL RecipeCard with its steps as text', () => {
    const r = validateLiveResponse(rawTurn, new Set(['recipecard']), 6, true);
    expect(r).not.toBeNull();
    expect(r!.blocks).toHaveLength(1);
    const props = r!.blocks[0].props as { steps: unknown };
    expect(props.steps).toEqual(['Simmer the spices in water.', 'Add tea and milk, then strain.']);

    const { container } = render(
      <TopicCanvas data={specFor(r!.blocks)} spot={null} built={{}} onProve={() => {}} />,
    );
    expect(container.textContent).toContain('Simmer the spices in water.');
    expect(container.querySelector('.fb-card')).toBeNull(); // the designed component, not the fallback
  });

  it('flattens objectified steps back to plain strings (the shape models drift to)', () => {
    const drifted = {
      ...rawTurn,
      blocks: [
        {
          ...rawTurn.blocks[0],
          props: {
            ...rawTurn.blocks[0].props,
            steps: [
              { step: 1, text: 'Simmer the spices in water.' },
              { text: 'Strain and serve.' },
            ],
          },
        },
      ],
    };
    const r = validateLiveResponse(drifted, new Set(['recipecard']), 6, true);
    expect(r).not.toBeNull();
    const props = r!.blocks[0].props as { steps: unknown };
    expect(props.steps).toEqual(['Simmer the spices in water.', 'Strain and serve.']);
  });
});

describe('the fallback invariant — a failed block still shows its content', () => {
  it('a component that throws degrades to a FallbackCard, never to nothing', () => {
    // ingredients as a string passes no coercion here (block built directly) — RecipeCard
    // calls .map on it and throws. The boundary must swap in the fallback with the text.
    const block = {
      type: 'recipecard',
      col: 10,
      delay: 0,
      id: 'live-1',
      section: 'The Recipe',
      props: {
        title: 'Masala chai latte',
        ingredients: 'milk, tea, spices',
        steps: ['Simmer the spices.'],
      },
    } as unknown as Block;

    const { container } = render(
      <TopicCanvas data={specFor([block])} spot={null} built={{}} onProve={() => {}} />,
    );
    const fb = container.querySelector('.fb-card');
    expect(fb).not.toBeNull();
    expect(fb!.textContent).toContain('Masala chai latte');
    expect(fb!.textContent).toContain('Simmer the spices.');
    // The section header must not sit orphaned above an empty grid.
    const header = container.querySelector('.depth-section-label');
    expect(header?.textContent).toBe('The Recipe');
  });

  it('an unknown block type renders a FallbackCard instead of an empty cell', () => {
    const block = {
      type: 'nosuchblock',
      col: 6,
      delay: 0,
      id: 'live-1',
      props: { title: 'Orphan content', items: ['first fact', 'second fact'] },
    } as unknown as Block;

    const { container } = render(
      <TopicCanvas data={specFor([block])} spot={null} built={{}} onProve={() => {}} />,
    );
    const fb = container.querySelector('.fb-card');
    expect(fb).not.toBeNull();
    expect(fb!.textContent).toContain('Orphan content');
    expect(fb!.textContent).toContain('first fact');
  });
});

describe('projectText — the textual projection behind FallbackCard', () => {
  it('recovers heading and lines from mixed prop shapes', () => {
    const p = projectText({
      title: 'Masala chai',
      icon: 'sparkle',
      iconColor: 'var(--presence)',
      ingredients: [{ qty: '2 cups', name: 'whole milk' }, '1 tbsp black tea'],
      steps: [{ step: 1, text: 'Simmer the spices.' }],
      difficulty: 'easy',
    });
    expect(p.title).toBe('Masala chai');
    expect(p.lines).toContain('whole milk — 2 cups');
    expect(p.lines).toContain('1 tbsp black tea');
    expect(p.lines).toContain('Simmer the spices.');
    // Style tokens never leak into the projection.
    expect(p.lines.join(' ')).not.toContain('var(--');
    expect(p.lines.join(' ')).not.toContain('sparkle');
  });

  it('never throws on hostile shapes', () => {
    expect(projectText(null).lines).toEqual([]);
    expect(projectText('just a string').lines).toEqual([]);
    expect(projectText([1, 2, 3]).lines).toEqual([]);
    expect(projectText({ a: { deeply: { nested: true } }, b: [[1], [2]] }).lines).toEqual([]);
  });

  it('caps runaway line counts and reports the remainder', () => {
    const p = projectText({ items: Array.from({ length: 40 }, (_, i) => `line ${i} of content`) });
    expect(p.lines).toHaveLength(14);
    expect(p.more).toBe(26);
  });
});

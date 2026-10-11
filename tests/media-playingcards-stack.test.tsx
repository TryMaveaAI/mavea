import { readFileSync } from 'node:fs';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STACK_STEP_X, STACK_STEP_Y, stackBox } from '../src/canvas/blocks/media/cardStack';
import { PlayingCards } from '../src/canvas/blocks/media/PlayingCards';

afterEach(cleanup);

const CARD_ASPECT = 250 / 350;

describe('a cascaded pile fills its box exactly', () => {
  it.each([1, 2, 3, 5, 7])('%i cards', (shown) => {
    const box = stackBox(shown, CARD_ASPECT);
    const depth = shown - 1;
    // In units of the box width: the last card's right edge and bottom edge.
    const cardW = box.cardPct / 100;
    const cardH = cardW / CARD_ASPECT;
    const right = cardW * (1 + depth * STACK_STEP_X);
    const bottom = cardH * (1 + depth * STACK_STEP_Y);
    expect(right).toBeCloseTo(1, 9);
    expect(bottom).toBeCloseTo(1 / box.aspect, 9);
  });
});

describe('every layout shares one card size', () => {
  it('caps the fan, the row and the pile at the same width', () => {
    const css = readFileSync('src/canvas/blocks/media/styles.css', 'utf8');
    expect(css).toMatch(/\.pcd-wrap\s*\{[^}]*--pcd-w:\s*\d+px/);
    expect(css).toMatch(/\.pcd-rowcard\s*\{[^}]*var\(--pcd-w\)/);
    expect(css).toMatch(/\.pcd-stack\s*\{[^}]*var\(--pcd-w\)/);
    const { container } = render(
      <PlayingCards
        title="Hand"
        groups={[
          {
            label: 'Hand',
            layout: 'fan',
            cards: [
              { rank: 'A', suit: 'spades' },
              { rank: 'K', suit: 'spades' },
            ],
          },
          {
            label: 'Deck',
            layout: 'stack',
            cards: [{ faceDown: true }, { faceDown: true }, { faceDown: true }],
          },
        ]}
      />,
    );
    // A two-card fan once took a quarter of a wide card each, three and a half times the
    // board's cards beside it.
    for (const fan of container.querySelectorAll<HTMLElement>('.pcd-fancard')) {
      expect(fan.style.width).toContain('var(--pcd-w)');
    }
    const stack = container.querySelector<HTMLElement>('.pcd-stack')!;
    expect(stack.style.getPropertyValue('--pcd-stack-scale')).toBe(String(1 + 2 * STACK_STEP_X));
  });
});

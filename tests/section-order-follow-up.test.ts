import { describe, expect, it } from 'vitest';
import type { Block } from '../src/data/conversation';
import { continueOrder, mergeForMode } from '../src/live/lifecycle';
import { depthLens } from '../src/live/depth/depthLens';
import { loadDemoConversation } from '../src/demo/corpus';

// A follow-up that adds cards must not rearrange the board the reader is on. Every answer numbers
// its sections from 1 and the canvas sorts sections by that number, so a follow-up's sections
// used to sort in among the board's first ones and push everything below them down the page.
const card = (title: string, section: string, order: number, summary = title): Block => ({
  type: 'insight',
  id: title,
  col: 12,
  num: '1',
  section,
  order,
  props: { title, summary },
});

const labels = (blocks: readonly Block[]): string[] => depthLens(blocks).map((s) => s.label);

describe('section order across a follow-up', () => {
  const board = [card('a', 'Basics', 1), card('b', 'Flow', 2), card('c', 'Pitfalls', 3)];

  it('puts the sections a follow-up adds after the board it joins', () => {
    const next = [card('d', 'Tokens', 1), card('e', 'Scopes', 2)];
    const merged = mergeForMode(board, next, 'augment').blocks;
    expect(labels(merged)).toEqual(['Basics', 'Flow', 'Pitfalls', 'Tokens', 'Scopes']);
  });

  it('keeps an edited card in its place', () => {
    const edited = card('b', 'Flow', 5, 'revised');
    const merged = mergeForMode(board, [edited], 'refine').blocks;
    expect(labels(merged)).toEqual(['Basics', 'Flow', 'Pitfalls']);
  });

  it('continues a follow-up once, however many times it is asked', () => {
    const next = [card('d', 'Tokens', 1), card('e', 'Scopes', 2)];
    const once = continueOrder(board, next);
    expect(once.map((b) => b.order)).toEqual([4, 5]);
    expect(continueOrder(board, once).map((b) => b.order)).toEqual([4, 5]);
  });

  it.each(['dev', 'pm', 'student', 'traveler'])(
    'leaves a %s replay that already continues its sections as it is',
    async (persona) => {
      const frames = (await loadDemoConversation(persona))?.frames ?? [];
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].mode === 'replace') continue;
        const board = frames[i - 1].spec.blocks;
        const added = frames[i].spec.blocks.slice(board.length);
        expect(continueOrder(board, added)).toEqual(added);
      }
    },
  );

  it.each(['dev', 'pm', 'student', 'traveler'])(
    'never moves a section already on the board in the %s replay',
    async (persona) => {
      const frames = (await loadDemoConversation(persona))?.frames ?? [];
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].mode === 'replace') continue;
        const before = labels(frames[i - 1].spec.blocks);
        expect(labels(frames[i].spec.blocks).slice(0, before.length)).toEqual(before);
      }
    },
  );
});

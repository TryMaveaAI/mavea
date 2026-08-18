import { render, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConversationSpec, Block } from '../src/data/conversation';

// The speak-then-show choreography must never dim a canvas that already has content: the
// intro hold (centered face + scrim) is for an EMPTY stage. The regression this locks: blocks
// stream in, the narration starts, and the scrim + centered face hid the freshly revealed
// cards for the ~1.1s hold — reading as the answer being torn down and rebuilt.

let resolveTurn: ((r: unknown) => void) | null = null;
let onDeltaRef: ((c: string) => void) | null = null;
let onPartialRef: ((p: { spec: ConversationSpec }) => void) | null = null;

/** One animation frame — the beat the streamed-partial dispatch coalesces onto. */
function frame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function block(id: string, title: string): Block {
  return {
    type: 'insight',
    id,
    col: 6,
    num: '1',
    props: { title, summary: 's', conf: 'inferred' },
  } as unknown as Block;
}
function spec(blocks: Block[]): ConversationSpec {
  return {
    id: 's',
    workspace: 'W',
    title: 'Capsule wardrobe',
    sub: '',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

vi.mock('../src/live/generateLive', () => ({
  checkLiveReady: vi.fn(async () => ({ ok: true })),
  describeLiveError: (e: unknown) => String(e),
  generateLive: vi.fn(
    (
      _text: string,
      _hist: unknown,
      _cfg: unknown,
      onDelta?: (c: string) => void,
      opts?: { onPartial?: (p: { spec: ConversationSpec }) => void },
    ) => {
      onDeltaRef = onDelta ?? null;
      onPartialRef = opts?.onPartial ?? null;
      return new Promise((res) => {
        resolveTurn = res;
      });
    },
  ),
}));

// This test owns LiveApp's intro-hold choreography, not TopicCanvas's independently tested
// renderer or its network-shaped lazy chunk. Keep a tiny structural stand-in here so the test
// observes card preservation synchronously and cannot pass or fail based on module-cache timing.
vi.mock('../src/canvas/TopicCanvas', () => ({
  TopicCanvas: ({ data }: { data: ConversationSpec }) => (
    <div className="card-grid">
      {data.blocks.map((item, index) => (
        <div className="card" key={item.id ?? index} />
      ))}
    </div>
  ),
}));

import { LiveApp } from '../src/live/LiveApp';
import { acceptLegalTerms } from '../src/legal/acceptance';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import { stashSeedQuery } from '../src/live/seedQuery';

afterEach(() => cleanup());
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('mavea-live-setup-v1', '1');
  // A seeded #/live mount sits behind the route-level LegalGate in production; a real turn
  // fails closed without the recorded acceptance, so the test records it the same way.
  acceptLegalTerms();
  setLiveConfigV2({ provider: 'anthropic', model: 'm', keys: { anthropic: 'k' } } as never);
});

const scrimShown = (): boolean => !!document.querySelector('.presence-scrim.show');
const cardCount = (): number => document.querySelectorAll('.card-grid .card').length;

it('never dims or drops streamed cards once the canvas has content', async () => {
  stashSeedQuery('how do I build a capsule wardrobe');
  render(<LiveApp />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

  // First streamed block lands — the canvas now has content.
  await act(async () => {
    onPartialRef?.({ spec: spec([block('b1', 'Timeline')]) });
  });
  expect(cardCount()).toBe(1);
  expect(scrimShown()).toBe(false);

  // Narration streams AFTER the cards (the race that used to re-dim): the intro hold must
  // already be released, so the scrim never covers the revealed cards.
  await act(async () => {
    onDeltaRef?.('Building a capsule wardrobe is about choosing quality over quantity. ');
  });
  expect(scrimShown()).toBe(false);
  expect(cardCount()).toBe(1);

  // Every partial after the first is coalesced into one dispatch per animation frame, so the
  // canvas paints once per frame however many blocks close inside it — let that frame run.
  await act(async () => {
    onPartialRef?.({ spec: spec([block('b1', 'Timeline'), block('b2', 'Details')]) });
    await frame();
  });
  expect(cardCount()).toBe(2);
  expect(scrimShown()).toBe(false);

  await act(async () => {
    resolveTurn?.({
      spec: spec([block('b1', 'Timeline'), block('b2', 'Details'), block('b3', 'Budget')]),
      narration: 'Building a capsule wardrobe is about choosing quality over quantity.',
      understood: [],
      tour: [],
    });
    await new Promise((r) => setTimeout(r, 60));
  });
  // Settle keeps every card (streamed turns reconcile in place — no remount, no drop to zero).
  expect(cardCount()).toBe(3);
  expect(scrimShown()).toBe(false);
});

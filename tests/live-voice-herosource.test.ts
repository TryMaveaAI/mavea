import { describe, it, expect } from 'vitest';
import { heroSource } from '../src/live/voice/heroSource';
import type { ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';

const spec = (title: string): ConversationSpec =>
  ({ title, blocks: [] }) as unknown as ConversationSpec;

function frame(question: string, narration: string, title = 'T'): TurnFrame {
  return { question, narration, mode: 'replace', tour: [], spec: spec(title), at: 1 } as TurnFrame;
}

describe('heroSource — what the answer hero shows', () => {
  it('shows nothing without a canvas', () => {
    expect(
      heroSource({ spec: null, frames: [], viewIndex: null, narration: 'x', lastAsk: 'q' }),
    ).toBeNull();
  });

  it('live head: the streaming narration + the latest ask', () => {
    expect(
      heroSource({
        spec: spec('Now'),
        frames: [frame('old q', 'old line')],
        viewIndex: null,
        narration: 'fresh line streaming in',
        lastAsk: 'new q',
      }),
    ).toEqual({ question: 'new q', narration: 'fresh line streaming in' });
  });

  it('a jumped-to past frame shows ITS ask and line', () => {
    expect(
      heroSource({
        spec: spec('Now'),
        frames: [frame('first q', 'first line'), frame('second q', 'second line')],
        viewIndex: 0,
        narration: 'live line',
        lastAsk: 'second q',
      }),
    ).toEqual({ question: 'first q', narration: 'first line' });
  });

  it('viewIndex at the live head behaves as live', () => {
    const r = heroSource({
      spec: spec('Now'),
      frames: [frame('q1', 'l1'), frame('q2', 'l2')],
      viewIndex: 1,
      narration: '',
      lastAsk: null,
    });
    expect(r).toEqual({ question: 'q2', narration: 'l2' });
  });

  it('a follow-up in flight keeps the PREVIOUS pairing — never the new ask over the old line', () => {
    // 'start' clears narration while the old canvas (and its hero line) stays on screen; the
    // new ask must not caption the old answer.
    expect(
      heroSource({
        spec: spec('Old'),
        frames: [frame('old q', 'old line')],
        viewIndex: null,
        narration: '',
        lastAsk: 'new q',
      }),
    ).toEqual({ question: 'old q', narration: 'old line' });
  });

  it('a restored canvas with no history falls back to the canvas title', () => {
    expect(
      heroSource({
        spec: spec('Lemon chicken, saved'),
        frames: [],
        viewIndex: null,
        narration: '',
        lastAsk: null,
      }),
    ).toEqual({ question: null, narration: 'Lemon chicken, saved' });
  });
});

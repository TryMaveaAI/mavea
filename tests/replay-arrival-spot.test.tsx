import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { TurnFrame } from '../src/live/history';
import type { Block } from '../src/data/conversation';
import { arrivalSpot, settleTurn } from '../src/live/settleTurn';
import type { LiveResult } from '../src/live/generateLive';
import { useLiveTurn } from '../src/live/useLiveTurn';
import { loadDemoConversation } from '../src/demo/corpus';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };
const devFrames: TurnFrame[] = (await loadDemoConversation('dev'))?.frames ?? [];

function frame(mode: TurnFrame['mode'], n: number, revision?: TurnFrame['revision']): TurnFrame {
  const blocks: Block[] = Array.from({ length: n }, (_, i) => ({
    type: 'insight',
    id: `live-${i + 1}`,
    col: 12,
    num: String(i + 1),
    props: { title: `Card ${i + 1}`, summary: 's' },
  }));
  return {
    ...devFrames[0],
    mode,
    tour: [],
    spec: { ...devFrames[0].spec, blocks },
    ...(revision ? { revision } : {}),
  };
}

describe('arrivalSpot — a replayed turn opens where the live one did', () => {
  it('opens a fresh canvas on its first card', () => {
    expect(arrivalSpot(frame('replace', 4), 7)).toBe('live-1');
  });

  it('opens an augment on the first card it added', () => {
    const added = { changedIds: [], addedIds: ['live-9', 'live-10'], unchangedCount: 8 };
    expect(arrivalSpot(frame('augment', 10, added), 8)).toBe('live-9');
  });

  it('finds the added cards of a frame baked before revisions were recorded', () => {
    expect(arrivalSpot(frame('augment', 12), 7)).toBe('live-8');
  });

  it('opens nowhere when a refine only edited cards', () => {
    const edited = { changedIds: ['live-2'], addedIds: [], unchangedCount: 3 };
    expect(arrivalSpot(frame('refine', 4, edited), 4)).toBeNull();
  });

  it('agrees with the live settle on the same merge', () => {
    const blk = (title: string): Block => ({
      type: 'insight',
      id: 'x',
      num: '1',
      col: 12,
      props: { title, summary: 's' },
    });
    const result = (blocks: Block[], continuity?: LiveResult['continuity']): LiveResult => ({
      spec: { ...devFrames[0].spec, blocks },
      narration: 'n',
      tier: 'frontier',
      ...(continuity ? { continuity } : {}),
    });
    const first = settleTurn(null, [], 'monthly budget breakdown', result([blk('Total')]));
    const settled = settleTurn(
      first.snap,
      first.frame.spec.blocks,
      'monthly budget by channel',
      result([blk('By channel')], 'augment'),
    );
    expect(settled.mode).toBe('augment');
    expect(arrivalSpot(settled.frame, first.frame.spec.blocks.length)).toBe(settled.spot);
  });

  it('lights the dev demo’s follow-up on its new cards, not the top of the board', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    act(() => result.current.showFrame(devFrames[0], 'q1', { revealNow: true, silent: true }));
    expect(result.current.spot).toBe('live-1');
    act(() => result.current.showFrame(devFrames[1], 'q2', { revealNow: true, silent: true }));
    expect(devFrames[1].mode).toBe('augment');
    expect(result.current.spot).toBe('live-8');
  });
});

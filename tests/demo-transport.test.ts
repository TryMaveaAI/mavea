// The curated replay's transport. Its buttons and its keyboard shortcuts drive the SAME driver,
// so anything one of them refuses the other has to refuse too: ← at the first step used to run
// prev() even though the Previous button is disabled there, which re-applied step 0 and left the
// session rail showing the opening moment twice.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDemoDriver } from '../src/demo/useDemoDriver';
import type { TourOps } from '../src/tour/useTourDriver';

// Hold the shard in flight: no step ever applies, so the transport is the only thing moving.
vi.mock('../src/demo/corpus', () => ({
  loadDemoConversation: () => new Promise(() => {}),
}));

/** Every op is a no-op: nothing under test reaches the real surface. */
const ops = (): TourOps => new Proxy({}, { get: () => () => {} }) as unknown as TourOps;

const driver = (muted = false) =>
  renderHook(() =>
    useDemoDriver({ active: true, personaId: 'dev', startStep: 0, muted, ops: ops() }),
  );

describe('demo transport', () => {
  it('ignores Previous at the first step, exactly as the disabled button does', () => {
    const { result } = driver();
    act(() => result.current.start());
    expect(result.current.index).toBe(0);
    expect(result.current.playing).toBe(true);

    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    // goto() pauses on the way back; a refused Previous must not even do that.
    expect(result.current.playing).toBe(true);
  });

  it('still steps back from anywhere else', () => {
    const { result } = driver();
    act(() => result.current.start());
    act(() => result.current.jumpTo(2));
    expect(result.current.index).toBe(2);
    act(() => result.current.prev());
    expect(result.current.index).toBe(1);
  });

  it('reports the surface’s own mute, so the dock and the transport cannot disagree', () => {
    const { result, rerender } = renderHook(
      ({ muted }: { muted: boolean }) =>
        useDemoDriver({ active: true, personaId: 'dev', startStep: 0, muted, ops: ops() }),
      { initialProps: { muted: false } },
    );
    expect(result.current.muted).toBe(false);
    // Muting from the dock (not the transport) must still flip the transport's label.
    rerender({ muted: true });
    expect(result.current.muted).toBe(true);
  });
});

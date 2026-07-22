import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTurnLatency, formatLatency } from '../src/live/voice/useTurnLatency';
import type { LiveStatus } from '../src/live/useLiveTurn';

afterEach(() => vi.restoreAllMocks());

describe('useTurnLatency — measured time-to-first-word', () => {
  it('clocks thinking → speaking and keeps the reading between turns', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    const { result, rerender } = renderHook(({ s }: { s: LiveStatus }) => useTurnLatency(s), {
      initialProps: { s: 'idle' as LiveStatus },
    });
    expect(result.current).toBeNull();

    rerender({ s: 'thinking' });
    now.mockReturnValue(1096);
    rerender({ s: 'speaking' });
    expect(result.current).toBe(96);

    // The reading survives the turn settling and the next idle.
    rerender({ s: 'showing' });
    rerender({ s: 'idle' });
    expect(result.current).toBe(96);
  });

  it('a turn that lands without narration clocks at showing', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(50);
    const { result, rerender } = renderHook(({ s }: { s: LiveStatus }) => useTurnLatency(s), {
      initialProps: { s: 'thinking' as LiveStatus },
    });
    now.mockReturnValue(1450);
    rerender({ s: 'showing' });
    expect(result.current).toBe(1400);
  });

  it('never reports without a measured turn', () => {
    const { result, rerender } = renderHook(({ s }: { s: LiveStatus }) => useTurnLatency(s), {
      initialProps: { s: 'showing' as LiveStatus },
    });
    rerender({ s: 'idle' });
    expect(result.current).toBeNull();
  });
});

describe('formatLatency', () => {
  it('formats the instrument readout', () => {
    expect(formatLatency(96)).toBe('96ms');
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(1400)).toBe('1.4s');
    expect(formatLatency(null)).toBeNull();
    expect(formatLatency(-5)).toBeNull();
  });
});

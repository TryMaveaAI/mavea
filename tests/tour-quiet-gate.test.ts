import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUIET_POLL_MS, QUIET_POLLS, startQuietGate } from '../src/tour/driverKit';

describe('walkthrough autoplay breathing room', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for a full quiet window after the minimum scene hold', () => {
    vi.useFakeTimers();
    const advance = vi.fn();
    const stop = startQuietGate({ minHoldMs: 1000, isQuiet: () => true, advance });

    vi.advanceTimersByTime(1000 + (QUIET_POLLS - 2) * QUIET_POLL_MS);
    expect(advance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(QUIET_POLL_MS);
    expect(advance).toHaveBeenCalledTimes(1);
    stop();
  });

  it('provides at least a 1.5 second pause before autoplay moves on', () => {
    expect((QUIET_POLLS - 1) * QUIET_POLL_MS).toBeGreaterThanOrEqual(1500);
  });
});

import { render, act, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useEffect, useRef } from 'react';

// The reveal tour is presentation choreography that must play exactly ONCE per turn. Its effect
// keys off `turn.turn`, but in dev a hot-module reload (Fast Refresh) re-runs effects with the
// component's refs/state preserved — re-firing the tour for the SAME turn over the resting canvas,
// and silently, since the reloaded audio modules tear their playback down. The fix is a `touredTurn`
// ref guard: run only when this turn hasn't toured yet. This test mirrors that wiring (the full tour
// lives inside LiveApp's turn engine) and locks the decision: an unchanged-turn re-fire is a no-op,
// a genuine new turn tours again.
afterEach(cleanup);

/** Mirrors LiveApp's reveal-tour guard. `refresh` stands in for an HMR/remount re-fire of the
 *  effect (an extra dependency that changes without the turn changing). `onWalk` fires once per
 *  tour that actually starts. */
function Harness({ turn, refresh, onWalk }: { turn: number; refresh: number; onWalk: () => void }) {
  const touredTurn = useRef<number | null>(null);
  useEffect(() => {
    if (touredTurn.current === turn) return;
    touredTurn.current = turn;
    onWalk();
    // The `refresh` dep makes the effect re-run without the turn changing, exactly as a hot
    // reload does; the guard above must absorb it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, refresh]);
  return null;
}

describe('Live reveal tour — plays once per turn', () => {
  it('tours a fresh turn exactly once', () => {
    const onWalk = vi.fn();
    render(<Harness turn={1} refresh={0} onWalk={onWalk} />);
    expect(onWalk).toHaveBeenCalledTimes(1);
  });

  it('does NOT replay when the effect re-fires for the same turn (hot reload / remount)', () => {
    const onWalk = vi.fn();
    const { rerender } = render(<Harness turn={1} refresh={0} onWalk={onWalk} />);
    expect(onWalk).toHaveBeenCalledTimes(1);
    // A hot reload re-runs the effect with the turn unchanged — the guard must swallow it.
    act(() => rerender(<Harness turn={1} refresh={1} onWalk={onWalk} />));
    act(() => rerender(<Harness turn={1} refresh={2} onWalk={onWalk} />));
    expect(onWalk).toHaveBeenCalledTimes(1);
  });

  it('tours again when a genuine new turn arrives', () => {
    const onWalk = vi.fn();
    const { rerender } = render(<Harness turn={1} refresh={0} onWalk={onWalk} />);
    act(() => rerender(<Harness turn={1} refresh={1} onWalk={onWalk} />)); // re-fire, ignored
    act(() => rerender(<Harness turn={2} refresh={1} onWalk={onWalk} />)); // new turn, tours
    expect(onWalk).toHaveBeenCalledTimes(2);
  });
});

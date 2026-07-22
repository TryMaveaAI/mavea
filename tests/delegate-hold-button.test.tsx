import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoldButton } from '../src/live/delegate/DelegatePanel';

// HoldButton guards the "approve your side of the deal" action — a confirm that copies a summary
// to the clipboard and flips the panel to its approved state. It MUST fire exactly once per
// deliberate hold. The keyboard path is the sharp edge: the OS auto-repeats keydown while a key is
// held, so without an `e.repeat` guard each repeat either re-armed the timer (the hold could never
// complete) or, once the timer fired, stacked fresh timers that each fired onConfirm again —
// approving (and copying) several times over. These tests pin the once-only + cancel behavior.

describe('DelegatePanel HoldButton', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fires onConfirm exactly once for a held key, despite OS auto-repeat', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const { getByRole } = render(<HoldButton label="Hold to approve" onConfirm={onConfirm} />);
    const btn = getByRole('button');

    fireEvent.keyDown(btn, { key: 'Enter' }); // arms the hold
    fireEvent.keyDown(btn, { key: 'Enter', repeat: true }); // auto-repeats must be ignored…
    fireEvent.keyDown(btn, { key: 'Enter', repeat: true });
    fireEvent.keyDown(btn, { key: 'Enter', repeat: true });
    act(() => vi.advanceTimersByTime(2000)); // …well past the hold duration

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the key is released before the hold completes', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const { getByRole } = render(<HoldButton label="Hold to approve" onConfirm={onConfirm} />);
    const btn = getByRole('button');

    fireEvent.keyDown(btn, { key: 'Enter' });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.keyUp(btn, { key: 'Enter' }); // released early — cancels
    act(() => vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not leave a timer that fires after unmount', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const { getByRole, unmount } = render(
      <HoldButton label="Hold to approve" onConfirm={onConfirm} />,
    );
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' }); // arms, then leaves
    unmount();
    act(() => vi.advanceTimersByTime(2000));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

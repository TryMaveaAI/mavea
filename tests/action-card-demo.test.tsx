// action-card-demo.test.tsx — the scripted demo's ActionCard must SIMULATE, never perform a real
// side-effect. It previously POSTed to `/actions/${mcpId}`, which 502'd with no gateway running and
// would fire a real side-effect if one were configured — wrong for a fictional persona. The card
// is demo-only and must stay offline.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ActionCard } from '../src/canvas/ActionCard';

describe('demo ActionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('confirming an action with an mcpId does NOT hit the network (simulates instead)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { getByText } = render(
      <ActionCard
        eyebrow="Action · reminder"
        title="Schedule a money check-in"
        cta="Add to calendar"
        doneText="Added · monthly money check-in"
        mcpId="calendar.addEvent"
        fields={[{ param: 'title', label: 'Title', value: 'Monthly money check-in' }]}
      />,
    );

    fireEvent.click(getByText('Add to calendar'));
    // advance past the simulated 1400ms "working" delay; the async flavor also flushes the
    // microtask that runs the `await`-continuation which flips the card to its done state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // The whole point: a gateway POST must never happen for the scripted demo.
    expect(fetchSpy).not.toHaveBeenCalled();
    // …and the card still reaches its success state.
    expect(getByText('Added · monthly money check-in')).toBeTruthy();
  });
});

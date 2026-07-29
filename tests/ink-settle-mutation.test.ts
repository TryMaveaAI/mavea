import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollUntilSettled } from '../src/live/annotate/settle';

// The stale-mark bug: a block that re-sorts its rows or expands inside its own capped scroller
// changes NOTHING the old triggers could see — the outer box is unchanged (no ResizeObserver),
// no transition fires on the host, no window resize — so the ink stayed parked on rows that had
// moved out from under it. The mutation observer re-arms the poll for real content changes, and
// ONLY those: the pen's own chrome (its layers, the badge state it stamps on the host) must
// never re-arm it, or every placement would trigger the next in a feedback loop.
describe('pollUntilSettled — content mutations re-arm the measurement', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function poll(host: HTMLElement) {
    const measure = vi.fn(() => ({ host }));
    const stop = pollUntilSettled(
      measure,
      () => 'stable',
      (r) => r.host,
      () => {},
    );
    return { measure, stop };
  }

  it('a row moving inside the card re-measures the mark', async () => {
    const host = document.createElement('div');
    const row = document.createElement('div');
    row.textContent = 'Shinjuku';
    host.appendChild(row);
    document.body.appendChild(host);
    const { measure, stop } = poll(host);
    await vi.advanceTimersByTimeAsync(400);
    const atRest = measure.mock.calls.length;
    expect(atRest).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(measure.mock.calls.length).toBe(atRest); // genuinely parked

    host.appendChild(row.cloneNode(true)); // a sort/expand re-renders the rows
    await vi.advanceTimersByTimeAsync(400);
    expect(measure.mock.calls.length).toBeGreaterThan(atRest);
    stop();
    host.remove();
  });

  it("the pen's own chrome and badge stamps never re-arm it", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { measure, stop } = poll(host);
    await vi.advanceTimersByTimeAsync(400);
    const atRest = measure.mock.calls.length;

    const ink = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ink.setAttribute('class', 'ink-layer');
    host.appendChild(ink); // the portal mounting its layer
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ink.appendChild(path); // strokes drawing inside it
    host.dataset.inking = 'key'; // the "MAVÉA IS DRAWING" badge state
    host.style.setProperty('--ink-badge-dur', '2.4s');
    await vi.advanceTimersByTimeAsync(600);
    expect(measure.mock.calls.length).toBe(atRest);
    stop();
    host.remove();
  });
});

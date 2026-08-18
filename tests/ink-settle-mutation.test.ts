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

// What made this the streaming path's quietest tax: a mark re-armed on every content mutation, and
// each re-arm threw away the settle state, so a card still receiving blocks paid a fresh two-read
// settle per delta and never stopped. Measuring is not cheap (it walks the card for the said text
// and reads layout), so the re-measure has to be worth taking: only when the mark actually MOVES.
describe('pollUntilSettled — a region that keeps changing is not re-measured forever', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a mutation that leaves the mark where it is costs ONE confirming read', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const measure = vi.fn(() => ({ host }));
    const stop = pollUntilSettled(
      measure,
      () => 'stable', // geometry never moves, however much the content churns
      (r) => r.host,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(measure).toHaveBeenCalledTimes(2); // first read, then the read that confirms it

    for (let i = 1; i <= 3; i++) {
      host.appendChild(document.createElement('span')); // a streamed row landing in the card
      await vi.advanceTimersByTimeAsync(400);
      expect(measure).toHaveBeenCalledTimes(2 + i); // one read each, not a fresh settle chain
    }
    stop();
    host.remove();
  });

  it('a region that never holds still slows down, stops chaining, and cannot be re-sped by events', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let n = 0;
    const measure = vi.fn(() => ({ host, key: `moved-${n++}` }));
    const stop = pollUntilSettled(
      measure,
      (r) => r.key, // every read finds different geometry: this card is still moving
      (r) => r.host,
      () => {},
    );

    await vi.advanceTimersByTimeAsync(2_000);
    const fast = measure.mock.calls.length;
    expect(fast).toBeLessThanOrEqual(18); // ~1.8s of fast reads, then the cadence relaxes

    await vi.advanceTimersByTimeAsync(20_000);
    const total = measure.mock.calls.length;
    expect(total).toBeGreaterThan(fast); // it kept following the movement…
    expect(total).toBeLessThanOrEqual(30); // …at a fifth the rate, then left the mark alone
    await vi.advanceTimersByTimeAsync(20_000);
    expect(measure.mock.calls.length).toBe(total); // no timer left running

    // The point of the budget: churn can't buy a fresh 10Hz burst. Each event is one read.
    host.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(measure.mock.calls.length).toBe(total + 1);
    stop();
    host.remove();
  });
});

// taskPool — the three promises mapConcurrent makes: results land in INPUT order no matter the
// completion order, the in-flight count never exceeds the limit, and one failure rejects the
// whole map instead of silently draining the rest of the queue.
import { describe, expect, it } from 'vitest';
import { mapConcurrent } from '../src/lib/taskPool';

/** Flush microtasks plus one macrotask, so a worker that just freed up can pull its next item. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

describe('mapConcurrent', () => {
  it('keeps results in input order even when items complete out of order', async () => {
    // Earlier items resolve LATER — order in the result must still be input order.
    const delays = [25, 1, 15, 5, 10];
    const out = await mapConcurrent(delays, 3, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return `item-${i}`;
    });
    expect(out).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
  });

  it('never has more than `limit` calls in flight', async () => {
    const resolvers: (() => void)[] = [];
    let inFlight = 0;
    let peak = 0;
    const pool = mapConcurrent([0, 1, 2, 3, 4], 2, (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise<number>((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(n);
        });
      });
    });
    await tick();
    expect(inFlight).toBe(2); // saturated up to the limit, no further
    // Release one at a time; each freed worker should pull exactly the next item.
    for (let released = 0; released < 5; released += 1) {
      expect(resolvers.length).toBeGreaterThan(0);
      resolvers.shift()!();
      await tick();
    }
    expect(await pool).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('rejects with the first failure and stops pulling new items', async () => {
    const started: number[] = [];
    await expect(
      mapConcurrent([0, 1, 2, 3, 4, 5], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
    // limit 1 makes the pull order deterministic: nothing after the failing item starts.
    expect(started).toEqual([0, 1, 2]);
  });
});

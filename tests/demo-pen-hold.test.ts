import { describe, expect, it } from 'vitest';
import { penHoldsStep } from '../src/demo/useDemoDriver';

// A replay step waits on its pen so a mark is never wiped mid-stroke, but a card that never comes
// to rest keeps its mark pending for ~8s before the poll gives up. The step's own hold bounds that.
describe('penHoldsStep', () => {
  const readyAt = 10_000;
  const holdMs = 3000;
  const at = (now: number, pending: boolean, drawing = false): boolean =>
    penHoldsStep({ now, readyAt, holdMs, pending, drawing });

  it('lets a step go when the pen is up', () => {
    expect(at(readyAt, false)).toBe(false);
  });

  it('holds a ready step while a mark is still being placed', () => {
    expect(at(readyAt + 1000, true)).toBe(true);
  });

  it('stops waiting on a mark that never lands once the step has held as long again', () => {
    expect(at(readyAt + holdMs - 1, true)).toBe(true);
    expect(at(readyAt + holdMs, true)).toBe(false);
    expect(at(readyAt + 8000, true)).toBe(false);
  });

  it('always lets a stroke that is drawing finish', () => {
    expect(at(readyAt + 8000, false, true)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { stepChipAt, strokeBounds, strokeFor, type Rect } from '../src/live/annotate/gesture';

const R = 9;
const host: Rect = { left: 0, top: 0, width: 900, height: 260 };
const hits = (c: { x: number; y: number }, o: Rect): boolean =>
  c.x + R > o.left && c.x - R < o.left + o.width && c.y + R > o.top && c.y - R < o.top + o.height;

describe('strokeBounds', () => {
  it('bounds every coordinate of the path and its head', () => {
    const b = strokeBounds({
      d: 'M 10 20 C 12 5 30 40 50 30',
      head: 'M 48 28 L 60 32',
      kind: 'point',
    });
    expect(b).toEqual({ left: 10, top: 5, width: 50, height: 35 });
  });
});

describe('stepChipAt — the step number never hides its own tick', () => {
  // A single-line checklist row on a tablet: the tick sits in the leading margin, and the pocket
  // above the row is taken by the previous row's tick.
  const row: Rect = { left: 52, top: 160, width: 460, height: 18 };
  const tick = strokeFor('check', row, host, 'live-7');
  const own = tick ? strokeBounds(tick) : null;
  const previousTick: Rect = { left: 29, top: 133, width: 16, height: 18 };

  it('parks beside the row when that pocket is on its own tick', () => {
    expect(own).not.toBeNull();
    const naive = stepChipAt(row, host, R, [previousTick]);
    // Without the own stroke the chip lands in the "beside" pocket — on the tick.
    expect(naive && hits(naive, own!)).toBe(true);
    const chip = stepChipAt(row, host, R, [previousTick], own);
    expect(chip).toBeDefined();
    expect(hits(chip!, own!)).toBe(false);
  });

  it('still tucks against the corner of its tick when the pocket above is free', () => {
    const chip = stepChipAt(row, host, R, [], own);
    expect(chip).toEqual({ x: row.left - R - 2, y: row.top - R - 2 });
  });
});

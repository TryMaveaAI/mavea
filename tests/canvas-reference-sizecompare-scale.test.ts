import { describe, expect, it } from 'vitest';
import {
  MAX_TRACK_H,
  SLOT_GAP,
  SLOT_MIN,
  sizeCompareScale,
} from '../src/canvas/blocks/reference/sizeCompareScale';

const bus = { w: 200, h: 90, orient: 'horizontal' as const };
const human = { w: 40, h: 100, orient: 'vertical' as const };
const building = { w: 70, h: 160, orient: 'vertical' as const };
const bar = { w: 100, h: 18, orient: 'horizontal' as const, thickness: 18 };

const subjects = [
  { length: 1.4, box: human, label: 'You (a kid)' },
  { length: 12, box: bus, label: 'School bus' },
  { length: 12, box: bar, label: 'T. rex' },
  { length: 37, box: bar, label: 'Argentinosaurus' },
];

const rowWidth = (sizes: { width: number }[]) =>
  sizes.reduce((sum, s) => sum + Math.max(s.width, SLOT_MIN), 0) + SLOT_GAP * (sizes.length - 1);

describe('SizeCompare scale', () => {
  it('draws every subject on one pixels-per-unit scale', () => {
    const [, b, t, a] = sizeCompareScale(subjects, 1000);
    expect(t.width).toBeCloseTo(b.width, 6);
    expect(a.width / t.width).toBeCloseTo(37 / 12, 6);
  });

  it('grows with the card and never overflows a card that can hold it', () => {
    const narrow = sizeCompareScale(subjects, 700);
    const wide = sizeCompareScale(subjects, 1400);
    expect(wide[3].width).toBeGreaterThan(narrow[3].width);
    for (const W of [700, 1000, 1400])
      expect(rowWidth(sizeCompareScale(subjects, W))).toBeLessThanOrEqual(W + 1);
  });

  it('caps the tallest figure at the track height', () => {
    const sizes = sizeCompareScale(
      [
        { length: 300, box: building, label: 'Tower' },
        { length: 2, box: human, label: 'Person' },
      ],
      4000,
    );
    expect(Math.max(...sizes.map((s) => s.height))).toBeLessThanOrEqual(MAX_TRACK_H + 0.001);
  });

  it('gives a length-only subject a fixed thickness, not an invented height', () => {
    for (const s of sizeCompareScale(subjects, 1200).slice(2)) expect(s.height).toBe(18);
  });

  it('survives missing and bad lengths', () => {
    const sizes = sizeCompareScale(
      [
        { length: undefined, box: bus },
        { length: Number.NaN, box: human },
        { length: -4, box: building },
      ],
      600,
    );
    for (const s of sizes) {
      expect(Number.isFinite(s.width) && s.width > 0).toBe(true);
      expect(Number.isFinite(s.height) && s.height > 0).toBe(true);
    }
  });
});

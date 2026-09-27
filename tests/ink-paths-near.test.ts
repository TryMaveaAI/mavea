import { describe, it, expect } from 'vitest';
import { pathsNear } from '../src/live/annotate/geometry';

// A re-read of a drawn mark keeps the drawn stroke only when the reader could not tell the two
// apart. The whole path is compared, not just the target's box: the same anchor can carry a
// different stroke (an underline tucked tight under a crowded row, a caption moved to clear text).
describe('pathsNear', () => {
  it('treats a sub-pixel re-read as the same stroke', () => {
    expect(pathsNear('M 10 20 Q 30.2 21 50 20', 'M 10.4 20.3 Q 30.9 21.5 50.2 19.6')).toBe(true);
  });

  it('sees a stroke that moved by more than a pixel anywhere along it', () => {
    expect(pathsNear('M 10 20 Q 30 21 50 20', 'M 10 20 Q 30 21 50 23')).toBe(false);
  });

  it('sees a different shape even at the same points', () => {
    expect(pathsNear('M 10 20 L 50 20', 'M 10 20 Q 50 20')).toBe(false);
    expect(pathsNear('M 10 20 L 50 20', 'M 10 20 L 50 20 L 60 20')).toBe(false);
  });

  it('matches two absent arrowheads', () => {
    expect(pathsNear('', '')).toBe(true);
    expect(pathsNear('', 'M 1 1 L 2 2')).toBe(false);
  });
});

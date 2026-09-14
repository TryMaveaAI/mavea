// The canvas is the product, so a rich answer fills the viewport — but the ceiling is a READING
// limit, not a screen one. These pin the band: past it the spotlight walk never reaches the tail,
// the one-paragraph narration ends while blocks are still arriving, and the reader is billed for
// output nobody points at.
import { describe, it, expect, afterEach } from 'vitest';
import { targetBlockCount, MAX_BLOCKS, LEAN_MIN_BLOCKS, LEAN_MAX_BLOCKS } from '../src/live/screen';

const sizeWindow = (w: number, h: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
};

describe('block-count band', () => {
  afterEach(() => sizeWindow(1024, 768));

  it('never asks for more than a reader can take in, on any display', () => {
    for (const [w, h] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ]) {
      sizeWindow(w, h);
      expect(targetBlockCount('rich')).toBeLessThanOrEqual(MAX_BLOCKS);
      expect(targetBlockCount('rich', { teaching: true })).toBeLessThanOrEqual(MAX_BLOCKS);
    }
    // Nine, not a round ten: the recorded corpus medians at seven and only reads as "too much"
    // from twelve, so the ceiling sits above the typical answer and below the overwhelming one.
    expect(MAX_BLOCKS).toBe(9);
  });

  it('still fills a laptop rather than leaving it bare', () => {
    sizeWindow(1440, 900);
    expect(targetBlockCount('rich')).toBeGreaterThanOrEqual(5);
  });

  it('keeps a teaching ask a complete lesson', () => {
    sizeWindow(1280, 800);
    expect(targetBlockCount('rich', { teaching: true })).toBeGreaterThanOrEqual(7);
  });

  // A trivial ask must never be inflated by the screen into the same canvas a substantive one
  // gets — that is billed output the reader did not ask for.
  it('keeps a simple ask clearly smaller than a substantive one, even on a big display', () => {
    sizeWindow(3840, 2160);
    expect(targetBlockCount('lean')).toBeLessThan(targetBlockCount('rich'));
  });

  it('holds a lean ask small and a brief ask tight, whatever the screen', () => {
    sizeWindow(3840, 2160);
    expect(targetBlockCount('lean')).toBeLessThanOrEqual(LEAN_MAX_BLOCKS);
    expect(targetBlockCount('lean')).toBeGreaterThanOrEqual(LEAN_MIN_BLOCKS);
    expect(targetBlockCount('brief')).toBe(3);
  });
});

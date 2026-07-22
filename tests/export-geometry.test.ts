import { describe, it, expect } from 'vitest';
import {
  contentHeight,
  contentWidth,
  pageSize,
  PAGE_H,
  PAGE_W,
  SAFETY_GUTTER,
} from '../src/export/paginate/geometry';

describe('pageSize', () => {
  it('returns Letter unchanged — byte-identical to the pre-existing PAGE_W/PAGE_H constants', () => {
    // Regression-critical: every export written before A4 support existed was laid out against
    // these exact numbers. Any drift here silently reflows every Letter document.
    expect(pageSize('letter')).toEqual({ width: 816, height: 1056 });
    expect(pageSize('letter')).toEqual({ width: PAGE_W, height: PAGE_H });
  });

  it('returns the correct A4 pixel dimensions at 96dpi (210mm × 297mm)', () => {
    expect(pageSize('a4')).toEqual({ width: 794, height: 1123 });
  });

  it('A4 is narrower and taller than Letter', () => {
    const letter = pageSize('letter');
    const a4 = pageSize('a4');
    expect(a4.width).toBeLessThan(letter.width);
    expect(a4.height).toBeGreaterThan(letter.height);
  });
});

describe('contentWidth / contentHeight — additive format parameter', () => {
  const PADDING = '64px 56px';

  it('omitting the format argument keeps the exact pre-existing Letter numbers', () => {
    expect(contentWidth(PADDING)).toBe(PAGE_W - 56 - 56);
    expect(contentWidth(PADDING)).toBe(contentWidth(PADDING, undefined, 'letter'));
    expect(contentHeight(PADDING, 100, 40)).toBe(PAGE_H - 64 - 64 - 100 - 40 - SAFETY_GUTTER);
    expect(contentHeight(PADDING, 100, 40)).toBe(contentHeight(PADDING, 100, 40, 'letter'));
  });

  it('scales down to A4s narrower/taller sheet when a format is passed', () => {
    const letterW = contentWidth(PADDING, undefined, 'letter');
    const a4W = contentWidth(PADDING, undefined, 'a4');
    expect(a4W).toBe(794 - 56 - 56);
    expect(a4W).toBeLessThan(letterW);

    const letterH = contentHeight(PADDING, 100, 40, 'letter');
    const a4H = contentHeight(PADDING, 100, 40, 'a4');
    expect(a4H).toBe(1123 - 64 - 64 - 100 - 40 - SAFETY_GUTTER);
    expect(a4H).toBeGreaterThan(letterH);
  });

  it('still honours a left page-rule border under A4', () => {
    expect(contentWidth(PADDING, '4px solid #000', 'a4')).toBe(794 - 56 - 56 - 4);
  });
});

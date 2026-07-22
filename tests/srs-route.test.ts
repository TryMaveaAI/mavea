import { describe, expect, it } from 'vitest';
import { flashHref, parseRoute } from '../src/live/srs/route';

describe('flashcards route', () => {
  it('parses the gallery and deck deep-links', () => {
    expect(parseRoute('#/flashcards')).toEqual({ view: 'gallery' });
    expect(parseRoute('#/flashcards/')).toEqual({ view: 'gallery' });
    expect(parseRoute('#/flashcards/deck/Bio%20101')).toEqual({ view: 'deck', deck: 'Bio 101' });
    expect(parseRoute('#/live')).toEqual({ view: 'gallery' });
  });

  it('flashHref builds encoded hrefs', () => {
    expect(flashHref.gallery).toBe('#/flashcards');
    expect(flashHref.deck('Bio 101')).toBe('#/flashcards/deck/Bio%20101');
  });
});

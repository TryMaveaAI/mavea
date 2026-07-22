import { describe, it, expect } from 'vitest';
import { SHOWCASE_TOUR_CHAPTERS } from '../src/flagship/sections/FlagshipShowcase';
import { chapterById } from '../src/tour/tourPlan';

// The showcase "Open scripted demo" buttons (and the "after the answer" strip) deep-link into
// tour chapters by id. Those ids are plain strings, so a chapter rename would silently turn a
// button into a dead link. This pins every one to a real chapter.
describe('flagship showcase deep-links resolve to real tour chapters', () => {
  it('has at least the nine expected deep-links', () => {
    // Prism/Think/Atlas vignettes + the six after-the-answer chips (Ripple opens its own overlay).
    expect(SHOWCASE_TOUR_CHAPTERS.length).toBeGreaterThanOrEqual(9);
  });

  it.each(SHOWCASE_TOUR_CHAPTERS)('chapter "%s" exists in the tour plan', (chapter) => {
    expect(chapterById(chapter), `no tour chapter with id "${chapter}"`).toBeDefined();
  });
});

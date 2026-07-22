import { describe, expect, it } from 'vitest';
import { montageSchedule } from '../src/tour/useTourDriver';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';

// Regression coverage for the chapter 8 → 9 ("canvas" → "range") transition: the montage chapter
// used to flip its first frame the instant it was entered (delay 0), landing in the very same
// tick as the previous chapter's exit (resetTriggers snaps the view back to flat) — two visual
// changes at once read as a confusing flash rather than a followable cut. montageSchedule adds a
// lead-in beat before the first flip and slows the per-frame pacing so each topic actually
// registers before the next replaces it.
describe('montageSchedule — the chapter 9 flip-book pacing', () => {
  it('never fires the first flip immediately — there is a lead-in beat', () => {
    const schedule = montageSchedule(3, 14500);
    expect(schedule[0]).toBeGreaterThan(0);
  });

  it('spaces frames at least ~1.6s apart, so each topic has time to register', () => {
    const schedule = montageSchedule(3, 7200);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i] - schedule[i - 1]).toBeGreaterThanOrEqual(1600);
    }
  });

  it('returns one delay per frame, in increasing order', () => {
    const schedule = montageSchedule(3, 14500);
    expect(schedule).toHaveLength(3);
    expect(schedule).toEqual([...schedule].sort((a, b) => a - b));
  });

  it('degrades gracefully with zero frames', () => {
    expect(montageSchedule(0, 14500)).toEqual([]);
  });

  it("the tour's own 'range' chapter gives the montage enough room for its lead-in + pacing", () => {
    const range = ALL_CHAPTERS.find((c) => c.id === 'range');
    expect(range).toBeDefined();
    if (range?.action.kind !== 'montage') throw new Error('range chapter is no longer a montage');
    const schedule = montageSchedule(range.action.convoIds.length, range.durationMs);
    // The last frame must still get a real hold before the chapter's own minimum duration ends.
    const lastFrameHold = range.durationMs - schedule[schedule.length - 1];
    expect(lastFrameHold).toBeGreaterThanOrEqual(1600);
  });
});

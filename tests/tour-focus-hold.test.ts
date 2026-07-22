import { describe, expect, it } from 'vitest';
import { focusWalkSchedule } from '../src/tour/useTourDriver';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';

// Regression coverage for chapter 10 ("focus", "One card at a time"): Focus mode used to kick in
// (dimming everything but the spotlit card) almost immediately after the chapter started, so the
// viewer never actually saw the normal, unblurred canvas it was transforming. focusWalkSchedule
// holds on the plain view for a few seconds first, THEN applies Focus, THEN walks the spotlight
// card by card.
describe('focusWalkSchedule — the "one card at a time" hold-then-focus beat', () => {
  it('holds a real beat before Focus mode applies', () => {
    const { focusAt } = focusWalkSchedule(4, 7200);
    expect(focusAt).toBeGreaterThanOrEqual(1200);
  });

  it('never spotlights a card before Focus mode has actually taken over', () => {
    const { focusAt, spotlightAt } = focusWalkSchedule(4, 14500);
    for (const t of spotlightAt) expect(t).toBeGreaterThan(focusAt);
  });

  it('returns one spotlight delay per card, strictly increasing', () => {
    const { spotlightAt } = focusWalkSchedule(4, 14500);
    expect(spotlightAt).toHaveLength(4);
    for (let i = 1; i < spotlightAt.length; i++)
      expect(spotlightAt[i]).toBeGreaterThan(spotlightAt[i - 1]);
  });

  it('degrades gracefully with zero cards', () => {
    const { spotlightAt } = focusWalkSchedule(0, 14500);
    expect(spotlightAt).toEqual([]);
  });

  it("the tour's own 'focus' chapter gives the walk a real hold on the last card", () => {
    const focus = ALL_CHAPTERS.find((c) => c.id === 'focus');
    expect(focus).toBeDefined();
    if (focus?.action.kind !== 'focusWalk')
      throw new Error('focus chapter is no longer a focusWalk');
    // 'money' has 4 cards in the baked corpus — asserted loosely here since the exact count lives
    // in the corpus fixture, not this plan; the schedule just needs room to breathe either way.
    const { spotlightAt } = focusWalkSchedule(4, focus.durationMs);
    const lastCardHold = focus.durationMs - spotlightAt[spotlightAt.length - 1];
    expect(lastCardHold).toBeGreaterThanOrEqual(900);
  });
});

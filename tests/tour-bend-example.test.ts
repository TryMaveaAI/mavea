import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_CHAPTERS } from '../src/tour/tourPlan';
import { loadTourCorpus, tourConversation } from '../src/tour/corpus';

// The corpus rides in a lazy chunk; tourConversation reads empty until this resolves.
beforeAll(() => loadTourCorpus());

// Regression coverage for chapter 3 ("bend", "Make it yours"): the demo used to drag an "Initial
// Investment" dial ($1,000–$50,000) — a lump sum most viewers don't have lying around, so the
// before/after didn't land as something that mattered to THEM. It now bends a "Monthly Rent" dial
// on a real buy-vs-rent comparison instead — a number almost everyone relates to directly.
describe('bend chapter — a relatable worked example', () => {
  it("seeds its own worked example rather than reusing whatever's already on screen", () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    expect(bend).toBeDefined();
    if (bend?.action.kind !== 'bend') throw new Error('bend chapter changed action kind');
    expect(bend.action.convoId).toBeTruthy();
  });

  it("the seeded conversation's bend spec is a relatable, everyday stat — not a lump sum", () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    if (bend?.action.kind !== 'bend' || !bend.action.convoId) throw new Error('no convoId');
    const convo = tourConversation(bend.action.convoId);
    const spec = convo?.frames[0]?.spec;
    expect(spec?.bend).toBeDefined();
    // "Rent" reads as something almost anyone pays monthly; a five-figure investment doesn't.
    expect(spec?.bend?.label.toLowerCase()).toContain('rent');
  });

  it('the bend range covers real, plausible monthly rents — not a token demo range', () => {
    const bend = ALL_CHAPTERS.find((c) => c.id === 'bend');
    if (bend?.action.kind !== 'bend' || !bend.action.convoId) throw new Error('no convoId');
    const convo = tourConversation(bend.action.convoId);
    const param = convo?.frames[0]?.spec.bend?.param;
    expect(param).toBeDefined();
    expect(param?.min).toBeGreaterThan(0);
    expect(param?.max).toBeGreaterThan(param?.min ?? 0);
    // The dragged value (scriptedBendRef glides to ~78% of the range) should land somewhere a
    // renter would recognize as a real, if high, monthly rent — not a wildly implausible figure.
    const dragged = (param?.min ?? 0) + ((param?.max ?? 0) - (param?.min ?? 0)) * 0.78;
    expect(dragged).toBeGreaterThan(1000);
    expect(dragged).toBeLessThan(20000);
  });

  it("the chip chapter's target chip actually exists on the base answer it reseeds", () => {
    // The 'chips' chapter now reseeds 'money' before pressing its chip (chapter 3's bend demo no
    // longer guarantees 'money' is on screen) — the chip label must be a real suggestion there.
    const chips = ALL_CHAPTERS.find((c) => c.id === 'chips');
    if (chips?.action.kind !== 'chip') throw new Error('chips chapter changed action kind');
    const money = tourConversation('money');
    const labels = money?.frames[0]?.spec.suggests?.map((s) => s.label) ?? [];
    expect(labels).toContain(chips.action.label);
  });
});

// memoryGolden.ts — the multi-turn, "seen task" eval set that makes the memory lift PROVABLE.
//
// Perplexity's Brain claims "+25% on tasks Computer has seen before" with no public benchmark. This
// is the reproducible analog: each session first ESTABLISHES durable context (facts the user states,
// a correction they make, a stated preference), then asks a PROBE whose great answer silently
// APPLIES that context without being told again this turn. Running each probe with memory ON vs OFF
// and judging both yields the lift — the same A/B the runMemory harness reports.
//
// Authoring rules that keep the metric honest:
//  - The probe must be answerable WELL only by applying a planted fact it must NOT restate.
//  - `expectApply` is the judge's ground truth for "did it apply what it knew".
//  - Keep planted facts the kind a real user states, never the answer itself (no contamination).
import type { MemorySource } from '../memory/store';

/** A fact the user established earlier (seeded into a fresh store before the probe). */
export interface SeedFact {
  concept: string;
  body: string;
  /** Defaults to 'user-stated' — these are things the user themselves established. */
  source?: MemorySource;
}

/** A correction the user made earlier (seeded as a procedural lesson, like the real app). */
export interface SeedCorrection {
  what: string;
  was: string;
  now: string;
}

export interface MemorySession {
  id: string;
  domain: string;
  /** Plain facts the user stated about themselves earlier. */
  facts?: SeedFact[];
  /** Stated answer-format/depth preferences (concept "preferences.*"). */
  preferences?: SeedFact[];
  /** A figure the user corrected earlier. */
  corrections?: SeedCorrection[];
  /** The graded question this turn — should APPLY the planted context without restating it. */
  probe: string;
  /** Ground truth for the judge: what correctly applying the known context looks like here. */
  expectApply: string;
}

export const MEMORY_SESSIONS: MemorySession[] = [
  {
    id: 'diet-vegetarian',
    domain: 'health',
    facts: [{ concept: 'profile.diet', body: 'Is vegetarian and lactose-intolerant.' }],
    probe: 'Plan a week of dinners for me.',
    expectApply:
      'Every dinner is vegetarian and dairy-free, without the user re-stating their diet this turn.',
  },
  {
    id: 'loc-austin',
    domain: 'travel',
    facts: [{ concept: 'profile.location', body: 'Lives in Austin, Texas.' }],
    probe: 'What should I do this weekend?',
    expectApply: 'Suggestions are specific to Austin / central Texas, not generic or another city.',
  },
  {
    id: 'job-nurse-nightshift',
    domain: 'health',
    facts: [{ concept: 'profile.work', body: 'Works as an ICU nurse on rotating night shifts.' }],
    probe: 'How can I sleep better?',
    expectApply:
      'Advice is tailored to a shift worker sleeping during the day, not a standard 9–5 schedule.',
  },
  {
    id: 'budget-figure-recall',
    domain: 'money',
    facts: [
      { concept: 'profile.finances', body: 'Take-home pay is $5,200/month; rent is $1,800.' },
    ],
    probe: 'How much should I be saving each month?',
    expectApply:
      'The savings figure is computed from the known $5,200 income and $1,800 rent, not asked for again.',
  },
  {
    id: 'pref-brief',
    domain: 'learn',
    preferences: [
      { concept: 'preferences.depth', body: 'Wants brief, to-the-point answers; skip the fluff.' },
    ],
    probe: 'Explain how compound interest works.',
    expectApply: 'The answer is tight and scannable, honoring the stated preference for brevity.',
  },
  {
    id: 'pref-table',
    domain: 'decision',
    preferences: [
      { concept: 'preferences.form', body: 'Prefers answers laid out as comparison tables.' },
    ],
    probe: 'Should I lease or buy a car?',
    expectApply:
      'The trade-off is presented as a side-by-side comparison, matching the stated format preference.',
  },
  {
    id: 'correction-mortgage',
    domain: 'money',
    corrections: [{ what: 'mortgage rate', was: '7.2%', now: '6.4%' }],
    probe: 'Given my mortgage rate, what would a 15-year refinance look like?',
    expectApply: 'Uses the corrected 6.4% rate (not 7.2%) and double-checks the figures.',
  },
  {
    id: 'kid-age',
    domain: 'learn',
    facts: [{ concept: 'profile.family', body: 'Has a 6-year-old daughter who loves dinosaurs.' }],
    probe: 'Suggest a fun weekend project we can do together.',
    expectApply:
      'The project is age-appropriate for a 6-year-old and plays to the dinosaur interest.',
  },
  {
    id: 'beginner-level',
    domain: 'learn',
    preferences: [
      {
        concept: 'preferences.level',
        body: 'Is a complete beginner to programming; prefers plain-language explanations.',
      },
    ],
    probe: 'What is an API?',
    expectApply: 'The explanation avoids jargon and assumes no prior programming knowledge.',
  },
  {
    id: 'units-metric',
    domain: 'howto',
    preferences: [{ concept: 'preferences.units', body: 'Prefers metric units (kg, km, °C).' }],
    probe: 'How much water should I drink and how far should I walk daily?',
    expectApply: 'Quantities are given in metric (litres/ml, km), not imperial.',
  },
  {
    id: 'allergy-peanut',
    domain: 'health',
    facts: [{ concept: 'profile.diet', body: 'Has a severe peanut allergy.' }],
    probe: 'Give me a high-protein snack list.',
    expectApply: 'No peanuts or peanut-derived items appear; alternatives are suggested instead.',
  },
  {
    id: 'goal-marathon',
    domain: 'health',
    facts: [
      {
        concept: 'threads.fitness',
        body: 'Training for a first marathon in November; currently runs 15 miles/week.',
      },
    ],
    probe: 'What should my training look like over the next month?',
    expectApply:
      'The plan builds from ~15 miles/week toward a November marathon, not a generic plan.',
  },
];

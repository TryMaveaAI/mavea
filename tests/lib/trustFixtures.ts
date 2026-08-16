// Shared fixtures for the trust-contract suite: one small grounded corpus and the raw payloads
// that exercise each gate — clean, fabricated, digit-spliced, cyclic, and huge. Kept out of the
// test file so future suites (registry UI, provenance panel) gate against the same world.

import type { RawWorldValue } from '../../src/live/trust';

export const TRUST_CORPUS =
  'Revenue grew from 12 to 34 million dollars over the year. Churn hit 6.2pp in March. ' +
  'The widget costs 10 dollars and we sell 3 units a day on average. ' +
  'Support tickets fell 18% after the onboarding fix.';

/** Every gate's happy path: grounded T1/T2 values, a self-consistent calc (claimed 30.2 vs a true
 *  30), and a calc-over-a-calc listed FIRST so only the fixpoint pass can settle it. */
export const RAW_CLEAN: RawWorldValue[] = [
  {
    id: 'weekly_revenue',
    label: 'Weekly revenue',
    formula: 'daily_revenue * 7',
    inputs: ['daily_revenue'],
  },
  {
    id: 'churn',
    label: 'March churn',
    tier: 'T1',
    value: 6.2,
    unit: 'pp',
    quote: 'Churn hit 6.2pp in March',
  },
  {
    id: 'tickets',
    label: 'Ticket drop',
    tier: 'T2',
    value: 18,
    unit: '%',
    quote: 'Support tickets fell 18% after the onboarding fix',
    receipt: { url: 'https://www.example.com/q2-report' },
  },
  {
    id: 'price',
    label: 'Widget price',
    tier: 'T1',
    value: 10,
    quote: 'The widget costs 10 dollars',
  },
  {
    id: 'daily_units',
    label: 'Units per day',
    tier: 'T1',
    value: 3,
    quote: 'we sell 3 units a day',
  },
  {
    id: 'daily_revenue',
    label: 'Revenue per day',
    formula: 'price * daily_units',
    inputs: ['price', 'daily_units'],
    value: 30.2,
  },
];

/** A confident T2 claim whose quote appears nowhere in the corpus. */
export const RAW_FABRICATED: RawWorldValue[] = [
  {
    id: 'made_up',
    label: 'Margin claim',
    tier: 'T2',
    value: 40,
    quote: 'Margins doubled to 40% in Q2',
    receipt: { url: 'https://www.example.com/invented' },
  },
];

/** The quote IS verbatim in the corpus, but 1234 splices the digits of two separate numbers. */
export const RAW_SPLICED: RawWorldValue[] = [
  { id: 'spliced', label: 'Spliced growth', tier: 'T1', value: 1234, quote: 'grew from 12 to 34' },
];

/** Two calcs that each require the other — neither can ever resolve. */
export const RAW_CYCLIC: RawWorldValue[] = [
  { id: 'a', label: 'A', formula: 'b + 1', inputs: ['b'] },
  { id: 'b', label: 'B', formula: 'a + 1', inputs: ['a'] },
];

/** A claimed calc result the arithmetic contradicts (10 × 3 is nowhere near 25). */
export const RAW_CALC_INCONSISTENT: RawWorldValue[] = [
  {
    id: 'price',
    label: 'Widget price',
    tier: 'T1',
    value: 10,
    quote: 'The widget costs 10 dollars',
  },
  {
    id: 'daily_units',
    label: 'Units per day',
    tier: 'T1',
    value: 3,
    quote: 'we sell 3 units a day',
  },
  {
    id: 'rev',
    label: 'Revenue per day',
    formula: 'price * daily_units',
    inputs: ['price', 'daily_units'],
    value: 25,
  },
];

/** T3 magnitudes: one properly caveated, one bare. */
export const RAW_ILLUSTRATIVE: RawWorldValue[] = [
  {
    id: 'half_life',
    label: 'Caffeine half-life',
    tier: 'T3',
    value: 5,
    unit: 'h',
    illustrative: 'Shows the shape, not your numbers',
  },
  { id: 'bare_guess', label: 'Uncaveated guess', tier: 'T3', value: 7 },
];

/** A calc fed by an illustrative input — the laundering CALCULATED must refuse. */
export const RAW_CALC_OVER_ILLUSTRATIVE: RawWorldValue[] = [
  {
    id: 'guess',
    label: 'Textbook guess',
    tier: 'T3',
    value: 5,
    illustrative: 'Shows the shape, not your numbers',
  },
  { id: 'double_guess', label: 'Doubled guess', formula: 'guess * 2', inputs: ['guess'] },
];

/** More valid entries than the payload budget allows, with oversized labels. */
export const RAW_HUGE: RawWorldValue[] = Array.from({ length: 200 }, (_, i) => ({
  id: `v${i}`,
  label: 'x'.repeat(400),
  tier: 'T1',
  value: 10,
  quote: 'The widget costs 10 dollars',
}));

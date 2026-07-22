import { describe, expect, it } from 'vitest';
import { clusterRecords, placeText, salientTerms } from '../src/live/atlas/neighborhoods';
import type { AtlasRecord } from '../src/live/atlas/store';

// Neighborhoods: conversations cluster by the user's own vocabulary — names are real words,
// nothing is dropped, and the derivation is deterministic.

const rec = (id: string, title: string, question: string, savedAt = 0): AtlasRecord => ({
  id,
  question,
  title,
  firstSeen: savedAt,
  savedAt,
  blocks: 3,
});

const FIXTURE = [
  rec('a', 'Monthly Budget Plan', 'build me a budget for a $5,000 month'),
  rec('b', 'Budget: Framework vs Flow', 'how does the 50/30/20 budget framework work'),
  rec('c', 'Refinance Math', 'how does refinancing my budget actually work'),
  rec('d', 'The Moon’s Sky', 'why is the moon’s sky black'),
  rec('e', 'Rayleigh Scattering', 'why is the sky blue'),
  rec('f', 'Lemon Chicken', 'lemon chicken recipe for tonight'),
];

describe('atlas neighborhoods', () => {
  it('groups records sharing real vocabulary and names the group with it', () => {
    const hoods = clusterRecords(FIXTURE);
    const budget = hoods.find((h) => h.name === 'BUDGET');
    expect(budget).toBeTruthy();
    expect(budget!.records.map((r) => r.id)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    const sky = hoods.find((h) => h.name === 'SKY');
    expect(sky).toBeTruthy();
    expect(sky!.records.map((r) => r.id)).toEqual(expect.arrayContaining(['d', 'e']));
  });

  it('drops nothing — every record lands in exactly one neighborhood', () => {
    const hoods = clusterRecords(FIXTURE);
    const all = hoods.flatMap((h) => h.records.map((r) => r.id)).sort();
    expect(all).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('is deterministic and sorts the busiest neighborhood first', () => {
    const a = clusterRecords(FIXTURE);
    const b = clusterRecords(FIXTURE);
    expect(a.map((h) => h.name)).toEqual(b.map((h) => h.name));
    expect(a[0].records.length).toBeGreaterThanOrEqual(a[a.length - 1].records.length);
  });

  it('generic travel/logistics framing does not bond unrelated subjects', () => {
    // Real bug: a Lisbon trip and a bird-flight question were swept into a "Boston" cluster
    // because all three happened to share filler like "travel"/"flight". Two genuine Boston
    // trips share the word "boston" and must still group; the others must stay apart.
    const trips = [
      rec(
        'nyc',
        'New York to Boston: Travel Comparison',
        'compare ways to travel from NY to Boston',
      ),
      rec('bk', 'Brooklyn to Boston: Travel & Game Plan', 'plan a Brooklyn to Boston trip'),
      rec(
        'lis',
        'Lisbon to Spain: Travel Logistics',
        'cheapest way to travel from Lisbon to Spain',
      ),
      rec('bird', 'The Physics of Bird Flight', 'how does bird flight actually work'),
    ];
    const hoods = clusterRecords(trips);
    const boston = hoods.find((h) => h.name === 'BOSTON');
    expect(boston).toBeTruthy();
    expect(boston!.records.map((r) => r.id).sort()).toEqual(['bk', 'nyc']);
    // The stray records land elsewhere, never in Boston.
    const bostonIds = new Set(boston!.records.map((r) => r.id));
    expect(bostonIds.has('lis')).toBe(false);
    expect(bostonIds.has('bird')).toBe(false);
    // No neighborhood is named after pure framing vocabulary.
    expect(hoods.map((h) => h.name)).not.toContain('TRAVEL');
    expect(hoods.map((h) => h.name)).not.toContain('FLIGHT');
  });

  it('salientTerms strips question scaffolding but keeps the subject', () => {
    const terms = salientTerms({ title: '', question: 'how does refinancing actually work?' });
    expect(terms).toContain('refinancing');
    expect(terms).not.toContain('how');
    expect(terms).not.toContain('actually');
  });

  it('placeText finds the neighborhood sharing tonight’s vocabulary, or none', () => {
    const hoods = clusterRecords(FIXTURE);
    const at = placeText('Budgeting: Framework vs. Flow', hoods);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(hoods[at].name).toBe('BUDGET');
    expect(placeText('quantum chromodynamics binding energy', hoods)).toBe(-1);
  });
});

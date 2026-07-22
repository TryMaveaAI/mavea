import { describe, expect, it } from 'vitest';
import { relatedDashboard } from '../src/live/dashboards/relate';
import type { Dashboard } from '../src/live/dashboards/types';

// relatedDashboard is conservative: an exact topic match, else ≥2 shared meaningful words with the
// dashboard's title/thesis/metrics. A weak match returns null so we never auto-fold an unrelated chat.

const dash = (over: Partial<Dashboard>): Dashboard =>
  ({
    id: over.id ?? 'd',
    title: 'Investment Thesis',
    thesis: { text: 'rates fall through Q3, tech wins', saidAt: 0 },
    metrics: [
      {
        id: 'm',
        label: 'US 10-year yield',
        query: 'q',
        sourceQuote: { text: 'x', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
    ...over,
  }) as Dashboard;

describe('relatedDashboard', () => {
  it('matches on an exact topic', () => {
    const d = dash({ topic: 'Finance' });
    expect(
      relatedDashboard([d], { topic: 'finance', text: 'totally unrelated words here' })?.id,
    ).toBe('d');
  });
  it('matches on ≥2 shared meaningful words', () => {
    const d = dash({ id: 'd1' });
    const hit = relatedDashboard([d], { text: 'how is the yield on my treasury thesis doing' });
    expect(hit?.id).toBe('d1'); // shares "yield"/"thesis"/"treasury"
  });
  it('returns null on a weak (≤1 word) match', () => {
    const d = dash({});
    expect(relatedDashboard([d], { text: 'what should I cook for dinner tonight' })).toBeNull();
  });
  it('returns null with no dashboards', () => {
    expect(relatedDashboard([], { text: 'rates tech thesis yield' })).toBeNull();
  });
});

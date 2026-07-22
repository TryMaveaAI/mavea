import { describe, it, expect } from 'vitest';
import { skeletonPlan, askTopic } from '../src/live/turnstate/skeletonPlan';
import { pendingCard } from '../src/live/turnstate/pendingCard';

describe('askTopic — the user’s own words, shortened', () => {
  it('strips leading question scaffolding and keeps the subject', () => {
    expect(askTopic('should I flex Nabers or Waddle this week')).toBe('flex Nabers or Waddle');
    expect(askTopic('tell me about AI datacenters')).toBe('AI datacenters');
    expect(askTopic('compare rust and go for a cli')).toBe('compare rust and go');
  });
  it('never invents text for an empty ask', () => {
    expect(askTopic('')).toBe('');
  });
});

describe('skeletonPlan — labeled, honest skeletons', () => {
  it('labels cards with detected kinds + the user’s subject', () => {
    const plan = skeletonPlan('compare Bijan vs Gibbs for my flex spot');
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan[0].label).toMatch(/^Finding — /);
    expect(plan.some((c) => c.label.startsWith('Comparison'))).toBe(true);
  });

  it('invents no figures: a digit-free ask yields digit-free labels', () => {
    const plans = [
      skeletonPlan('how do datacenters stay cool'),
      skeletonPlan('plan a trip to tokyo, food first'),
      skeletonPlan('what is happening with mortgage rates'),
    ];
    for (const plan of plans) {
      for (const card of plan) expect(card.label).not.toMatch(/\d/);
    }
  });

  it('keeps the user’s own figures when the ask contains them', () => {
    const plan = skeletonPlan('check my week 11 lineup');
    expect(plan[0].label).toContain('week 11');
  });

  it('a lean ask plans fewer cards than a rich one', () => {
    const lean = skeletonPlan('what time is it in tokyo');
    const rich = skeletonPlan('break down the full economics of building a datacenter');
    expect(lean.length).toBeLessThanOrEqual(rich.length);
  });
});

describe('pendingCard — the streaming skeleton', () => {
  it('labels the skeleton with the human kind-name for the block’s data shape', () => {
    // The engine resolves the streaming block's type → its data shape (it holds the catalog) and
    // passes the shape here, so pendingCard is catalog-free. 'series' → the "Trend" kind.
    const label = pendingCard('series').label;
    expect(label).toBe('Building — trend');
    expect(label).not.toContain('series');
  });
  it('stays generic for an unknown shape and between blocks', () => {
    expect(pendingCard('notarealshape').label).toBe('Building');
    expect(pendingCard(null).label).toBe('Building');
  });
});

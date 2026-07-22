import { describe, it, expect, beforeEach } from 'vitest';
import { mergeNodes, getMemoryNodes, forgetAll } from '../src/live/memory/store';
import {
  conceptSegment,
  correctionUpdate,
  inkCorrectionUpdate,
} from '../src/live/memory/procedural';

beforeEach(() => forgetAll());

describe('conceptSegment', () => {
  it('takes the first letter-led token, lowercased and length-capped', () => {
    expect(conceptSegment('Budget figure')).toBe('budget');
    expect(conceptSegment('2024 revenue')).toBe('revenue'); // skips the leading number
    expect(conceptSegment('!!!')).toBe('item'); // falls back when no valid token
    expect(conceptSegment('supercalifragilisticexpialidocious').length).toBeLessThanOrEqual(24);
  });
});

describe('correctionUpdate → store', () => {
  it('turns a declared correction into a verify-flagged procedural lesson (a loss)', () => {
    const update = correctionUpdate(
      { what: 'mortgage rate', was: '7.2%', now: '6.4%' },
      { turnId: 't-1' },
    );
    expect(update.concept).toBe('corrections.mortgage');
    expect(update.kind).toBe('procedural');
    expect(update.source).toBe('user-stated');
    expect(update.verify).toBe(true);
    expect(update.outcome).toBe('loss');

    mergeNodes([update]);
    const n = getMemoryNodes()[0];
    expect(n.kind).toBe('procedural');
    expect(n.verify).toBe(true);
    expect(n.losses).toBe(1);
    expect(n.body).toContain('6.4%');
    expect(n.turnId).toBe('t-1');
  });

  it('a correction is injected as a fact (high trust), not an unconfirmed guess', () => {
    mergeNodes([correctionUpdate({ what: 'budget', was: '$5k', now: '$8k' })]);
    // corrections.* carry source user-stated → fact tier.
    expect(getMemoryNodes()[0].source).toBe('user-stated');
  });
});

describe('inkCorrectionUpdate', () => {
  it('records the drawn correction with prefer/avoid steering and ink-correction trust', () => {
    const update = inkCorrectionUpdate('revenue trend', 'should be a line chart, not a pie', {
      turnId: 't-9',
      prefer: ['chart'],
      avoid: ['donut'],
    });
    expect(update.concept).toBe('corrections.revenue');
    expect(update.source).toBe('ink-correction');
    expect(update.prefer).toEqual(['chart']);
    expect(update.avoid).toEqual(['donut']);

    mergeNodes([update]);
    const n = getMemoryNodes()[0];
    expect(n.prefer).toEqual(['chart']);
    expect(n.avoid).toEqual(['donut']);
    expect(n.verify).toBe(true);
  });
});

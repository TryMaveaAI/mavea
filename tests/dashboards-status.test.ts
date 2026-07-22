import { describe, expect, it } from 'vitest';
import { deriveStatus } from '../src/live/dashboards/status';
import type { Dashboard, Tripwire } from '../src/live/dashboards/types';

const tw = (state: Tripwire['state']): Tripwire => ({
  id: 't' + state,
  label: 't',
  metricId: 'm',
  comparator: 'gt',
  threshold: 1,
  sourceQuote: { text: 'x', saidAt: 0 },
  state,
});

const dash = (tripwires: Tripwire[]): Dashboard => ({ tripwires }) as unknown as Dashboard;

describe('deriveStatus', () => {
  it('a triggered tripwire ⇒ needs-attention', () => {
    expect(deriveStatus(dash([tw('WATCHING'), tw('TRIGGERED')]))).toBe('needs-attention');
  });
  it('an awaiting tripwire (no real value yet) ⇒ at-risk, not a false all-clear', () => {
    expect(deriveStatus(dash([tw('CLEAR'), tw('AWAITING')]))).toBe('at-risk');
  });
  it('all watching/clear ⇒ tracking', () => {
    expect(deriveStatus(dash([tw('WATCHING'), tw('CLEAR')]))).toBe('tracking');
  });
  it('no tripwires ⇒ tracking', () => {
    expect(deriveStatus(dash([]))).toBe('tracking');
  });
  it('triggered wins over awaiting', () => {
    expect(deriveStatus(dash([tw('AWAITING'), tw('TRIGGERED')]))).toBe('needs-attention');
  });
});

import { describe, expect, it } from 'vitest';
import { standingLine } from '../src/live/prism/veracity/standingLine';
import type { Verdict } from '../src/live/prism/veracity/types';

// The Standing line is the one screenshottable summary of a document's veracity. It must be HONEST:
// count only what was checked, list only the trouble that exists, never overclaim.

describe('standingLine', () => {
  it('is empty when nothing was checked', () => {
    expect(standingLine([])).toBe('');
  });

  it('reads clean when everything holds', () => {
    const v: Verdict[] = ['holds', 'holds', 'holds'];
    expect(standingLine(v)).toBe('All 3 checked claims hold up against the public record.');
  });

  it('singularizes a single checked claim', () => {
    expect(standingLine(['holds'])).toBe('All 1 checked claim holds up against the public record.');
  });

  it('summarizes the trouble buckets, severity-first', () => {
    const v: Verdict[] = ['holds', 'outdated', 'contradicted', 'unsupported', 'holds', 'holds'];
    expect(standingLine(v)).toBe(
      '3 of 6 checked claims need a second look: 1 contradicted · 1 outdated · 1 unsupported.',
    );
  });

  it('counts duplicates within a bucket', () => {
    const v: Verdict[] = ['outdated', 'outdated', 'holds'];
    expect(standingLine(v)).toBe('2 of 3 checked claims need a second look: 2 outdated.');
  });

  it('omits empty buckets', () => {
    const v: Verdict[] = ['disputed', 'holds'];
    expect(standingLine(v)).toBe('1 of 2 checked claims need a second look: 1 disputed.');
  });
});

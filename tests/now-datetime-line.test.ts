// The temporal anchor sent on every Live turn (and every dashboard call). It must give the model
// the user's LOCAL time plus an unambiguous zone it can convert from — a bare abbreviation ("CST",
// "IST") isn't enough. Built client-side, so it resolves to the user's device timezone.
import { describe, it, expect } from 'vitest';
import { currentDateTimeLine } from '../src/live/ground/now';

describe('currentDateTimeLine', () => {
  const line = currentDateTimeLine();

  it('keeps the CURRENT DATE AND TIME anchor callers grep for', () => {
    // generateLive + the dashboards prepend this; tests/live.test.ts asserts the prefix too.
    expect(line).toContain('CURRENT DATE AND TIME');
  });

  it('carries an explicit ±HH:MM UTC offset, not just an abbreviation', () => {
    // "EDT"/"IST" are ambiguous; the signed offset lets the model convert to any other clock.
    expect(line).toMatch(/UTC[+-]\d{2}:\d{2}/);
  });

  it("frames the zone as the user's device timezone and notes it follows travel", () => {
    expect(line).toMatch(/device timezone/i);
    expect(line).toMatch(/travel/i);
  });

  it('tells the model to reason locally for relative time but in a place’s own zone elsewhere', () => {
    // The "when to use which timezone" guidance — local for "today/now", the subject's zone for a
    // specific place/event elsewhere.
    expect(line).toMatch(/local/i);
    expect(line).toMatch(/elsewhere/i);
  });
});

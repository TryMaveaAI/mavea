import { describe, it, expect } from 'vitest';
import { FIT_TYPES } from '../src/canvas/layout/fitPolicy';
import { EXTENDED_REGISTRY } from '../src/canvas/blocks';

// Typo guard: FIT_TYPES is a plain string set maintained by hand in fitPolicy.ts, disconnected
// from the registry it's meant to gate. A misspelled or stale entry would silently never match
// in TopicCanvas (FIT_TYPES.has(bx.type) just stays false) — no crash, no test failure, the
// block just quietly never gets the FitBox treatment it was added for.
describe('fitPolicy — FIT_TYPES stays in sync with the extended registry', () => {
  it('every entry is a real, registered extended block type', () => {
    const unknown = [...FIT_TYPES].filter((type) => !(type in EXTENDED_REGISTRY));
    expect(
      unknown,
      `FIT_TYPES lists types that don't exist in EXTENDED_REGISTRY: ${unknown.join(', ')}`,
    ).toEqual([]);
  });

  it('is non-empty (the policy exists to be used)', () => {
    expect(FIT_TYPES.size).toBeGreaterThan(0);
  });
});

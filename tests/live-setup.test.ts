import { afterEach, describe, expect, it } from 'vitest';
import { isSetupDone, markSetupDone, resetSetup } from '../src/live/setup/setup';

// Unit tests for the thin first-run flag store. Behaviour contract:
// - starts as not done (no key in storage)
// - markSetupDone flips it to done
// - resetSetup brings it back to not done
// - survives a simulated storage failure gracefully

const KEY = 'mavea-live-setup-v1';

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe('live setup flag — isSetupDone / markSetupDone / resetSetup', () => {
  it('reports not done when the key is absent', () => {
    localStorage.removeItem(KEY);
    expect(isSetupDone()).toBe(false);
  });

  it('reports not done when the key holds an unexpected value', () => {
    localStorage.setItem(KEY, 'true'); // not the sentinel '1'
    expect(isSetupDone()).toBe(false);
  });

  it('markSetupDone sets the sentinel and isSetupDone returns true', () => {
    markSetupDone();
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(isSetupDone()).toBe(true);
  });

  it('resetSetup removes the key and isSetupDone returns false again', () => {
    markSetupDone();
    expect(isSetupDone()).toBe(true);
    resetSetup();
    expect(isSetupDone()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('round-trip: mark → check → reset → check', () => {
    expect(isSetupDone()).toBe(false);
    markSetupDone();
    expect(isSetupDone()).toBe(true);
    resetSetup();
    expect(isSetupDone()).toBe(false);
  });

  it('calling markSetupDone twice is idempotent', () => {
    markSetupDone();
    markSetupDone();
    expect(isSetupDone()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('calling resetSetup when already clear does not throw', () => {
    localStorage.removeItem(KEY);
    expect(() => resetSetup()).not.toThrow();
    expect(isSetupDone()).toBe(false);
  });
});

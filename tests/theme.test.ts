import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, readTheme, writeTheme, applyTheme } from '../src/lib/theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readTheme', () => {
  it('defaults to dark when storage is empty', () => {
    expect(readTheme()).toBe('dark');
  });

  it('returns the stored light preference', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(readTheme()).toBe('light');
  });

  it('falls back to dark for an invalid stored value (the drift this module fixes)', () => {
    // The old Live template path passed garbage straight onto data-theme; here it must
    // resolve to the documented default instead.
    localStorage.setItem(THEME_KEY, 'midnight');
    expect(readTheme()).toBe('dark');
  });

  it('treats any non-light value, including an explicit dark, as dark', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readTheme()).toBe('dark');
  });

  it('defaults to dark when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(readTheme()).toBe('dark');
  });
});

describe('writeTheme', () => {
  it('persists the chosen theme under the shared key', () => {
    writeTheme('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('round-trips through readTheme', () => {
    writeTheme('light');
    expect(readTheme()).toBe('light');
  });

  it('swallows storage failures without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => writeTheme('light')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('sets data-theme on the document element', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('targets a passed-in document (the Live template paths)', () => {
    const other = document.implementation.createHTMLDocument('other');
    applyTheme('light', other);
    expect(other.documentElement.dataset.theme).toBe('light');
    // The ambient document is untouched when an explicit one is given.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

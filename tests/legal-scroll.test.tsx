import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TermsApp } from '../src/legal/TermsApp';
import { PrivacyApp } from '../src/legal/PrivacyApp';
import { readFileSync } from 'node:fs';

// Vitest stubs CSS imports, so the stylesheets are read from disk (the suite runs at the root).
const legalCss = readFileSync('src/legal/legal.css', 'utf8');
const shellCss = readFileSync('src/styles/live-transcript.css', 'utf8');

// jsdom has no layout, so the scroll call is the only observable signal that a document opened
// at the top.
const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockClear();
  vi.stubGlobal('scrollTo', scrollTo);
  // A nav-link click lands on a fresh history entry: new hash, no state of ours.
  window.history.pushState(null, '', '#/terms?from=home');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('legal document scroll position', () => {
  it('opens a freshly opened document at the top', () => {
    render(<TermsApp />);

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('resets again when the reader crosses to another document', () => {
    render(<TermsApp />);
    cleanup();
    scrollTo.mockClear();

    window.history.pushState(null, '', '#/privacy?from=home');
    render(<PrivacyApp />);

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('keeps the reader’s place when history returns to a document it already anchored', () => {
    render(<TermsApp />);
    cleanup();
    scrollTo.mockClear();

    // Back/forward restores this entry — including the anchor mark the first visit wrote — so the
    // browser's own scroll restoration must stand.
    render(<TermsApp />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the URL and history alone, so the back button still works', () => {
    const entries = window.history.length;
    render(<TermsApp />);

    expect(window.history.length).toBe(entries);
    expect(window.location.hash).toBe('#/terms?from=home');
  });
});

/** Every expectation above assumes the window is what scrolls. Live's stylesheet locks the
 * viewport on bare `html, body` and a hash route change never unloads it, so opening a document
 * FROM Live once clipped it at the fold — wheel, keys and scrollTo all dead. The lock is loaded
 * last here on purpose: what lifts it has to be specificity, not stylesheet order. */
describe('legal documents scroll the window whatever else is loaded', () => {
  /** Both stylesheets use CSS that jsdom's parser rejects outright (color-mix, oklab), and one bad
   * declaration drops the whole sheet — so lift out the rules that target the document itself and
   * let jsdom cascade those. Extraction from the real files, rather than a copy of them, is what
   * makes this a regression test: delete the override and nothing gets lifted. */
  function documentRules(css: string): string {
    return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector]) =>
        selector.split(',').every((one) => /^\s*html\b|^\s*body\b/.test(one)),
      )
      .map(([, selector, declarations]) => `${selector.trim()} { ${declarations.trim()} }`)
      .join('\n');
  }

  function applyStylesheets(...sheets: string[]): void {
    for (const css of sheets) {
      const style = document.createElement('style');
      style.textContent = documentRules(css);
      document.head.append(style);
    }
  }

  afterEach(() => {
    document.head.querySelectorAll('style').forEach((style) => style.remove());
  });

  it('lifts the app shell’s viewport lock while a document is on screen', () => {
    applyStylesheets(legalCss, shellCss);
    // The shell's own lock still stands for every surface that is not a document.
    expect(getComputedStyle(document.body).overflow).toBe('hidden');

    render(<TermsApp />);

    expect(getComputedStyle(document.body).overflow).toBe('visible');
    expect(getComputedStyle(document.documentElement).overflow).toBe('visible');
    expect(getComputedStyle(document.body).height).toBe('auto');
  });
});

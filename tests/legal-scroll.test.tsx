import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { TermsApp } from '../src/legal/TermsApp';
import { PrivacyApp } from '../src/legal/PrivacyApp';
import { LegalGate } from '../src/legal/LegalGate';
import { readFileSync } from 'node:fs';

// Vitest stubs CSS imports, so the stylesheets are read from disk (the suite runs at the root).
const legalCss = readFileSync('src/legal/legal.css', 'utf8');
const gateCss = readFileSync('src/legal/legal-gate.css', 'utf8');
// The viewport lock moved out of Live's route-scoped sheet into the eager type layer, so every
// surface — not just Live — is a fixed shell from the first paint. That makes the override below
// matter MORE, not less: a document now meets the lock however the reader arrived at it.
const shellCss = readFileSync('src/styles/type-roles.css', 'utf8');

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

/** Every expectation above assumes the window is what scrolls. The app shell locks the viewport on
 * bare `html, body` and a hash route change never unloads a stylesheet, so opening a document once
 * clipped it at the fold — wheel, keys and scrollTo all dead. The lock is loaded last here on
 * purpose: what lifts it has to be specificity, not stylesheet order. */
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

  it('lifts it for the acknowledgement gate too — the one document you cannot skip', () => {
    // The gate outgrows a short window (five points, five links, two consent boxes, the actions
    // row) and it is shown to RETURNING readers, whose session has the shell's lock resident. So
    // the card was clipped at the fold with the two checkboxes and Continue below it, and nothing
    // could reach them: the only way past the gate sat under an edge the window would not scroll.
    localStorage.clear();
    applyStylesheets(gateCss, shellCss);
    expect(getComputedStyle(document.body).overflow).toBe('hidden');

    render(
      <LegalGate>
        <p>the product</p>
      </LegalGate>,
    );

    expect(document.querySelector('.legal-gate')).not.toBeNull();
    expect(getComputedStyle(document.body).overflow).toBe('visible');
    expect(getComputedStyle(document.documentElement).overflow).toBe('visible');
    expect(getComputedStyle(document.body).height).toBe('auto');
  });
});

/** Continue sat 1.9 screens down a 390x844 phone and 3.4 down a 320px one, under a card that
 *  nothing said was scrollable. The way forward now lives in a footer that sticks to the bottom of
 *  the window for as long as the card runs past it — so it is on screen from the first paint, and
 *  every word above it still is in the page. */
describe('the acknowledgement gate keeps its way forward on screen', () => {
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(gateCss)?.[2] ?? '';
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('puts Continue in the card’s footer, after every statement and both boxes', () => {
    render(
      <LegalGate>
        <p>the product</p>
      </LegalGate>,
    );
    const card = document.querySelector('.legal-gate-card') as HTMLElement;
    const foot = card.querySelector('.legal-gate-foot') as HTMLElement;

    expect(card.lastElementChild).toBe(foot);
    expect(within(foot).getByRole('button', { name: /continue to mavéa/i })).toBeDisabled();
    // The statements are not summarised into the footer: both boxes, with their full text, stay
    // in the document above it.
    const body = card.querySelector('.legal-gate-body') as HTMLElement;
    expect(within(body).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(foot).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('pins the footer to the window, and keeps focus-scrolling clear of it', () => {
    expect(rule('.legal-gate-foot')).toMatch(/position:\s*sticky/);
    expect(rule('.legal-gate-foot')).toMatch(/bottom:\s*0/);
    // An overflow on the card would make the card the footer's scroller — one that never
    // scrolls — and the footer would stop sticking to the window.
    expect(rule('.legal-gate-card')).toMatch(/border-radius/);
    expect(rule('.legal-gate-card')).not.toMatch(/overflow/);
    // Sticky is in flow, so it can never sit over the last box once the page reaches its end;
    // what it CAN cover is a link or a box that focus scrolls to, hence the measured padding.
    expect(gateCss).toMatch(
      /html:has\(\.legal-gate\)\s*\{[^}]*scroll-padding-bottom:[^;]*var\(--legal-gate-foot/,
    );
  });

  it('the hint beside a disabled Continue takes the reader to the box still waiting', () => {
    // jsdom has no layout, so it has no scrollIntoView either; the call is the observable part.
    const scrollIntoView = vi.fn();
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
      else delete (Element.prototype as Partial<Element>).scrollIntoView;
    });
    render(
      <LegalGate>
        <p>the product</p>
      </LegalGate>,
    );
    const [general, speech] = screen.getAllByRole('checkbox');

    fireEvent.click(screen.getByRole('button', { name: /tick both boxes/i }));
    expect(document.activeElement).toBe(general);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));

    fireEvent.click(general);
    fireEvent.click(screen.getByRole('button', { name: /tick one more box/i }));
    expect(document.activeElement).toBe(speech);

    fireEvent.click(speech);
    expect(screen.queryByRole('button', { name: /tick/i })).toBeNull();
    expect(screen.getByRole('button', { name: /continue to mavéa/i })).toBeEnabled();
  });
});

describe('the gate uses a laptop window’s width instead of making the reader scroll', () => {
  it('sets the points in two columns and the acknowledgements side by side from 1024px', () => {
    const wide = /@media \(width >= 1024px\) \{([\s\S]*?)\n\}/.exec(gateCss)?.[1] ?? '';
    expect(wide).toMatch(/\.legal-gate-points\s*\{[^}]*columns:\s*2/);
    expect(wide).toMatch(/\.legal-gate-consents\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(wide).toMatch(/break-inside:\s*avoid/);
  });
});

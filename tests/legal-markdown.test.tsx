import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { LegalMarkdownDocument } from '../src/legal/LegalMarkdownDocument';
import { parseLegalMarkdown } from '../src/legal/legalMarkdown';

// Opening a document anchors it to the top; jsdom does not implement window.scrollTo.
// tests/legal-scroll.test.tsx covers that behaviour.
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const markdown = `# Canonical terms

Effective: July 16, 2026

Read the **important text** and [privacy](./PRIVACY.md).

## 1. First section

Use \`local storage\` carefully.

- One item
- Second item

## Safety

THIS WARRANTY PARAGRAPH IS DELIBERATELY LONG ENOUGH TO RECEIVE THE ALL CAPS LEGAL STYLE.
`;

describe('safe canonical legal Markdown renderer', () => {
  it('parses the title, effective date, intro, numbered sections, and lists', () => {
    expect(parseLegalMarkdown(markdown)).toMatchObject({
      title: 'Canonical terms',
      effectiveDate: 'July 16, 2026',
      sections: [
        { number: 1, title: 'First section' },
        { number: 2, title: 'Safety' },
      ],
    });

    window.location.hash = '#/terms?from=live';
    render(<LegalMarkdownDocument markdown={markdown} page="terms" kicker="Project terms" />);
    expect(screen.getByRole('heading', { name: 'Canonical terms' })).toBeInTheDocument();
    expect(screen.getByText('important text').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'privacy' })).toHaveAttribute(
      'href',
      '#/privacy?from=live',
    );
    expect(screen.getByText('local storage').tagName).toBe('CODE');
    const section = screen.getByRole('region', { name: 'First section' });
    expect(within(within(section).getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/THIS WARRANTY PARAGRAPH/)).toHaveClass('legal-caps');
  });

  it('opens with an "On this page" list that jumps to each section without leaving the route', () => {
    window.location.hash = '#/terms?from=home';
    // jsdom has no scrollIntoView; the call on the right heading is the observable jump.
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });
    render(<LegalMarkdownDocument markdown={markdown} page="terms" kicker="Project terms" />);

    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(contents).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['01First section', '02Safety']);

    // The href names this page and the section, so a new tab or a copied link lands there too.
    expect(links[1]).toHaveAttribute('href', '#/terms?from=home&section=2');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    links[1]!.dispatchEvent(click);
    const target = screen.getByRole('heading', { name: 'Safety' });
    expect(click.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
    expect(target).toHaveFocus();
    expect(window.location.hash).toBe('#/terms?from=home');

    // A modified click is the browser's: it opens the href in a new tab.
    const newTab = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    links[0]!.dispatchEvent(newTab);
    expect(newTab.defaultPrevented).toBe(false);
  });

  it('opens a section link at its section', () => {
    window.history.replaceState(null, '', '#/terms?from=home&section=2');
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });
    render(<LegalMarkdownDocument markdown={markdown} page="terms" kicker="Project terms" />);
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('heading', { name: 'Safety' }));
  });

  it('allows mapped documents and HTTPS while refusing HTML and unsafe link schemes', () => {
    const unsafe = `# Safety\n\nEffective: July 16, 2026\n\nIntro.\n\n## Links\n\n[License](./LICENSE) [External](https://example.com/) [Unsafe](javascript:alert(1)) <img src=x onerror=alert(1)>`;
    render(<LegalMarkdownDocument markdown={unsafe} page="terms" kicker="Safety" />);

    const licenseLinks = screen.getAllByRole('link', { name: 'License' });
    expect(licenseLinks).toHaveLength(2);
    expect(licenseLinks[1]).toHaveAttribute('href', '/legal/LICENSE.txt');
    expect(screen.getByRole('link', { name: 'External' })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    );
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/Unsafe.*<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
  });
});

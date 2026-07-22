import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalMarkdownDocument } from '../src/legal/LegalMarkdownDocument';
import { parseLegalMarkdown } from '../src/legal/legalMarkdown';

afterEach(() => {
  cleanup();
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
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/THIS WARRANTY PARAGRAPH/)).toHaveClass('legal-caps');
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

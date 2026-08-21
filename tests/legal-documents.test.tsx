import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TermsApp } from '../src/legal/TermsApp';
import { PrivacyApp } from '../src/legal/PrivacyApp';

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

describe('canonical legal documents', () => {
  it('publishes comprehensive Terms without inventing a company or jurisdiction', () => {
    window.location.hash = '#/terms?from=live';
    render(<TermsApp />);

    expect(screen.getByRole('heading', { name: 'Mavéa Terms of Use' })).toBeInTheDocument();
    expect(screen.getByText('Effective August 17, 2026')).toBeInTheDocument();
    expect(screen.getByText(/govern your use of the Mavéa application/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 18 years old/i)).toBeInTheDocument();
    expect(screen.getByText(/does not provide medical, legal, financial/i)).toBeInTheDocument();
    expect(screen.getByText(/same-origin proxy/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acceptable use' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disclaimers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Limitation of liability' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Indemnity' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Noncommercial software permission' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'PolyForm Noncommercial License 1.0.0' }),
    ).toHaveAttribute('href', '/legal/LICENSE.txt');
    expect(
      screen.getByText(/does not prevent a Licensor from commercializing/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/merger, acquisition, asset sale/i)).toBeInTheDocument();
    expect(screen.getByText(/No governing-law, arbitration, venue/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Docker Desktop is not free for every commercial organization/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No Responsible Party gives a patent-clearance opinion/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not necessarily clear every depicted person/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Mavéa' })).toHaveAttribute('href', '#/live');
  });

  it('describes actual local, proxy, provider, speech, gateway, and deletion boundaries', () => {
    window.location.hash = '#/privacy?from=home';
    render(<PrivacyApp />);

    expect(screen.getByRole('heading', { name: 'Mavéa Privacy Notice' })).toBeInTheDocument();
    expect(screen.getByText('Effective August 21, 2026')).toBeInTheDocument();
    expect(screen.getByText(/no Mavéa user-account system/i)).toBeInTheDocument();
    expect(screen.getByText(/course data, mastery and progress/i)).toBeInTheDocument();
    expect(screen.getByText(/non-extractable, device-bound browser key/i)).toBeInTheDocument();
    expect(screen.getByText(/proxy and its host can technically access/i)).toBeInTheDocument();
    expect(screen.getByText(/no separate Mavéa user accounts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/speech-to-text endpoint/i)).not.toHaveLength(0);
    expect(document.body).toHaveTextContent(/sends store: false/i);
    expect(screen.getByText(/can receive, log, or retain the audio/i)).toBeInTheDocument();
    expect(screen.getByText(/no automatic expiration/i)).toBeInTheDocument();
    expect(screen.getByText(/does not sell personal information/i)).toBeInTheDocument();
    expect(screen.getByText(/not directed to children/i)).toBeInTheDocument();
    expect(screen.getByText(/transferred to a successor/i)).toBeInTheDocument();
  });

  it('keeps the full documents lazy and links them from the landing and provider setup', () => {
    const routes = readFileSync(join(__dirname, '../src/routes.ts'), 'utf8');
    const landing = readFileSync(join(__dirname, '../src/flagship/FlagshipLanding.tsx'), 'utf8');
    const providerNotice = readFileSync(
      join(__dirname, '../src/live/setup/ProviderResponsibilityNotice.tsx'),
      'utf8',
    );
    const main = readFileSync(join(__dirname, '../src/main.tsx'), 'utf8');

    expect(routes).toMatch(/defineRoute\('#\/terms',[\s\S]*?import\('\.\/legal\/TermsApp'\)/);
    expect(routes).toMatch(/defineRoute\('#\/privacy',[\s\S]*?import\('\.\/legal\/PrivacyApp'\)/);
    expect(landing).toContain('href="#/terms?from=home"');
    expect(landing).toContain('href="#/privacy?from=home"');
    expect(landing).toContain("legalDocumentHref('LICENSE.txt')");
    expect(providerNotice).toContain('href="#/terms?from=live"');
    expect(providerNotice).toContain('href="#/privacy?from=live"');
    expect(main).not.toContain("from './legal/TermsApp'");
    expect(main).not.toContain("from './legal/PrivacyApp'");
  });

  it('renders the packaged Markdown as the only Terms and Privacy source', () => {
    const terms = readFileSync(join(__dirname, '../src/legal/TermsApp.tsx'), 'utf8');
    const privacy = readFileSync(join(__dirname, '../src/legal/PrivacyApp.tsx'), 'utf8');

    expect(terms).toContain("from '../../TERMS.md?raw'");
    expect(privacy).toContain("from '../../PRIVACY.md?raw'");
    expect(terms).not.toContain('Disclaimer of warranties');
    expect(privacy).not.toContain('Information kept in your browser');
  });

  it('does not leave the public account fixture making fictional product privacy promises', () => {
    const accountFixture = readFileSync(join(__dirname, '../src/data/topics/account.ts'), 'utf8');
    expect(accountFixture).toContain('Example privacy map · fictional product');
    expect(accountFixture).toContain('Mavéa has no account backend');
    expect(accountFixture).not.toContain('Encrypted in our EU database');
    expect(accountFixture).not.toContain('Aggregated, no personal ID');
    expect(accountFixture).not.toContain('Nothing is shared with anyone');
  });
});

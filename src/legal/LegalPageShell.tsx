import type { ReactElement, ReactNode } from 'react';
import { legalDocumentHref } from './links';
import './legal.css';

export type LegalPageKind = 'important' | 'terms' | 'privacy';

function sourceQuery(): string {
  if (typeof window === 'undefined') return '';
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('from') === 'live' ? '?from=live' : '?from=home';
}

function returnHref(): string {
  return sourceQuery() === '?from=live' ? '#/live' : '#/';
}

function legalHref(path: 'legal' | 'terms' | 'privacy'): string {
  return `#/${path}${sourceQuery()}`;
}

export function LegalPageShell({
  page,
  kicker,
  title,
  intro,
  effectiveDate,
  children,
}: {
  page: LegalPageKind;
  kicker: string;
  title: string;
  intro: ReactNode;
  effectiveDate?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <main className="legal-app">
      <header className="legal-topbar">
        <a className="legal-brand" href="#/" aria-label="Mavéa home">
          <span className="legal-brand-mark" aria-hidden />
          Mavéa
        </a>
        <a className="legal-back" href={returnHref()}>
          ← Back to Mavéa
        </a>
      </header>

      <article className="legal-sheet">
        <nav className="legal-document-nav" aria-label="Legal and safety information">
          <a href={legalHref('legal')} aria-current={page === 'important' ? 'page' : undefined}>
            Important information
          </a>
          <a href={legalHref('terms')} aria-current={page === 'terms' ? 'page' : undefined}>
            Terms of use
          </a>
          <a href={legalHref('privacy')} aria-current={page === 'privacy' ? 'page' : undefined}>
            Privacy
          </a>
          <a href={legalDocumentHref('LICENSE.txt')} target="_blank" rel="noreferrer noopener">
            License
          </a>
        </nav>

        <p className="legal-kicker">{kicker}</p>
        <h1>{title}</h1>
        {effectiveDate && <p className="legal-effective">Effective {effectiveDate}</p>}
        <div className="legal-intro">{intro}</div>
        {children}
      </article>
    </main>
  );
}

export function LegalSection({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="legal-prose-section">
      <span className="legal-number" aria-hidden>
        {String(number).padStart(2, '0')}
      </span>
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

import { useLayoutEffect, type ReactElement, type ReactNode } from 'react';
import { legalDocumentHref } from './links';
import { legalSectionId } from './legalMarkdown';
import './legal.css';

export type LegalPageKind = 'important' | 'terms' | 'privacy';

// Which document a history entry has already been anchored to the top for.
const ANCHOR_KEY = 'maveaLegalAnchor';

/** Moving between legal documents only changes the hash, so the browser keeps the outgoing
 * document's scroll offset — leaving Terms mid-page and opening Privacy landed the reader
 * mid-Privacy. Anchor an entry once, when it first shows a document: back and forward return to an
 * already-anchored entry, where the browser restores the offset the reader left, and an in-page
 * jump neither changes the entry nor the document, so it is never overridden. */
function anchorNewEntryToTop(page: LegalPageKind): void {
  const state: unknown = window.history.state;
  const entry = state !== null && typeof state === 'object' ? state : {};
  if (ANCHOR_KEY in entry && entry[ANCHOR_KEY] === page) return;
  // Same entry, no new URL — the back button still returns to whatever preceded this document.
  window.history.replaceState({ ...entry, [ANCHOR_KEY]: page }, '');
  window.scrollTo({ top: 0 });
}

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
  contents,
  children,
}: {
  page: LegalPageKind;
  kicker: string;
  title: string;
  intro: ReactNode;
  effectiveDate?: string;
  /** An "On this page" list, set between the title block and the intro. */
  contents?: ReactNode;
  children: ReactNode;
}): ReactElement {
  // Before paint, so the incoming document is never shown for a frame at the offset the previous
  // one was left at.
  useLayoutEffect(() => {
    anchorNewEntryToTop(page);
  }, [page]);

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
        {contents}
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
    <section className="legal-prose-section" aria-labelledby={legalSectionId(number)}>
      <span className="legal-number" aria-hidden>
        {String(number).padStart(2, '0')}
      </span>
      <div>
        {/* tabIndex -1 so a contents jump can hand focus to the heading it scrolled to. */}
        <h2 id={legalSectionId(number)} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

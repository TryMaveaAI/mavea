import { Fragment, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { LegalPageShell, LegalSection, type LegalPageKind } from './LegalPageShell';
import { legalSectionId, parseLegalMarkdown, type MarkdownBlock } from './legalMarkdown';
import { legalDocumentHref, legalSectionHref, type PackagedLegalDocument } from './links';

const PACKAGED_DOCS: Record<string, PackagedLegalDocument> = {
  './LICENSE': 'LICENSE.txt',
  './TERMS.md': 'TERMS.md',
  './DISCLAIMER.md': 'DISCLAIMER.md',
  './PRIVACY.md': 'PRIVACY.md',
  './TRADEMARKS.md': 'TRADEMARKS.md',
  './SUPPORT.md': 'SUPPORT.md',
  './SECURITY.md': 'SECURITY.md',
};

function sourceQuery(): string {
  if (typeof window === 'undefined') return '';
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('from') === 'live' ? '?from=live' : '?from=home';
}

function markdownHref(href: string): { href: string; external: boolean } | null {
  if (href === './TERMS.md') return { href: `#/terms${sourceQuery()}`, external: false };
  if (href === './PRIVACY.md') return { href: `#/privacy${sourceQuery()}`, external: false };
  const packaged = PACKAGED_DOCS[href];
  if (packaged) return { href: legalDocumentHref(packaged), external: true };
  try {
    const url = new URL(href);
    if (url.protocol === 'https:') return { href: url.href, external: true };
  } catch {
    // Only the explicit local map above and HTTPS links are legal-document destinations.
  }
  return null;
}

function inline(text: string): ReactNode[] {
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${match.index}-${match[0]}`;
    if (match[2] !== undefined && match[3] !== undefined) {
      const destination = markdownHref(match[3]);
      nodes.push(
        destination ? (
          <a
            key={key}
            href={destination.href}
            {...(destination.external
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : undefined)}
          >
            {match[2]}
          </a>
        ) : (
          <Fragment key={key}>{match[2]}</Fragment>
        ),
      );
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={key}>{match[4]}</strong>);
    } else {
      nodes.push(<code key={key}>{match[5]}</code>);
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function allCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 40 && letters === letters.toUpperCase();
}

function MarkdownBlocks({ value }: { value: MarkdownBlock[] }): ReactElement {
  return (
    <>
      {value.map((block, index) =>
        block.kind === 'paragraph' ? (
          <p className={allCaps(block.text) ? 'legal-caps' : undefined} key={index}>
            {inline(block.text)}
          </p>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/** Jump to a section in place. A plain click never follows the href — it names this same page — so
 *  the route and the history entry stay put; a modified click (new tab, new window) is left to the
 *  browser, which opens the href and lands on the section there. */
function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  const heading = document.getElementById(id);
  if (!heading) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
  heading.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  heading.focus({ preventScroll: true });
}

function Contents({
  route,
  sections,
}: {
  route: 'terms' | 'privacy';
  sections: { number: number; title: string }[];
}): ReactElement {
  return (
    <nav className="legal-toc" aria-labelledby="legal-toc-title">
      <p className="legal-toc-title" id="legal-toc-title">
        On this page
      </p>
      <ol>
        {sections.map(({ number, title }) => (
          <li key={number}>
            <a
              href={legalSectionHref(route, number)}
              onClick={(event) => jumpTo(event, legalSectionId(number))}
            >
              <span className="legal-toc-number" aria-hidden>
                {String(number).padStart(2, '0')}
              </span>
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalMarkdownDocument({
  markdown,
  page,
  kicker,
}: {
  markdown: string;
  page: LegalPageKind;
  kicker: string;
}): ReactElement {
  const document = parseLegalMarkdown(markdown);
  return (
    <LegalPageShell
      page={page}
      kicker={kicker}
      title={document.title}
      effectiveDate={document.effectiveDate}
      intro={<MarkdownBlocks value={document.intro} />}
      contents={
        page !== 'important' && document.sections.length > 1 ? (
          <Contents route={page} sections={document.sections} />
        ) : null
      }
    >
      <div className="legal-prose">
        {document.sections.map((section) => (
          <LegalSection number={section.number} title={section.title} key={section.number}>
            <MarkdownBlocks value={section.blocks} />
          </LegalSection>
        ))}
      </div>
    </LegalPageShell>
  );
}

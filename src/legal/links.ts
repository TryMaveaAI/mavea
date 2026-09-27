export type PackagedLegalDocument =
  | 'LICENSE.txt'
  | 'TERMS.md'
  | 'DISCLAIMER.md'
  | 'PRIVACY.md'
  | 'TRADEMARKS.md'
  | 'SUPPORT.md'
  | 'SECURITY.md'
  | 'THIRD-PARTY.txt';

/** Resolve copied legal documents under Vite's configured base path. */
export function legalDocumentHref(document: PackagedLegalDocument): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}legal/${document}`;
}

/** The query key a legal page reads to open at one of its numbered sections. */
export const LEGAL_SECTION_PARAM = 'section';

/** A link to one section of a legal page that survives leaving the page: the hash is the ROUTE here,
 *  so a bare `#legal-section-3` would navigate away from the document it points into. The page keeps
 *  where the reader came from, so "Back to Mavéa" still returns them there. */
export function legalSectionHref(route: 'terms' | 'privacy' | 'legal', section: number): string {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const params = new URLSearchParams({ from: query.get('from') === 'live' ? 'live' : 'home' });
  params.set(LEGAL_SECTION_PARAM, String(section));
  return `#/${route}?${params.toString()}`;
}

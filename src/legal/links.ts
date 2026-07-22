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

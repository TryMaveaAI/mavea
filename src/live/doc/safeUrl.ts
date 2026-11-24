// safeUrl.ts — gatekeeper for a model-SUPPLIED PDF/document URL we will EMBED.
//
// The dev proxy re-serves PDFs from reviewed HTTPS hosts so the reader can frame them under
// the app's origin. Only those exact hosts may receive server-side requests, including redirects.
const ALLOWED_PDF_HOSTS: readonly string[] = [
  'arxiv.org', // academic preprints — the bulk of "show me the X paper"
  'bitcoin.org', // the canonical whitepaper
  'www.w3.org', // web standards
  'w3.org',
  'www.rfc-editor.org', // RFCs
  'rfc-editor.org',
  'datatracker.ietf.org', // IETF drafts/RFCs
  'nvlpubs.nist.gov', // NIST publications (public domain)
  'ntrs.nasa.gov', // NASA technical reports (public domain)
];

/** Return a normalized HTTPS URL when the host is allowlisted for PDF forwarding.
 *  Used on BOTH sides: generateLive (decide whether to route a `file` through the proxy) and
 *  the proxy itself (re-validate before fetching). Never throws. */
export function safePdfUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return undefined;
  if (!ALLOWED_PDF_HOSTS.includes(url.hostname)) return undefined;
  return url.toString();
}

/** The same-origin proxy URL that embeds a (validated) external PDF. The iframe loads this
 *  (so it is served from our own origin with SAMEORIGIN framing); the visible "Open" link
 *  still points at the original URL, so it works even where the proxy isn't deployed. */
export function pdfProxyUrl(safeUrl: string): string {
  return `/pdf?url=${encodeURIComponent(safeUrl)}`;
}

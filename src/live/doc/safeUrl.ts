// safeUrl.ts — gatekeeper for a model-SUPPLIED PDF/document URL we will EMBED.
//
// An external PDF can't be framed directly when its host sends X-Frame-Options. In development,
// the /pdf proxy can fetch it through our OWN origin and make it eligible for Pdfreader's narrowly
// gated, sandboxed iframe. In production it remains an explicit external link unless the deployer
// provides an equivalent audited forwarder. The
// /pdf dev proxy) and re-serving it, which makes it embeddable. But the URL is untrusted LLM
// output and the proxy fetches it server-side, so it's an SSRF surface: we allow ONLY https
// URLs on a short allowlist of reputable, stable document hosts that serve real PDFs and are
// not open redirectors. Anything else is left as a plain link (never proxied), so a risky or
// invented URL can never be fetched by us. The allowlist IS the security boundary — extend it
// only with hosts you trust to serve hotlinkable PDFs and not redirect.
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

/** True when `host` is exactly an allowed host or a subdomain of one. Subdomain match is
 *  anchored on a dot so `arxiv.org.attacker.com` cannot pass. */
function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_PDF_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

/** Return the URL unchanged if it is a safe https PDF on an allowlisted host; else undefined.
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
  if (url.protocol !== 'https:') return undefined; // no http:, data:, blob:, file:…
  if (!hostAllowed(url.hostname)) return undefined;
  return url.toString();
}

/** The same-origin proxy URL that embeds a (validated) external PDF. The iframe loads this
 *  (so it is served from our own origin with SAMEORIGIN framing); the visible "Open" link
 *  still points at the original URL, so it works even where the proxy isn't deployed. */
export function pdfProxyUrl(safeUrl: string): string {
  return `/pdf?url=${encodeURIComponent(safeUrl)}`;
}

// safeImageUrl.ts — the one allowlist gate for a model-supplied image URL.
//
// When the model decides an image fits, it can hand us a real URL to render directly
// (e.g. a Wikimedia/Unsplash asset it knows) rather than a prompt for us to generate.
// That URL is untrusted LLM output dropped straight into an <img src>, so the browser
// will fetch whatever we accept — an SSRF / privacy / hallucinated-link surface. We
// therefore allow ONLY https URLs on a short allowlist of reputable, stable image
// hosts, and reject everything else (data:/http:/private hosts/redirectors). A real
// found image clears the bar; an invented or risky one is dropped and the caller falls
// back to its no-image state. The allowlist is the security boundary — keep it to
// hosts that serve hotlinkable image assets and are not open redirectors.
//
// Lives in src/lib (not src/live) because canvas blocks need the same gate and canvas
// must never import from live/; the live pipeline re-exports it from live/image/safeUrl.
const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  'upload.wikimedia.org', // Wikimedia Commons media (stable, hotlinkable, attributed)
  'commons.wikimedia.org',
  'images.unsplash.com', // Unsplash CDN (license permits hotlinking)
  'images.pexels.com', // Pexels CDN (free commercial use)
  'cdn.pixabay.com', // Pixabay CDN (free commercial use)
  'images-assets.nasa.gov', // NASA imagery (public domain)
  'www.nasa.gov',
];

/** True when `host` is exactly an allowed host or a subdomain of one. Subdomain match
 *  is anchored on a dot so `evil-upload.wikimedia.org.attacker.com` cannot pass. */
function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

/**
 * Return the URL unchanged if it is a safe, https, allowlisted image URL; otherwise
 * undefined. Used to vet a model-supplied photo `src` before it is rendered as an
 * <img>. Never throws — a malformed URL simply fails the check.
 */
export function safeImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined; // not an absolute URL (or otherwise unparseable)
  }
  if (url.protocol !== 'https:') return undefined; // no http:, data:, blob:, file:…
  if (!hostAllowed(url.hostname)) return undefined;
  return url.toString();
}

/**
 * What a canvas block may put in an <img src>: a bundled same-origin asset path (the
 * scripted demo's `/demo-assets/…` images) or a remote URL that clears `safeImageUrl`.
 * Everything else — http:, data:, javascript:, protocol-relative `//host`, off-list
 * hosts — returns undefined so the block renders its existing no-image fallback
 * (gradient plate, initials, glyph) instead of fetching an attacker-chosen URL.
 * Defense in depth alongside the CSP img-src allowlist, not a replacement for it.
 */
export function safeBlockImageSrc(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  // Root-relative = an app asset served same-origin ('//host' is protocol-relative, not local).
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return safeImageUrl(value);
}

/** What a media player may fetch from the app origin. Unlike images, Mavéa has no vetted remote
 * video host or video-search backend, and the CSP deliberately permits only same-origin media.
 * Keep the render boundary aligned: bundled root-relative assets and absolute URLs on this exact
 * origin survive; javascript:/data:/blob:/file:, protocol-relative, and remote URLs do not. */
export function safeSameOriginMediaSrc(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (typeof window === 'undefined') return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

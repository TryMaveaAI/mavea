// safeImageUrl.ts — the one clearance gate for a remote image URL.
//
// A reputable hostname proves neither a particular file's license nor its attribution terms.
// Remote images therefore pass only after individual review and inclusion in this exact set. Model
// output can never widen it. The license gate separately pins the same URLs to credits and rejects
// any unreviewed remote media baked into a shipped fixture.
//
// Lives in src/lib (not src/live) because canvas blocks need the same gate and canvas
// must never import from live/; the live pipeline re-exports it from live/image/safeUrl.
export const CLEARED_REMOTE_IMAGES: ReadonlySet<string> = new Set([
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Shibuya_crossing_at_night.jpg/960px-Shibuya_crossing_at_night.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Lantern_of_Kaminarimon_Gate.JPG/960px-Lantern_of_Kaminarimon_Gate.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/View_of_Mount_Fuji_from_Lake_Ashi.jpg/960px-View_of_Mount_Fuji_from_Lake_Ashi.jpg',
]);

/**
 * Return an individually cleared remote URL, otherwise undefined. Never throws.
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
  const normalized = url.toString();
  return CLEARED_REMOTE_IMAGES.has(normalized) ? normalized : undefined;
}

/**
 * What a canvas block may put in an <img src>: a reviewed bundled demo image or an individually
 * cleared remote URL. An arbitrary root-relative path is not enough: it could target an app or
 * proxy endpoint rather than credited media.
 * Defense in depth alongside the CSP img-src allowlist, not a replacement for it.
 */
export function safeBlockImageSrc(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (value.startsWith('/demo-assets/images/')) return value;
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

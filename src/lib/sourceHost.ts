// Source-display helpers shared by every provenance surface (hero row, footer links,
// working chips, evidence panel). One hostname policy and one link-safety gate, so a
// future tweak (stripping 'm.', punycode) lands once. URLs come from model output and
// search results — parsing never throws, and only http(s) is ever clickable.

/** Bare display host ("en.wikipedia.org"), or null when the URL doesn't parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The URL if it is plain http(s), else null — model-supplied links never get another scheme. */
export function safeHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Plain http: stays clickable on purpose — cited sources still serve http-only pages,
    // and the risk gated here is scheme injection, not plaintext transport.
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * A tel:/sms: link whose target reads as a real dial string (digits with +, -, spaces, #;
 * short enough to be a phone number), else the http(s) gate above, else null. React refuses
 * javascript: hrefs at the DOM layer, but that is renderer courtesy, not a contract — the
 * guarantee that a model-supplied href never carries an active scheme has to be ours.
 */
export function safeContactUrl(url: string): string | null {
  const m = /^(tel|sms):(.+)$/i.exec(url.trim());
  if (!m) return safeHttpUrl(url);
  const target = m[2];
  const dialable = target.length <= 24 && /\d/.test(target) && /^[+\d\-\s#]+$/.test(target);
  return dialable ? `${m[1].toLowerCase()}:${target}` : null;
}

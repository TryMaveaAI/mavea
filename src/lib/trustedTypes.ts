// trustedTypes.ts — the only code allowed to hand a string to a DOM-XSS sink.
//
// The page's CSP carries `require-trusted-types-for 'script'`, so Chromium refuses a plain string
// at every sink that can turn text into markup or script (innerHTML and React's
// dangerouslySetInnerHTML, DOMParser, iframe srcdoc, Worker and script URLs). What it accepts
// instead is a Trusted Type, minted by a policy the CSP names in `trusted-types`. Three exist, all
// created here, once, at module load (the directive forbids duplicates, so no later script can
// mint a second policy under one of these names):
//
//   mavea        Sanitized markup → the live DOM. Reachable only through `trustedHtml`, whose
//                parameter is `SanitizedHtml`: a brand only the app's sanitizers put on a string
//                (richText, sanitizeSvg, KaTeX with trust:false, Shiki). A raw string does not
//                type-check, and tests/trusted-types.test.ts pins which files may apply the brand.
//   mavea-inert  Untrusted text → an INERT document, for those same sanitizers to parse. A
//                DOMParser document runs no script and loads nothing, so the input needs no
//                vetting; what comes out is only ever a Document, never a live-DOM write.
//   default      The fallback Chromium consults when code we do not own (MapLibre, modern-screenshot,
//                Vite's worker wrappers) hands a sink a plain string. Markup passes only when it
//                carries no active content, and a script URL only when it is same-origin — the
//                same line script-src/worker-src already draw. Everything else is refused, which
//                throws at the sink and reports a violation.
//
// Browsers without Trusted Types (Firefox, Safari, jsdom) get the plain string back from every
// function here; their sinks accept it, and the sanitizers upstream are unchanged.

declare const sanitizedBrand: unique symbol;

/** Markup that has been through one of the app's sanitizers. Only a sanitizer applies the brand. */
export type SanitizedHtml = string & { readonly [sanitizedBrand]: true };

interface PolicyRules {
  createHTML?: (input: string, sink?: string) => string | null;
  createScriptURL?: (input: string, sink?: string) => string | null;
}

interface TrustedTypePolicy {
  createHTML(input: string): TrustedHTML;
}

interface TrustedTypePolicyFactory {
  createPolicy(name: string, rules: PolicyRules): TrustedTypePolicy;
}

declare global {
  interface Window {
    trustedTypes?: TrustedTypePolicyFactory;
  }
  interface DOMParser {
    parseFromString(string: TrustedHTML, type: DOMParserSupportedType): Document;
  }
}

/** Every policy name this module creates — the CSP's `trusted-types` list, which a test holds to it. */
export const POLICY_NAMES = ['mavea', 'mavea-inert', 'default'] as const;

const factory = typeof window === 'undefined' ? undefined : window.trustedTypes;

const identity = (input: string): string => input;

function createPolicy(name: (typeof POLICY_NAMES)[number], rules: PolicyRules) {
  if (!factory) return null;
  try {
    return factory.createPolicy(name, rules);
  } catch {
    // Only reachable if this module were evaluated twice (the CSP refuses a duplicate name). The
    // sinks then refuse plain strings loudly rather than this module failing to load at all.
    return null;
  }
}

const sanitizedPolicy = createPolicy('mavea', { createHTML: identity });
const inertPolicy = createPolicy('mavea-inert', { createHTML: identity });

/** Hand sanitized markup to a sink (dangerouslySetInnerHTML, innerHTML). */
export function trustedHtml(html: SanitizedHtml): TrustedHTML | string {
  return sanitizedPolicy ? sanitizedPolicy.createHTML(html) : html;
}

/** Parse untrusted markup into an inert document for a sanitizer to walk. */
export function parseInert(markup: string, type: DOMParserSupportedType): Document {
  const parser = new DOMParser();
  return inertPolicy
    ? parser.parseFromString(inertPolicy.createHTML(markup), type)
    : parser.parseFromString(markup, type);
}

/** Static markup written in the source itself, as a tagged template with no substitutions:
 *  `markupLiteral\`<rect … />\``. A substitution is refused at runtime, so nothing computed or
 *  received can ride along with the reviewed text. */
export function markupLiteral(strings: TemplateStringsArray, ...values: never[]): SanitizedHtml {
  if (values.length > 0 || strings.length !== 1 || !Object.isFrozen(strings)) {
    throw new TypeError('markupLiteral accepts only a literal template with no substitutions');
  }
  return strings[0] as SanitizedHtml;
}

/* ── the default policy: what third-party code may put in a sink ─────────────────────────────── */

/** Elements that run script, load a document, or rewrite where the page's URLs resolve. */
const ACTIVE_ELEMENTS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'base',
  'link',
  'form',
  'template',
  'portal',
  // SVG animation can set any attribute — an href included — after this check has run.
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'handler',
  'listener',
]);

const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data']);

// Control characters and whitespace a browser strips before reading a URL's scheme.
// eslint-disable-next-line no-control-regex
const URL_NOISE = /[\u0000- ]/g;
const SCRIPT_SCHEME = /^(javascript|vbscript|data:text\/html)/i;

function isActive(el: Element): boolean {
  const tag = el.localName.toLowerCase();
  if (ACTIVE_ELEMENTS.has(tag)) return true;
  // `<meta charset>` is inert; `<meta http-equiv>` can refresh the frame to another URL.
  if (tag === 'meta' && el.hasAttribute('http-equiv')) return true;
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'srcdoc') return true;
    if (URL_ATTRIBUTES.has(name) && SCRIPT_SCHEME.test(attr.value.replace(URL_NOISE, ''))) {
      return true;
    }
  }
  return false;
}

/** The markup, unchanged, when it carries nothing that can run; null (refused) otherwise. The
 *  libraries that reach this write chrome — a map's scale label, its attribution links, an empty
 *  sandbox document — and a refusal here is a violation worth seeing, not something to repair. */
export function inertMarkupOrNull(markup: string): string | null {
  if (!markup.includes('<')) return markup; // text and entities only: nothing to parse
  const doc = parseInert(markup, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (isActive(el)) return null;
  }
  return markup;
}

/** A same-origin script URL (a blob: URL carries its creator's origin), else null (refused). */
export function sameOriginScriptUrlOrNull(url: string): string | null {
  try {
    return new URL(url, document.baseURI).origin === window.location.origin ? url : null;
  } catch {
    return null;
  }
}

createPolicy('default', {
  createHTML: inertMarkupOrNull,
  createScriptURL: sameOriginScriptUrlOrNull,
});

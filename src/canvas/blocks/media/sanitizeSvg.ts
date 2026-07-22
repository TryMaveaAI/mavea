// sanitizeSvg — a strict, synchronous, dependency-free SVG sanitizer.
//
// LLM-generated SVG (the `svgblock` escape hatch) is UNTRUSTED input. This turns an arbitrary
// SVG string into a safe one with a DENY-BY-DEFAULT whitelist: only known drawing elements and
// safe attributes survive; everything else is dropped. It is SYNCHRONOUS and uses the browser's
// native DOMParser/XMLSerializer — no CDN, no dependency, sub-millisecond — so a model's
// illustration renders instantly with zero added bundle weight, identically for every model.
//
// Threat model covered (defence-in-depth, deny-by-default):
//   • <script>, event handlers (on*)            → script execution
//   • <foreignObject>, <iframe>                  → arbitrary HTML injection / namespace escape
//   • <image>, <use href>, <feImage>, external  → data-exfiltration / SSRF via resource loads
//   • javascript: URLs, data: URLs in hrefs      → script execution / smuggling
//   • <style> elements, style="…url()/expression"→ CSS injection / external loads
//   • <animate>/<set>/<animateTransform/Motion>  → animation abuse, attribute-setting to js:
//   • <!DOCTYPE>/<!ENTITY>                        → XXE / billion-laughs entity expansion
//   • comments / processing-instructions         → mutation-XSS surface, xml-stylesheet PIs
//
// Parsing is STRICT XML (image/svg+xml), so malformed markup is rejected rather than silently
// "fixed up" into something dangerous. The whitelist removes every element capable of script,
// external loads, or namespace confusion, so the sanitized string is safe for innerHTML.

/** Hard cap on input size. Six thousand characters is enough for the intended small explanatory
 *  figure (roughly 1,500 output tokens) while preventing a generated escape-hatch visual from
 *  consuming the answer budget or hiding unverifiable complexity in a giant path. */
const MAX_INPUT = 6_000;

/** Hard cap on drawing-element count. A real illustration is a few dozen elements, not thousands;
 *  a runaway count is either tool-generated bloat or an attempt to hang layout. MAX_INPUT bounds
 *  the byte size; this bounds the element/path count specifically. */
const MAX_SVG_ELEMENTS = 80;

/** Dense labels become unreadable and are much harder for a model to keep mutually consistent.
 *  A richer visual should use a purpose-built, data-backed component instead. */
const MAX_TEXT_LABELS = 20;

/** Allowed SVG element local-names (lowercase). Pure drawing, text, gradients, structure, and
 *  the SAFE filter primitives. Deny-by-default: anything not here is dropped. Notable exclusions:
 *  script, style, a, image, foreignObject, iframe, switch, metadata, set, animate*, feImage. */
const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  // shapes
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  // text
  'text',
  'tspan',
  'textpath',
  // paint servers + structure
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'use',
  // filters (safe primitives only — feImage is intentionally excluded: it loads external images)
  'filter',
  'fegaussianblur',
  'feoffset',
  'feblend',
  'fecolormatrix',
  'fecomposite',
  'feflood',
  'femerge',
  'femergenode',
  'femorphology',
  'fedropshadow',
  'fecomponenttransfer',
  'fefuncr',
  'fefuncg',
  'fefuncb',
  'fefunca',
  'fedisplacementmap',
  'feturbulence',
  'fetile',
  'fespecularlighting',
  'fediffuselighting',
  'fepointlight',
  'fespotlight',
  'fedistantlight',
]);

/** Attributes that reference a resource — kept ONLY when they point at a same-document
 *  fragment (#id). Any other value (external URL, data:, javascript:) strips the attribute. */
const RESOURCE_ATTRS: ReadonlySet<string> = new Set(['href', 'xlink:href', 'src']);

/** A url() that is NOT a same-document fragment — external resource or data:/javascript: smuggle. */
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)/i;
/** Script protocol anywhere in a value. */
const JS_PROTO = /javascript:/i;
/** Dangerous CSS constructs inside a style attribute. */
const DANGEROUS_CSS = /expression\s*\(|@import|behavior\s*:|-moz-binding/i;

/** Paint attributes. The model is TAUGHT to use only design-system tokens here (see
 *  svgBlockMenu() in live/select/synthesis.ts) so the drawing is correct in light AND dark —
 *  a literal `fill="black"` looks fine against whichever theme the model imagined but can go
 *  invisible (or, worse, swallow its own text) against the other. Models don't reliably follow
 *  that instruction, so it's enforced here rather than trusted. */
const COLOR_ATTRS: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
]);
/** The exact token set taught in svgBlockMenu() — keep these two lists in sync. */
const ALLOWED_COLOR_TOKENS: ReadonlySet<string> = new Set([
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--danger)',
  'var(--text-primary)',
  'var(--text-secondary)',
  'var(--text-muted)',
  'var(--surface-card)',
]);
const SAFE_COLOR_KEYWORDS: ReadonlySet<string> = new Set([
  'none',
  'currentcolor',
  'transparent',
  'context-fill',
  'context-stroke',
]);
/** A same-document paint-server reference, e.g. fill="url(#grad)" — already validated as a
 *  fragment by the resource-attr check for href/xlink:href on the gradient/pattern itself. */
const FRAGMENT_PAINT_REF = /^url\(#[\w-]+\)$/;
/** A style-attribute color declaration that isn't a design-system token — reject the whole
 *  style rather than try to patch just the one declaration. */
const RAW_STYLE_COLOR = /\b(?:fill|stroke|color|stop-color)\s*:\s*(?!var\(--)[^;]+/i;

function isAllowedColor(value: string): boolean {
  const v = value.trim();
  return (
    ALLOWED_COLOR_TOKENS.has(v) ||
    SAFE_COLOR_KEYWORDS.has(v.toLowerCase()) ||
    FRAGMENT_PAINT_REF.test(v)
  );
}

/** Text needs to stay legible against whatever it sits on, so an off-token fill on <text>/<tspan>
 *  falls back to the primary text token; anything else (a shape fill, a line stroke) falls back to
 *  a neutral surface/secondary token rather than inheriting SVG's own default (black). */
function safeColorFallback(attrName: string, el: Element): string {
  if (attrName === 'fill') {
    const tag = el.localName.toLowerCase();
    return tag === 'text' || tag === 'tspan' ? 'var(--text-primary)' : 'var(--surface-card)';
  }
  return 'var(--text-secondary)';
}

/** Strict, synchronous SVG sanitizer. Returns safe, responsive SVG markup, or null if the input
 *  is empty, oversized, malformed, not rooted in <svg>, or the environment lacks a DOM parser. */
export function sanitizeSvg(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_INPUT) return null;
  // XXE / entity-expansion guard: a real illustration never needs a DOCTYPE or entity defs.
  if (/<!doctype|<!entity/i.test(trimmed)) return null;
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  } catch {
    return null;
  }
  // A strict XML parse error surfaces as a <parsererror> element — reject rather than render.
  if (doc.getElementsByTagName('parsererror').length > 0) return null;

  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') return null;

  cleanElement(root);

  // Complexity budget: after the whitelist scrub, a surviving element count over the cap is bloat
  // or a layout-hang attempt — reject so the block falls back to its safe placeholder.
  if (root.getElementsByTagName('*').length > MAX_SVG_ELEMENTS) return null;
  if (root.getElementsByTagName('text').length > MAX_TEXT_LABELS) return null;

  // A real viewBox is part of the accuracy contract: silently inventing one can crop or distort
  // the model's geometry and make relative positions misleading. Require four finite values and a
  // positive width/height, then preserve them exactly.
  const viewBox = root.getAttribute('viewBox');
  if (!viewBox) return null;
  const viewBoxValues = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBoxValues.length !== 4 ||
    viewBoxValues.some((value) => !Number.isFinite(value)) ||
    viewBoxValues[2] <= 0 ||
    viewBoxValues[3] <= 0
  ) {
    return null;
  }

  // Enforce responsive sizing: drop fixed width/height and scale to the container.
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.setAttribute('width', '100%');
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  try {
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}

/** Scrub one element's attributes, then recurse — dropping any disallowed child element,
 *  comment, or processing instruction along the way. */
function cleanElement(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    // Event handlers — the primary script vector.
    if (name.startsWith('on')) {
      el.removeAttribute(attr.name);
      continue;
    }
    // Resource references — fragment-only.
    if (RESOURCE_ATTRS.has(name) || name.endsWith(':href')) {
      if (!value.trim().startsWith('#')) el.removeAttribute(attr.name);
      continue;
    }
    // Paint attributes — off-token colors are rewritten to a safe token, never just dropped
    // (SVG's own default fill is black, which would reproduce the exact bug this guards against).
    if (COLOR_ATTRS.has(name)) {
      if (!isAllowedColor(value)) el.setAttribute(attr.name, safeColorFallback(name, el));
      continue;
    }
    // Inline CSS — strip if it loads externally, uses a dangerous construct, or paints with a
    // raw color instead of a design-system token (the attribute-level check above can't see
    // colors hidden inside a style="…" declaration).
    if (name === 'style') {
      if (
        EXTERNAL_URL.test(value) ||
        JS_PROTO.test(value) ||
        DANGEROUS_CSS.test(value) ||
        RAW_STYLE_COLOR.test(value)
      ) {
        el.removeAttribute(attr.name);
      }
      continue;
    }
    // Any remaining attribute: drop it if its value smuggles a script protocol or external url().
    // (A fragment paint reference like fill="url(#grad)" is preserved — EXTERNAL_URL only matches
    // a url() that is NOT a #fragment.)
    if (JS_PROTO.test(value) || EXTERNAL_URL.test(value)) {
      el.removeAttribute(attr.name);
    }
  }

  for (const node of Array.from(el.childNodes)) {
    const type = node.nodeType;
    if (type === 1 /* ELEMENT_NODE */) {
      const child = node as Element;
      if (ALLOWED_ELEMENTS.has(child.localName.toLowerCase())) {
        cleanElement(child);
      } else {
        child.remove();
      }
    } else if (type === 7 /* PROCESSING_INSTRUCTION_NODE */ || type === 8 /* COMMENT_NODE */) {
      // PIs (e.g. <?xml-stylesheet?>) and comments add mXSS surface and no value — drop them.
      el.removeChild(node);
    }
    // TEXT_NODE (3) is kept — it carries <text>/<tspan> content.
  }
}

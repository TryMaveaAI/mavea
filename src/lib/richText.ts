// richText.ts — a tiny, dependency-free HTML sanitizer for the few block fields that are
// rendered as markup via `dangerouslySetInnerHTML` (a message draft body, rich footers).
//
// Most model output never reaches the DOM as HTML: liveSchema neutralizes the tag-forming
// characters in every coerced string. A handful of fields are deliberately exempt from that
// (RAW_TEXT_PROPS) so authored/model markup like <strong> survives — those are the fields
// that get rendered raw, and so they must be sanitized HERE, at the render boundary, where
// the guarantee can't be undone by an upstream change. Parsing happens in an inert document
// (DOMParser never executes scripts or loads resources); we then re-serialize ONLY an
// allow-list of inline/structural formatting tags, keeping no attribute but an allow-listed
// `class`. That removes the entire XSS surface — event handlers (onerror/onclick),
// javascript:/data: URLs (no href/src tags are allowed), and <script>/<iframe>/<style> —
// while keeping the formatting real content actually uses. A disallowed tag is unwrapped
// (its text is kept), so sanitizing never silently drops a user's words, only unsafe markup.

/** Inline + light structural tags real content uses for emphasis and lists. No media, no
 *  links, no anything that carries a URL or a handler. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'mark',
  'span',
  'sub',
  'sup',
  'code',
  'kbd',
  'br',
  'p',
  'ul',
  'ol',
  'li',
  'div',
  'blockquote',
]);

/** Tags with no closing tag / no children. */
const VOID_TAGS: ReadonlySet<string> = new Set(['br']);

/** The only class names sanitized markup may keep: the syntax-highlight tokens the diff renderers
 *  style (`.diff-code .k/.s/.c`). Every other name is dropped — a class from this string is chosen
 *  by the model, and any app class it names (a fixed overlay, a full-bleed layout) would let a
 *  formatting field borrow styling it was never meant to reach. */
const ALLOWED_CLASSES: ReadonlySet<string> = new Set(['k', 's', 'c']);

/** Hard cap on input size. These fields are a sentence to a short message body; well past anything
 *  real content uses, and it bounds the parse a single render can be made to do. */
const MAX_INPUT = 20_000;

/** Hard cap on nesting. Real formatting nests a handful of levels; past this the markup is bloat or
 *  an attempt to recurse the render path off the stack, so the words are kept and the tags below
 *  are flattened. */
const MAX_DEPTH = 24;

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The `class="…"` to emit for an element: the allow-listed names it carries, or nothing. The
 *  surviving names come from a fixed set, so there is nothing left to escape. */
function classAttr(value: string | null): string {
  if (!value) return '';
  const kept = value.split(/\s+/).filter((name) => ALLOWED_CLASSES.has(name));
  return kept.length ? ` class="${kept.join(' ')}"` : '';
}

/** Re-serialize a node's children, keeping only allow-listed tags and classes. */
function serialize(node: Node, depth: number): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      if (depth >= MAX_DEPTH) {
        // Flatten rather than recurse: the reader keeps every word, the stack keeps its depth.
        out += escapeText(el.textContent ?? '');
        return;
      }
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        out += serialize(el, depth + 1); // unwrap: drop the tag, keep its (sanitized) contents
        return;
      }
      const attr = classAttr(el.getAttribute('class'));
      out += VOID_TAGS.has(tag)
        ? `<${tag}${attr}>`
        : `<${tag}${attr}>${serialize(el, depth + 1)}</${tag}>`;
    } else if (child.nodeType === 3 /* TEXT_NODE */) {
      out += escapeText(child.textContent ?? '');
    }
    // comments, processing instructions, etc. are dropped
  });
  return out;
}

/** Sanitize an untrusted HTML string down to a safe formatting subset. Returns plain,
 *  escaped text when the input has no markup. An `&` routes through the parser too: authored
 *  copy uses entities (`&rsquo;`, `&mdash;`) with no tags at all, and the escape-only fast path
 *  would double-encode them into literal "&rsquo;" on screen.
 *
 *  `input` is typed `string` (it's always an `HtmlString` field by contract), but the generic
 *  coercer that fills these props from loose model JSON only checks PRESENCE, not scalar type —
 *  a model that hands an `HtmlString` field a bare number reaches here unchanged. The old raw
 *  `dangerouslySetInnerHTML={{ __html: value }}` this replaced tolerated that by construction
 *  (the DOM's own innerHTML setter stringifies); coerce the same way here so sanitizing never
 *  regresses that robustness into a crash. */
export function sanitizeRichText(input: string): string {
  if (input == null) return '';
  const raw = typeof input === 'string' ? input : String(input);
  if (!raw) return '';
  // Oversized input is cut, never rejected: a truncated field still reads, and the parser drops
  // whatever tag the cut lands inside.
  const str = raw.length > MAX_INPUT ? raw.slice(0, MAX_INPUT) : raw;
  if (!str.includes('<') && !str.includes('&')) return escapeText(str);
  const doc = new DOMParser().parseFromString(str, 'text/html');
  return serialize(doc.body, 0);
}

/** Convenience for `dangerouslySetInnerHTML={richInnerHtml(value)}`. */
export function richInnerHtml(input: string): { __html: string } {
  return { __html: sanitizeRichText(input) };
}

// richText.ts — a tiny, dependency-free HTML sanitizer for the few block fields that are
// rendered as markup via `dangerouslySetInnerHTML` (a message draft body, rich footers).
//
// Most model output never reaches the DOM as HTML: liveSchema neutralizes the tag-forming
// characters in every coerced string. A handful of fields are deliberately exempt from that
// (RAW_TEXT_PROPS) so authored/model markup like <strong> survives — those are the fields
// that get rendered raw, and so they must be sanitized HERE, at the render boundary, where
// the guarantee can't be undone by an upstream change. Parsing happens in an inert document
// (DOMParser never executes scripts or loads resources); we then re-serialize ONLY an
// allow-list of inline/structural formatting tags, dropping every attribute except `class`.
// That removes the entire XSS surface — event handlers (onerror/onclick), javascript:/data:
// URLs (no href/src tags are allowed), and <script>/<iframe>/<style> — while keeping the
// formatting real content actually uses. A disallowed tag is unwrapped (its text is kept),
// so sanitizing never silently drops a user's words, only unsafe markup.

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

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Re-serialize a node's children, keeping only allow-listed tags and the `class` attribute. */
function serialize(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        out += serialize(el); // unwrap: drop the tag, keep its (sanitized) contents
        return;
      }
      const cls = el.getAttribute('class');
      const attr = cls ? ` class="${escapeAttr(cls)}"` : '';
      out += VOID_TAGS.has(tag) ? `<${tag}${attr}>` : `<${tag}${attr}>${serialize(el)}</${tag}>`;
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
  const str = typeof input === 'string' ? input : String(input);
  if (!str) return '';
  if (!str.includes('<') && !str.includes('&')) return escapeText(str);
  const doc = new DOMParser().parseFromString(str, 'text/html');
  return serialize(doc.body);
}

/** Convenience for `dangerouslySetInnerHTML={richInnerHtml(value)}`. */
export function richInnerHtml(input: string): { __html: string } {
  return { __html: sanitizeRichText(input) };
}

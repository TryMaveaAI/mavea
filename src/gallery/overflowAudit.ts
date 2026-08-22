// Layout overflow audit — a fast, reusable check that no block's content is being clipped.
//
// Why this exists: the unit tests run in jsdom, which has no layout engine (every rect is 0×0),
// so overflow can only be measured in a real browser. This module is that measurement, factored
// out of any one caller so it scales: the core primitive (`auditCard`) audits a SINGLE rendered
// card, so it works the same whether you mount one component in isolation (a future headless/CI
// harness) or sweep the whole #/gallery. `auditGallery` is the gallery wrapper; the gallery also
// exposes it as `window.__overflowAudit()` in dev so re-auditing is one call, not a pasted snippet.
//
// How it judges: for every element it finds the nearest ancestor that clips (overflow ≠ visible)
// and measures how far the element's box spills past that clipper. A clipper with overflow:hidden
// means the spill is silently LOST (a real bug); overflow:auto/scroll means it's reachable by
// scrolling (designed — reported separately, lower severity). SVG <text> is included, so clipped
// chart/diagram labels are caught the same as HTML.
//
// Scaling to thousands: audit per family (the gallery's family filter renders one family at a
// time, bounding the live DOM), or drive `auditCard` from an isolated per-component mount in a
// browser-mode test so memory stays O(1) and the run shards across workers.

/** Block types whose content is MEANT to extend past a clipping box (maps tile around the edge,
 *  carousels translate slides off-stage, pannable canvases are a viewport onto a larger world). */
const INTENTIONAL = new Set([
  'geomap',
  'maproute',
  'zoningmap', // shares GeoMap's MapLibre tile layer — same edge-bleed as geomap/maproute
  'carousel',
  'mindshape',
  'atlas',
  'globe',
  'spinner',
  // blocks with intentional max-height + overflow:auto scroll regions
  'deflist', // .lay-dl-list: max-height 320px, scrolls long term lists
  'messagescriptset', // .mss-list: max-height 460px, scrolls message bundles
  'slidedeck', // .sd-slides: max-height 560px, scrolls slide outlines
  'pagination', // .pg-bar: overflow-x auto, scrolls many page buttons
  'kanban', // .fl-kanban: overflow-x auto, scrolls columns past the visible width
  'emotionwheel', // .ew-list: max-height 260px, scrolls long emotion-chip lists
  'expressionheatmap', // .eh-wrap: max-height 480px, scrolls grid + legend together
  'weathernow', // .wn-hourly-scroll: overflow-x auto, scrolls the hourly forecast strip
  'boardgamescore', // .bgs-scroll: overflow-x auto, scrolls per-player score columns
  // Both own a `.cg-scroll` wrapper (overflow-x: auto) around a table wider than a phone: the
  // claim/source matrix and the retention triangle each need their columns side by side to be
  // readable at all, so the row scrolls rather than wrapping into nonsense.
  'claimgrid',
  'cohortgrid',
  // .fs-scroll: overflow-x auto with its own styled scrollbar. A P&L needs its period columns
  // side by side to be comparable at all, so a narrow card scrolls the table rather than
  // reflowing the figures into something unreadable.
  'financialstatement',
]);

export interface OverflowHit {
  /** how far, in px, the element spills past its nearest clipping ancestor */
  px: number;
  /** 'clip' = lost to overflow:hidden (a bug); 'scroll' = reachable via overflow:auto/scroll */
  kind: 'clip' | 'scroll';
  /** a short descriptor of the offending element (tag.class "text") */
  el: string;
  /** the clipping ancestor (.class or tag) */
  clipper: string;
}

export interface CardVerdict {
  clip?: OverflowHit;
  scroll?: OverflowHit;
}

export interface OverflowReport {
  scanned: number;
  ms: number;
  clip: Array<OverflowHit & { type: string; family: string }>;
  scroll: Array<OverflowHit & { type: string; family: string }>;
}

const SCROLLY = (s: string) => s === 'auto' || s === 'scroll';

/** Does `el` describe text content (for nicer reporting)? */
function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') || '').split(' ')[0];
  let txt = '';
  if (tag === 'text' || tag === 'tspan' || el.childElementCount === 0) {
    txt = (el.textContent || '').trim().slice(0, 30);
  }
  return `${tag}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
}

/** Is this element's overflow handled by something other than the card itself — an intentional
 *  scroll region, a line-clamped text body, or an icon's own viewBox? Those are not card bugs. */
function isExcusedClipper(clipper: Element, style: CSSStyleDeclaration): boolean {
  const cls = clipper.getAttribute('class') || '';
  if (/\bic\b/.test(cls)) return true; // icon glyph drawn inside its own box
  // Deliberate horizontal overflow is acceptable only after the shared Canvas enhancer makes it
  // keyboard-focusable, named for assistive technology, and visibly discoverable.
  if (
    /\bcanvas-hscroll\b/.test(cls) &&
    SCROLLY(style.overflowX) &&
    clipper.getAttribute('tabindex') === '0' &&
    !!clipper.getAttribute('aria-label')
  )
    return true;
  const clamp = style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp');
  if (clamp && clamp !== 'none') return true; // line-clamped prose: last line's box is meant to crop
  // A deliberately-bounded scroll region — an explicit max-height paired with overflow:auto/scroll —
  // is meant to SCROLL its overflow, not lose it; the spill past the bound is reachable, not clipped.
  // This is the general form of what the per-block INTENTIONAL list hand-waved: the many long
  // tables/documents/lists that cap their body at a max-height and scroll it. Without this, each
  // one trips the audit by a few px the moment its content is a hair taller than the cap.
  if (SCROLLY(style.overflowY) && !!style.maxHeight && style.maxHeight !== 'none') return true;
  return false;
}

const INLINE_TEXT = new Set([
  'b',
  'i',
  'em',
  'strong',
  'mark',
  'small',
  'span',
  'a',
  'code',
  'sub',
  'sup',
]);
const SVG_SHAPES = new Set(['rect', 'path', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const TRANSPARENT = new Set(['none', 'transparent', 'rgba(0, 0, 0, 0)']);

/** An SVG shape with neither a visible fill nor a visible stroke — a hover hit-target or spacer. */
function isPaintless(s: CSSStyleDeclaration): boolean {
  const noFill = TRANSPARENT.has(s.fill);
  const noStroke = TRANSPARENT.has(s.stroke) || parseFloat(s.strokeWidth) === 0;
  return noFill && noStroke;
}

/** Audit a single rendered card subtree. Returns the worst clip and worst scroll spill found.
 *  Pure read — never mutates the DOM. This is the scalable primitive: one card at a time.
 *
 *  It deliberately ignores three things that look like overflow to a box-measuring tool but never
 *  lose visible content: (1) anything bounded by an SVG `clip-path` — getBoundingClientRect returns
 *  the *unclipped* geometric box, so a curve clipped cleanly to a plot rect would read as overflow;
 *  (2) a collapsed reveal (an accordion/menu whose clip box is ~0 tall until you open it); and
 *  (3) an inline highlight whose line-box pokes a few px past an overflow:hidden reveal wrapper. */
export function auditCard(card: Element, tol = 3.5): CardVerdict {
  const verdict: CardVerdict = {};
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    // An invisible element (a transparent hover hit-target, a zero-opacity spacer) has no content
    // to lose, so its box spilling out is harmless — skip it.
    const es = getComputedStyle(el);
    if (parseFloat(es.opacity) === 0 || es.visibility === 'hidden') continue;
    const tag = el.tagName.toLowerCase();
    if (SVG_SHAPES.has(tag) && isPaintless(es)) continue;

    // nearest ancestor that clips, walking up to (and including) the card. Along the way, note any
    // visual bound that makes the geometric box lie: a clip-path, or a preserveAspectRatio="none"
    // SVG (its content is stretched to exactly fill the box, so a shape's geometric rect can read
    // as overflow while nothing actually paints outside).
    let clipper: Element | null = el.parentElement;
    let cs: CSSStyleDeclaration | null = null;
    let bounded = (es.clipPath || 'none') !== 'none';
    while (clipper) {
      const s = getComputedStyle(clipper);
      if ((s.clipPath || 'none') !== 'none') bounded = true;
      if (clipper.tagName === 'svg' && clipper.getAttribute('preserveAspectRatio') === 'none') {
        bounded = true;
      }
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        cs = s;
        break;
      }
      if (clipper === card) break;
      clipper = clipper.parentElement;
    }
    if (!clipper || !cs || bounded) continue;
    if (isExcusedClipper(clipper, cs)) continue;

    const cr = clipper.getBoundingClientRect();
    if (cr.height < 6 || cr.width < 6) continue; // collapsed reveal — content hidden by design

    const overH = Math.max(cr.left - r.left, r.right - cr.right);
    const overV = Math.max(cr.top - r.top, r.bottom - cr.bottom);
    const spill = Math.max(overH, overV);
    if (spill <= tol) continue;

    // an inline highlight's line-box overshooting a reveal wrapper vertically isn't lost text
    if (INLINE_TEXT.has(tag) && overV >= overH && spill < 24) continue;

    const kind: OverflowHit['kind'] =
      SCROLLY(cs.overflowX) || SCROLLY(cs.overflowY) ? 'scroll' : 'clip';
    const hit: OverflowHit = {
      px: Math.round(spill),
      kind,
      el: describe(el),
      clipper: '.' + (clipper.getAttribute('class') || clipper.tagName).split(' ')[0],
    };
    const slot = kind === 'clip' ? 'clip' : 'scroll';
    if (!verdict[slot] || hit.px > verdict[slot]!.px) verdict[slot] = hit;
  }
  return verdict;
}

/** Sweep every `.vlib-tile` under `root` and return the offenders, worst first. `clipTol`/`scrollTol`
 *  set the px thresholds (scroll is noisier, so it defaults higher). Types in INTENTIONAL are skipped. */
export function auditGallery(
  root: ParentNode = document,
  { clipTol = 3.5, scrollTol = 8 }: { clipTol?: number; scrollTol?: number } = {},
): OverflowReport {
  const t0 = performance.now();
  const tiles = [...root.querySelectorAll<HTMLElement>('.vlib-tile')];
  const clip: OverflowReport['clip'] = [];
  const scroll: OverflowReport['scroll'] = [];
  for (const tile of tiles) {
    const type = tile.querySelector('.vlib-type')?.textContent?.trim() || '?';
    const family = tile.querySelector('.vlib-fam')?.textContent?.trim() || '?';
    const card = tile.querySelector('.card');
    if (!card || INTENTIONAL.has(type)) continue;
    const v = auditCard(card, clipTol);
    if (v.clip && v.clip.px > clipTol) clip.push({ ...v.clip, type, family });
    if (v.scroll && v.scroll.px > scrollTol) scroll.push({ ...v.scroll, type, family });
  }
  clip.sort((a, b) => b.px - a.px);
  scroll.sort((a, b) => b.px - a.px);
  return { scanned: tiles.length, ms: Math.round(performance.now() - t0), clip, scroll };
}

/* ---------------------------------------------------------------------------
 * Sibling text-overlap + dynamic-text truncation.
 *
 * The clip/scroll audit above catches text LEAVING a card. These two passes catch the other ways
 * a label becomes unreadable WITHIN the card: two labels drawn over each other (overlap), and a
 * label cut off with an ellipsis (truncation). The rule is "the user must be able to read the
 * full label" — no overlap, no "…". Both are real-browser only (jsdom has no layout), so they
 * live beside the overflow audit and the gallery exposes them the same way.
 * ------------------------------------------------------------------------- */

export interface OverlapHit {
  /** overlapping area in px² — bigger is a worse collision */
  px: number;
  a: string;
  b: string;
}

/** True if `el` (or an ancestor up to `card`) is rotated: a rotated glyph's axis-aligned box is
 *  larger than its ink, so a rotated axis label would false-flag an overlap with its neighbour. */
function isRotated(el: Element, card: Element): boolean {
  let cur: Element | null = el;
  while (cur && cur !== card) {
    const tr = cur.getAttribute?.('transform');
    if (tr && /\brotate\s*\(/.test(tr)) return true;
    const t = getComputedStyle(cur).transform;
    const m = t && t !== 'none' ? /matrix\(([^)]+)\)/.exec(t) : null;
    if (m) {
      const p = m[1].split(',').map(Number);
      if (Math.abs(p[1]) > 0.02 || Math.abs(p[2]) > 0.02) return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

/** Every visible text fragment inside `card`: one box per SVG <text> and per rendered HTML line
 *  fragment (rotated runs skipped). An HTML element's bounding box spans all of its wrapped lines;
 *  treating that union as ink creates false collisions with perfectly stacked siblings. A Range
 *  reports the line fragments the browser actually painted. Bounded by `max` so a pathological
 *  card can't stall the sweep. */
/** A run's box as the reader can actually SEE it: intersected with every ancestor that clips.
 *
 *  `getBoundingClientRect` — and the line-fragment rects above — report painted INK, and know
 *  nothing about `overflow: hidden`. A decorative 180px quotation glyph set on a 0.4 line-height
 *  inside an 80px clipping box therefore reported a box more than twice the height of the one on
 *  screen, and "collided" with the paragraph beneath it that it never touches. 26 of the slide
 *  gate's 44 failures were that one glyph, across every skin that uses it.
 *
 *  Clamping is the fix rather than exempting the element, which would have been the wrong shape of
 *  answer twice over: a decorative layer CAN genuinely sit over a label and want reporting, and the
 *  same clipped-box error applies to ordinary text in any scroll or clip container. The world audit
 *  already judges collisions this way for the same reason. Scrollable clippers count too — content
 *  reachable by scrolling is not on screen at this scroll offset, and a collision it is not part of
 *  is not a collision. */
function clampToClippers(el: Element, rect: DOMRect): DOMRect {
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;
  // Starts at the element ITSELF, not its parent: a line-clamped block is its own clipper, and the
  // fragment rects above are every line the browser laid out — including the ones the clamp hides.
  // Skipping it left a 3-line-clamped cover title reporting the height of its unclamped text and
  // "overlapping" the subtitle it visibly clears.
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const clipsX = cs.overflowX !== 'visible';
    const clipsY = cs.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const box = node.getBoundingClientRect();
    if (clipsX) {
      left = Math.max(left, box.left);
      right = Math.min(right, box.right);
    }
    if (clipsY) {
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
    }
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function textRunBoxes(card: Element, max = 400): { el: Element; rect: DOMRect; text: string }[] {
  const out: { el: Element; rect: DOMRect; text: string }[] = [];
  const push = (el: Element): void => {
    if (out.length >= max) return;
    const es = getComputedStyle(el);
    // Skip invisible AND deliberately faded-out layers: a watermark or a "ghost" stroke sitting
    // faint behind a badge is decoration, not a label the reader parses, so its box overlapping a
    // real label is by design — never a readability collision. Fades come through either opacity or
    // a low-alpha fill/color, so both are checked.
    if (es.visibility === 'hidden' || parseFloat(es.opacity) < 0.4) return;
    const paint = el.tagName.toLowerCase() === 'text' ? es.fill : es.color;
    // A real alpha channel only: the 4-value rgba() form, or the modern `rgb(r g b / a)` slash
    // form. Must NOT match opaque `rgb(r, g, b)` (whose third value would look like an alpha).
    const alpha =
      /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(paint) ??
      /rgba?\([^)]*\/\s*([\d.]+)\s*\)/.exec(paint);
    if (alpha && parseFloat(alpha[1]) < 0.4) return;
    if (isRotated(el, card)) return;
    const text = (el.textContent || '').trim();
    const rects: DOMRect[] = [];
    if (el.tagName.toLowerCase() !== 'text') {
      const range = document.createRange();
      range.selectNodeContents(el);
      if (typeof range.getClientRects === 'function') {
        const own = el.getBoundingClientRect();
        const clipsInline = es.overflowX !== 'visible' || es.textOverflow === 'ellipsis';
        const fontHeight = parseFloat(es.fontSize) || own.height;
        for (const fragment of range.getClientRects()) {
          const left = clipsInline ? Math.max(fragment.left, own.left) : fragment.left;
          const right = clipsInline ? Math.min(fragment.right, own.right) : fragment.right;
          const height = Math.min(fragment.height, fontHeight);
          const top = fragment.top + (fragment.height - height) / 2;
          rects.push({
            ...fragment,
            left,
            right,
            top,
            bottom: top + height,
            width: Math.max(0, right - left),
            height,
          } as DOMRect);
        }
      }
    }
    if (!rects.length) rects.push(el.getBoundingClientRect());
    for (const raw of rects) {
      if (out.length >= max) return;
      const rect = clampToClippers(el, raw);
      if (rect.width < 2 || rect.height < 2) continue;
      out.push({ el, rect, text });
    }
  };
  for (const t of card.querySelectorAll('text')) push(t);
  for (const el of card.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'text' || tag === 'tspan' || el.childElementCount > 0) continue;
    if (!(el.textContent || '').trim()) continue;
    push(el);
  }
  return out;
}

/** The worst sibling text-overlap in one card: two text runs whose boxes overlap by more than
 *  `tol` px on BOTH axes — a genuine 2-D collision, not two stacked lines that merely touch. */
export function auditCardOverlap(card: Element, tol = 3): OverlapHit | undefined {
  const boxes = textRunBoxes(card);
  let worst: OverlapHit | undefined;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // A tight display lockup (a huge numeral at sub-1 line-height with its caption tucked
      // close) deliberately lets GLYPH BOXES overlap while the ink stays clear — box collision
      // is its design, not a defect. The container says so with data-tight-lockup, and only
      // pairs INSIDE the same lockup are exempt: the lockup colliding with a NEIGHBOR is still
      // a real failure and still reported.
      const lockup = a.el.closest('[data-tight-lockup]');
      if (lockup !== null && lockup === b.el.closest('[data-tight-lockup]')) continue;
      // Map markers sit at real geographic coordinates — two nearby places genuinely collide at
      // the fitted zoom, and nudging them apart would lie about where they are. Their overlap is
      // data, not layout jumble, so marker-pane pairs are exempt; anything ELSE overlapping the
      // map (a caption, a neighboring card) is still a real failure and still reported.
      if (a.el.closest('.maplibregl-marker') && b.el.closest('.maplibregl-marker')) continue;
      // Two runs carrying the SAME text drawn on top of each other are a layered effect, not a
      // collision: the canonical case is a star rating's gold "★★★★★" fill clipped over its grey
      // "★★★★★" track, but the same holds for any duplicate drawn as a shadow/echo. The reader
      // sees one legible string, so this is never the "two labels unreadable over each other" bug.
      if (a.text && a.text === b.text) continue;
      const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (w <= tol || h <= tol) continue;
      const area = Math.round(w * h);
      if (!worst || area > worst.px) worst = { px: area, a: describe(a.el), b: describe(b.el) };
    }
  }
  return worst;
}

export interface OverlapReport {
  scanned: number;
  ms: number;
  overlaps: Array<OverlapHit & { type: string; family: string }>;
}

/** Sweep every gallery tile for the worst sibling text-overlap, worst first. */
export function auditGalleryOverlap(
  root: ParentNode = document,
  { tol = 3 }: { tol?: number } = {},
): OverlapReport {
  const t0 = performance.now();
  const tiles = [...root.querySelectorAll<HTMLElement>('.vlib-tile')];
  const overlaps: OverlapReport['overlaps'] = [];
  for (const tile of tiles) {
    const type = tile.querySelector('.vlib-type')?.textContent?.trim() || '?';
    const family = tile.querySelector('.vlib-fam')?.textContent?.trim() || '?';
    const card = tile.querySelector('.card');
    if (!card || INTENTIONAL.has(type)) continue;
    const hit = auditCardOverlap(card, tol);
    if (hit) overlaps.push({ ...hit, type, family });
  }
  overlaps.sort((a, b) => b.px - a.px);
  return { scanned: tiles.length, ms: Math.round(performance.now() - t0), overlaps };
}

export interface TruncationHit {
  /** 'ellipsis' = a literal "…" in the rendered text (our SVG char-cappers); 'clamp' = a CSS
   *  overflow-ellipsis / line-clamp actually cutting content off. */
  kind: 'ellipsis' | 'clamp';
  el: string;
  text: string;
}

// Rendered text that legitimately ends in "…" — static UI placeholders / pending-status verbs,
// never dynamic content. Everything else ending in "…" is a truncated label.
const STATIC_ELLIPSIS =
  /^(search|filter|filtering|loading|working|running|saving|updating|syncing|type|start typing|choose|select|add|new|untitled|more)\b/i;

/** Every truncated-looking text run in one card: a literal trailing "…" (what the SVG char-cap
 *  helpers emit), or an HTML element whose CSS ellipsis / line-clamp is cutting content off
 *  (content wider/taller than its box). Static placeholders ("Working…") are excused. */
export function auditCardTruncation(card: Element): TruncationHit[] {
  const hits: TruncationHit[] = [];
  const reported = new Set<Element>();
  const add = (kind: TruncationHit['kind'], el: Element, text: string): void => {
    if (reported.has(el)) return;
    reported.add(el);
    hits.push({ kind, el: describe(el), text: text.slice(0, 40) });
  };
  const visible = (es: CSSStyleDeclaration): boolean =>
    parseFloat(es.opacity) !== 0 && es.visibility !== 'hidden';
  const disclosed = (el: Element): boolean =>
    !!el.closest('[data-text-disclosure]') || el.hasAttribute('data-semantic-ellipsis');
  const renderedLineCount = (el: HTMLElement): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops: number[] = [];
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      if (!tops.some((top) => Math.abs(top - rect.top) < 2)) tops.push(rect.top);
    }
    range.detach();
    return tops.length;
  };

  for (const t of card.querySelectorAll('text')) {
    const txt = (t.textContent || '').trim();
    if (
      visible(getComputedStyle(t)) &&
      /…$/.test(txt) &&
      !STATIC_ELLIPSIS.test(txt) &&
      !disclosed(t)
    ) {
      add('ellipsis', t, txt);
    }
  }
  for (const el of card.querySelectorAll<HTMLElement>('*')) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    const es = getComputedStyle(el);
    if (!visible(es)) continue;
    const txt = (el.textContent || '').trim();
    if (!txt || STATIC_ELLIPSIS.test(txt) || disclosed(el)) continue;
    if (el.childElementCount === 0 && /…$/.test(txt)) {
      add('ellipsis', el, txt);
      continue;
    }
    const clamp = es.webkitLineClamp || es.getPropertyValue('-webkit-line-clamp');
    const clampLines = Number.parseInt(clamp, 10);
    const single =
      es.textOverflow === 'ellipsis' &&
      es.whiteSpace.includes('nowrap') &&
      el.scrollWidth > el.clientWidth + 1;
    // scrollHeight/clientHeight differs by 1–3 px on many fully-visible labels because line-height
    // and device-pixel rounding do not share a rounding boundary. Count actual rendered text lines
    // instead: a one-line clamp only truncates when the browser laid out at least two lines.
    const clamped =
      Number.isFinite(clampLines) && clampLines > 0 && renderedLineCount(el) > clampLines;
    if (single || clamped) add('clamp', el, txt);
  }
  return hits;
}

export interface TruncationReport {
  scanned: number;
  ms: number;
  truncations: Array<TruncationHit & { type: string; family: string }>;
}

/** Sweep every gallery tile for truncated labels. */
export function auditGalleryTruncation(root: ParentNode = document): TruncationReport {
  const t0 = performance.now();
  const tiles = [...root.querySelectorAll<HTMLElement>('.vlib-tile')];
  const truncations: TruncationReport['truncations'] = [];
  for (const tile of tiles) {
    const type = tile.querySelector('.vlib-type')?.textContent?.trim() || '?';
    const family = tile.querySelector('.vlib-fam')?.textContent?.trim() || '?';
    const card = tile.querySelector('.card');
    if (!card || INTENTIONAL.has(type)) continue;
    for (const hit of auditCardTruncation(card)) truncations.push({ ...hit, type, family });
  }
  return { scanned: tiles.length, ms: Math.round(performance.now() - t0), truncations };
}

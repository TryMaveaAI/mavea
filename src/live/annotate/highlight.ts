// Resolve a freehand mark to the exact on-screen text it was drawn over — the heart of the Mark
// highlighter. Rather than guess from a stroke's shape or match bounding boxes of a hand-picked set
// of CSS classes (the old, fragile approach), we sample points along the stroke and ask the browser
// itself, via caret hit-testing, which character sits under each one. That reads any text — a value,
// a label, prose, a table cell — with no per-block tagging, and never grabs a neighbour the way a
// bbox overlap would. Charts and images (no text caret) fall back to the labelled element under the
// path. Real-data-only: every name returned is literal text the user can see; nothing real → null.
//
// Layout-dependent hit-testing lives behind the injected HitTester; the rest is pure DOM walking
// (node ancestry, Range rects) that degrades gracefully where there's no layout (jsdom), so this
// module is unit-testable with a fake tester.
import { densify, isEnclosingStroke, samplePolygonInterior, type Pt } from './geometry';
import type { HitTester } from './hitTest';

const MAX_TEXT = 80;
// The mark's own SVG and Mavéa's annotation ink carry no answer text; the eyebrow/Ask are chrome.
const CHROME_SELECTOR = '.ink-user-overlay, .ink-layer, .block-ask, .card-eyebrow';

export interface HighlightResult {
  /** The literal on-screen text the stroke passed over. Non-empty (null is returned otherwise). */
  text: string;
  /** Owning block's data-spot-id, or '' when the grabbed text has no such ancestor — still valid
   *  (the text alone grounds the turn; this is the key win over the old data-spot-id requirement). */
  blockId: string;
  /** Precise viewport rects of the grabbed run(s), for drawing the in-place highlight. */
  rects: DOMRect[];
}

export const clampText = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT - 1) + '…' : t;
};

interface NodeSpan {
  node: Text;
  /** Smallest / largest caret offset the stroke touched within this node. */
  min: number;
  max: number;
  samples: number;
}

function isGrabbable(node: Text): boolean {
  if (!node.data || !node.data.trim()) return false;
  return !node.parentElement?.closest(CHROME_SELECTOR);
}

/** The character range to grab from a node: the crossed span, or — when the stroke only glanced a
 *  single caret position — the whole word around it (a dot on a word names that word). */
function spanRange(s: NodeSpan): [number, number] {
  if (s.min !== s.max) return [s.min, s.max];
  const data = s.node.data;
  let a = s.min;
  let b = s.min;
  while (a > 0 && !/\s/.test(data[a - 1])) a--;
  while (b < data.length && !/\s/.test(data[b])) b++;
  // A tap that lands exactly on whitespace (no word touching it either side) has nothing to
  // widen to — fall back to the single touched offset, never the whole node's text.
  return a < b ? [a, b] : [s.min, s.min + 1];
}

function domOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/** Climb to the nearest block carrying a non-empty data-spot-id, or null (text-only grab). */
function owningBlockId(node: Node): string {
  let el: Element | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  for (; el; el = el.parentElement) {
    const id = el.getAttribute?.('data-spot-id');
    if (id) return id;
  }
  return '';
}

/** Viewport rects of a character range within a text node. Empty where there's no layout (jsdom) —
 *  the highlight just isn't drawn there; resolution doesn't depend on these. */
function rangeRects(node: Text, lo: number, hi: number): DOMRect[] {
  try {
    const range = document.createRange();
    const len = node.length;
    range.setStart(node, Math.max(0, Math.min(lo, len)));
    range.setEnd(node, Math.max(0, Math.min(hi, len)));
    const list = range.getClientRects();
    const out: DOMRect[] = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r && r.width > 0 && r.height > 0) out.push(r);
    }
    return out;
  } catch {
    return [];
  }
}

function fromTextSpans(spans: Map<Text, NodeSpan>): HighlightResult | null {
  const list = [...spans.values()];
  const grab = (s: NodeSpan): string => {
    const [lo, hi] = spanRange(s);
    return s.node.data.slice(lo, hi);
  };
  // The node the stroke spent the most of its path over drives the owning block; ties go to the
  // longer grabbed run. A tangent into a neighbour contributes a stray char or two, never the name.
  let primary = list[0];
  for (const s of list) {
    if (
      s.samples > primary.samples ||
      (s.samples === primary.samples && grab(s).length > grab(primary).length)
    )
      primary = s;
  }
  const ordered = [...list].sort((a, b) => domOrder(a.node, b.node));
  const text = clampText(
    ordered
      .map(grab)
      .filter((t) => t.trim())
      .join(' '),
  );
  if (!text) return null;
  const rects: DOMRect[] = [];
  for (const s of ordered) {
    const [lo, hi] = spanRange(s);
    rects.push(...rangeRects(s.node, lo, hi));
  }
  return { text, blockId: owningBlockId(primary.node), rects };
}

/** The best human label for an element under the path: a chart's SVG text, an aria-label, or an
 *  image's alt/title — intentional labels only. We deliberately do NOT fall back to a container's
 *  own textContent: a mark over a card's empty padding must miss, not scoop up the whole card. */
function labelOfElement(el: Element): string {
  const svgText = el.matches?.('text, tspan') ? el : el.closest?.('text, tspan');
  const ariaHost = el.closest?.('[aria-label]');
  const candidates = [
    svgText?.textContent,
    ariaHost?.getAttribute('aria-label'),
    el.getAttribute?.('alt'),
    el.getAttribute?.('title'),
  ];
  for (const c of candidates) if (c?.trim()) return c;
  return '';
}

/** A chart label / image alt / aria-label under the path, when no text caret resolved. */
function fromElements(
  missPts: ReadonlyArray<{ x: number; y: number }>,
  hit: HitTester,
): HighlightResult | null {
  if (missPts.length === 0) return null;
  const mid = missPts[Math.floor(missPts.length / 2)];
  for (const el of hit.elementsAt(mid.x, mid.y)) {
    if (el.closest?.(CHROME_SELECTOR)) continue;
    const label = labelOfElement(el);
    if (label)
      return {
        text: clampText(label),
        blockId: owningBlockId(el),
        rects: [el.getBoundingClientRect()],
      };
  }
  return null;
}

/** Hit-test a set of already-viewport-mapped points, bucket the grabbable text they land on into
 *  per-node spans, and fall back to a labelled element when nothing textual resolved. Shared by the
 *  swipe path (points sampled ALONG the drawn line) and the loop path (points sampled ACROSS an
 *  enclosed interior) — only how the points are generated differs; the resolution logic is one. */
function resolveFromSamples(
  viewportPts: ReadonlyArray<{ x: number; y: number }>,
  hit: HitTester,
): HighlightResult | null {
  const spans = new Map<Text, NodeSpan>();
  const missPts: Array<{ x: number; y: number }> = [];
  for (const p of viewportPts) {
    const c = hit.caretAt(p.x, p.y);
    if (c && isGrabbable(c.node)) {
      const span = spans.get(c.node);
      if (!span) spans.set(c.node, { node: c.node, min: c.offset, max: c.offset, samples: 1 });
      else {
        if (c.offset < span.min) span.min = c.offset;
        if (c.offset > span.max) span.max = c.offset;
        span.samples++;
      }
    } else {
      missPts.push(p);
    }
  }
  return spans.size > 0 ? fromTextSpans(spans) : fromElements(missPts, hit);
}

/** Resolve the text/element the stroke was drawn over. `pts` are stage-local; `svgRect` maps them
 *  to viewport coordinates (which the caret/element APIs consume). Returns null when nothing real
 *  sits under the stroke (open space) so the caller can give honest "nothing to grab" feedback.
 *
 *  A CLOSED stroke (a lasso/circle) is resolved differently from an open swipe: sampling along the
 *  drawn line only ever touches the loop's own perimeter — the margin around a circled word, never
 *  the word itself — which is why a circle gesture used to never grab anything. So a closed stroke
 *  instead samples its INTERIOR on a grid and asks what's actually inside it. A "closed" gesture
 *  that encloses nothing real (a degenerate sliver, or genuinely empty space) falls through to the
 *  swipe path rather than reporting an honest miss outright — the pen still crossed something on
 *  its way around. */
export function highlightUnderStroke(
  pts: readonly Pt[],
  svgRect: { left: number; top: number },
  hit: HitTester,
): HighlightResult | null {
  if (pts.length === 0) return null;
  const toViewport = (p: Pt): { x: number; y: number } => ({
    x: p.x + svgRect.left,
    y: p.y + svgRect.top,
  });

  if (isEnclosingStroke(pts)) {
    const interior = samplePolygonInterior(pts.map(toViewport));
    const enclosed = interior.length > 0 ? resolveFromSamples(interior, hit) : null;
    if (enclosed) return enclosed;
  }

  const samples = densify(pts).map(toViewport);
  if (samples.length === 0) return null;
  return resolveFromSamples(samples, hit);
}

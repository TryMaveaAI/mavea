// The thin real-DOM seam between a screen point and the text (or element) underneath it. This is the
// ONLY ink module that calls layout-dependent browser APIs — caretRangeFromPoint / caretPositionFromPoint
// and elementsFromPoint — none of which jsdom can run. So the highlighter takes a HitTester by
// parameter (defaulting to the live browser one) and the unit tests inject a deterministic fake; the
// pure resolution logic in highlight.ts is then fully testable without layout.

export interface CaretHit {
  node: Text;
  /** Character offset within the text node, between glyphs — exactly like a text caret. */
  offset: number;
}

export interface HitTester {
  /** The exact text node + caret offset under a viewport point, or null over an SVG/image/canvas,
   *  whitespace, or a gap between text runs. */
  caretAt(clientX: number, clientY: number): CaretHit | null;
  /** Elements under a viewport point, topmost first — the non-text fallback (chart labels, images). */
  elementsAt(clientX: number, clientY: number): Element[];
}

// caretRangeFromPoint (Chromium/WebKit) is non-standard and not in the TS DOM lib; declare just that
// one locally. caretPositionFromPoint (Firefox/standard) is in the lib already, so we use it directly
// — guarded by a runtime typeof check since jsdom ships neither.
interface LegacyCaretDocument {
  caretRangeFromPoint?(x: number, y: number): Range | null;
}

// Both caret APIs return the CLOSEST caret to a point — even when the point is over empty space far
// from any text (a chart, a card's padding, the gap below the answer). Left unchecked, a sloppy mark
// would grab whatever text happened to be nearest. So we only accept a hit when the point actually
// sits on (or very near) the glyph at that offset, which also makes "nothing to grab" feedback
// honest: over genuinely open space the caret snaps away, fails this check, and we report a miss.
//
// The tolerance is deliberately asymmetric: a hand-drawn stroke wanders well above and below the
// baseline — into the gap between lines, a card's padding, the space around a value — far more than
// it wanders sideways, so a strict tolerance there was rejecting samples from an otherwise-perfectly
// -aimed drag (the dominant reason a swipe used to "almost never grab" the right text). Horizontal
// tolerance stays tight so a stray dip never quietly credits the wrong word on the same line.
const GLYPH_TOL_X = 6;
const GLYPH_TOL_Y = 14;
function onGlyph(node: Text, offset: number, x: number, y: number): boolean {
  try {
    if (node.length === 0) return false;
    const lo = Math.min(offset, node.length - 1);
    const range = document.createRange();
    range.setStart(node, lo);
    range.setEnd(node, lo + 1);
    const rects = range.getClientRects();
    if (rects.length === 0) return true; // no layout (shouldn't happen in a real browser) — don't over-reject
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (
        x >= r.left - GLYPH_TOL_X &&
        x <= r.right + GLYPH_TOL_X &&
        y >= r.top - GLYPH_TOL_Y &&
        y <= r.bottom + GLYPH_TOL_Y
      )
        return true;
    }
    return false;
  } catch {
    return true;
  }
}

function caretFromPoint(x: number, y: number): CaretHit | null {
  const legacy = document as Document & LegacyCaretDocument;
  let node: Text | null = null;
  let offset = 0;
  if (typeof legacy.caretRangeFromPoint === 'function') {
    const r = legacy.caretRangeFromPoint(x, y);
    if (r && r.startContainer.nodeType === Node.TEXT_NODE) {
      node = r.startContainer as Text;
      offset = r.startOffset;
    }
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const p = document.caretPositionFromPoint(x, y);
    if (p && p.offsetNode.nodeType === Node.TEXT_NODE) {
      node = p.offsetNode as Text;
      offset = p.offset;
    }
  }
  if (!node || !onGlyph(node, offset, x, y)) return null;
  return { node, offset };
}

/** The live-browser hit tester used everywhere outside unit tests. */
export const domHitTester: HitTester = {
  caretAt: caretFromPoint,
  elementsAt: (x, y) => document.elementsFromPoint(x, y),
};

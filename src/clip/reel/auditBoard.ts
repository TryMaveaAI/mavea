// The reel gallery's overflow/overlap audit — the mechanical half of "does this finish still fit".
// Mirrors the pattern SlidesLab's `auditPage` proved out: skip intentional clipping, and only treat
// a scrollWidth/scrollHeight gap as a real hit when two things both hold: the element's own overflow
// is actually set to hide it (`overflowY`/`overflowX` hidden or clip — an `overflow: visible`
// element cuts nothing off regardless of the gap), and some descendant's real painted rect
// corroborates it (`hasRealSpatialOverflow`) — tight display type reports a scroll-size gap from
// font leading alone, with every glyph still painted exactly on its line-height box, so the gap
// needs a second, geometry-based signal before it is trusted. Also adds the one thing a plain DOM
// audit can't see: SVG paint. CSS overflow rules stop at an <svg>'s own box — a <text> or <path>
// that draws past the SVG's viewBox is invisible to scrollWidth/clientWidth, so it needs its own
// coordinate-space-aware check via getBBox.

export interface AuditFlag {
  reason: string;
}

/** A short, readable tag for a flagged element: `div.reel-card` rather than a bare `<div>`. */
function labelOf(el: Element): string {
  const cls = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
  const tag = el.tagName.toLowerCase();
  return cls ? `${tag}.${cls}` : tag;
}

/** Content that clips or truncates by design — never a real audit hit. */
function isIntentional(el: Element): boolean {
  if (el.closest('[aria-hidden="true"]')) return true;
  // Both directions matter for a marquee: the scrolling track itself carries the marker, but the
  // element actually reporting the overflow is its ancestor band — the fixed-width stripe whose
  // `overflow: hidden` is *what makes* the infinite scroll read as a marquee instead of a runaway
  // line of text. A container built around a marquee track is the intentional clip boundary for it.
  if (el.closest('[data-reel-marquee]') || el.querySelector('[data-reel-marquee]')) return true;
  const cs = getComputedStyle(el);
  const clamp = cs.getPropertyValue('-webkit-line-clamp');
  if (clamp !== '' && clamp !== 'none') return true;
  // The nested highlighted/query spans inside an ellipsized line inherit its visual clipping but
  // not its `text-overflow` computed value. Treat the whole subtree as intentional once any ancestor
  // is the actual nowrap+ellipsis boundary, otherwise the hidden child text looks like board spill.
  for (let p: Element | null = el; p; p = p.parentElement) {
    const pcs = getComputedStyle(p);
    if (pcs.whiteSpace === 'nowrap' && pcs.textOverflow === 'ellipsis') return true;
  }
  // A soft-edged glow/mesh backdrop, or a punch-hole notch on a ticket stub, is drawn deliberately
  // past its own container's edge (a `position: absolute` descendant, possibly several levels deep,
  // whose painted rect pokes outside it) — the parent's `overflow: hidden` exists specifically to
  // crop that bleed to the card's shape. Any out-of-flow descendant whose real rect extends past
  // this element on any edge is that signature, regardless of which direction it bleeds toward.
  const bound = el.getBoundingClientRect();
  for (const d of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
    const dcs = getComputedStyle(d);
    if (dcs.position !== 'absolute' && dcs.position !== 'fixed') continue;
    const r = d.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (
      bound.left - r.left > 0.5 ||
      bound.top - r.top > 0.5 ||
      r.right - bound.right > 0.5 ||
      r.bottom - bound.bottom > 0.5
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `scrollHeight`/`scrollWidth` count a text node's full font metrics (ascent + descent + leading),
 * not just the box its `line-height` draws. Stack a few tight-set headings inside one clipping
 * card and their leading adds up at the card's own scrollHeight even though every glyph paints
 * exactly where its line-height put it — nothing is actually displaced. `getBoundingClientRect`
 * doesn't have this blind spot: it reports where a box was really laid out and painted, so a real
 * clip always leaves some descendant's rect spilling past the container's rect; a font-metric
 * artifact never does. This is the corroborating check before trusting a scroll-size gap.
 */
function hasRealSpatialOverflow(el: HTMLElement): boolean {
  const bound = el.getBoundingClientRect();
  const TOL = 2;
  for (const child of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
    const r = child.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (
      bound.left - r.left > TOL ||
      bound.top - r.top > TOL ||
      r.right - bound.right > TOL ||
      r.bottom - bound.bottom > TOL
    ) {
      return true;
    }
  }
  return false;
}

// Non-rendering SVG containers: a shape defined inside one is a template, not something painted at
// that spot, so comparing it against the surrounding viewBox would be a false positive.
const SVG_TEMPLATE_ANCESTOR = 'defs, symbol, clipPath, mask, pattern, marker';

/** SVG paint that spills past its own viewBox — CSS `overflow` can't see this, since an SVG's inner
 *  coordinate system is independent of the DOM box the browser clips to. */
function auditSvgPaint(board: HTMLElement): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const TOL = 2;
  for (const svg of Array.from(board.querySelectorAll('svg'))) {
    const vb = svg.viewBox.baseVal;
    if (!vb || (!vb.width && !vb.height)) continue; // no viewBox — nothing to compare paint against
    const nodes = svg.querySelectorAll<SVGGraphicsElement>(
      'text, path, rect, circle, ellipse, line, polygon, polyline, use, image',
    );
    for (const node of Array.from(nodes)) {
      if (node.closest('svg') !== svg) continue; // belongs to a NESTED svg's own viewBox, not this one
      if (node.closest(SVG_TEMPLATE_ANCESTOR)) continue;
      let box: DOMRect;
      try {
        box = node.getBBox();
      } catch {
        continue; // not yet laid out (detached, zero-size text)
      }
      if (!box.width && !box.height) continue;
      const over = Math.max(
        vb.x - box.x,
        vb.y - box.y,
        box.x + box.width - (vb.x + vb.width),
        box.y + box.height - (vb.y + vb.height),
      );
      if (over > TOL) {
        flags.push({
          reason: `<${node.tagName.toLowerCase()}> paints ${over.toFixed(1)}u past its svg viewBox`,
        });
      }
    }
  }
  return flags;
}

/**
 * Walk every element under `board` (a `.reel-board`) and report anything genuinely clipped or
 * spilling past the board's own edge. Assumes `board` is at rest — true for every finish tile in
 * the gallery, which renders with `playing={false}` so its one-time entrance is the transform-free
 * fade (see ReelGallery's audit wiring for why that holds).
 */
export function auditBoard(board: HTMLElement): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const boardRect = board.getBoundingClientRect();

  // FitScale's safety extent can be wider than the finish people actually see (clipped labels,
  // decorative glows, carets). The visible root must still sit on the stage centerline in every
  // aspect; this catches the subtle whole-composition left lean that overflow checks cannot see.
  const stage = board.querySelector<HTMLElement>('.reel-stage');
  const fitInner = stage?.firstElementChild?.firstElementChild?.firstElementChild as
    | HTMLElement
    | undefined;
  const visualRoot = fitInner?.firstElementChild as HTMLElement | undefined;
  if (stage && visualRoot) {
    const s = stage.getBoundingClientRect();
    const r = visualRoot.getBoundingClientRect();
    const drift = r.left + r.width / 2 - (s.left + s.width / 2);
    if (Math.abs(drift) > 1) {
      flags.push({
        reason: `visible finish is ${Math.abs(drift).toFixed(1)}px off the stage center`,
      });
    }
  }

  for (const el of Array.from(board.querySelectorAll<HTMLElement>('*'))) {
    if (isIntentional(el)) continue;

    // A scrollWidth/scrollHeight gap only means lost content when the element actually clips its
    // own overflow. Tight display type (line-height set under the font's natural leading, common
    // on hero numerals and the wordmark) always reports a few px of "extra" scrollHeight even
    // though `overflow: visible` paints every pixel of it — nothing is cut off, so it is not a hit.
    const cs = getComputedStyle(el);
    const clipsV = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const clipsH = cs.overflowX === 'hidden' || cs.overflowX === 'clip';

    const dw = el.scrollWidth - el.clientWidth;
    const dh = el.scrollHeight - el.clientHeight;
    const scrollGap = (clipsH && dw > 4) || (clipsV && dh > 4);
    if (scrollGap && hasRealSpatialOverflow(el)) {
      if (clipsH && dw > 4) {
        flags.push({ reason: `scrollWidth exceeds clientWidth by ${dw}px in <${labelOf(el)}>` });
      }
      if (clipsV && dh > 4) {
        flags.push({ reason: `scrollHeight exceeds clientHeight by ${dh}px in <${labelOf(el)}>` });
      }
    }

    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue; // nothing painted (a hidden spacer, a collapsed node)
    const spill = Math.max(
      boardRect.left - r.left,
      boardRect.top - r.top,
      r.right - boardRect.right,
      r.bottom - boardRect.bottom,
    );
    if (spill > 1) {
      flags.push({
        reason: `bounds spill ${spill.toFixed(1)}px past .reel-board in <${labelOf(el)}>`,
      });
    }
  }
  flags.push(...auditSvgPaint(board));
  return flags;
}

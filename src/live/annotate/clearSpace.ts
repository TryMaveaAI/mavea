// Clear-space detection for written ink: a label (a note's words, a question's "?", a brace or
// bracket caption) must never land over the card's own text or controls — writing prose over a
// dense card is exactly what got the first written-aside feature pulled. Strokes are exempt:
// a circle or underline is see-through by design and DRAWS ON the data it names; it's the
// opaque written words that must find genuinely empty card space or stay unwritten.
//
// The check is geometric, not heuristic: gather the viewport boxes of everything readable or
// interactive inside the card once per measurement (post-settle, so layout is at rest), then
// test each candidate label box for intersection. jsdom reports zero-size boxes for all of it,
// so tests drive this with stubbed rects and the first candidate wins there by construction.
import type { LabelPlace, Rect } from './gesture';

/** Elements that count as occupied space beyond raw text: pictures, plots' own labels, and
 *  anything the user can press. */
const OCCUPIED_SELECTOR = 'svg text, img, canvas, video, button, input, select, textarea, a';

/** Chrome the pen itself added never counts as content — ink may layer over ink. (The per-block
 *  action pills are NOT exempt: covering the Ask button with a scrawl is covering a control.) */
const IGNORE_CLOSEST = '.ink-layer, .ink-connect-layer, .note-rail';

/** A cost guard for pathological cards. Truncation fails CLOSED: a card too dense to finish
 *  measuring is treated as having no clear space at all, never as approved-by-default. */
const MAX_BOXES = 600;

/** A box that collides with every candidate — the fail-closed sentinel for a truncated walk. */
const EVERYWHERE = {
  left: -1e9,
  top: -1e9,
  width: 2e9,
  height: 2e9,
} as DOMRect;

/** Every viewport box of readable text (per line box, via a Range around each text node) and of
 *  the occupied-selector elements inside `host`. Zero-size boxes (jsdom, display:none) drop out. */
export function occupiedRects(host: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  const push = (r: DOMRect): void => {
    if (r.width > 0 && r.height > 0 && out.length < MAX_BOXES) out.push(r);
  };
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (out.length >= MAX_BOXES) return [EVERYWHERE];
    const text = node as Text;
    if (!text.textContent?.trim()) continue;
    if (text.parentElement?.closest(IGNORE_CLOSEST)) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    if (typeof range.getClientRects !== 'function') continue;
    for (const r of Array.from(range.getClientRects())) push(r);
  }
  for (const el of Array.from(host.querySelectorAll<Element>(OCCUPIED_SELECTOR))) {
    if (out.length >= MAX_BOXES) return [EVERYWHERE];
    if (el.closest(IGNORE_CLOSEST)) continue;
    push(el.getBoundingClientRect());
  }
  return out;
}

/** Whether two boxes overlap once `a` is inflated by `pad` on every side — the pad keeps a
 *  label from kissing the text it cleared. */
export function intersects(a: Rect, b: Rect, pad = 3): boolean {
  return (
    a.left - pad < b.left + b.width &&
    a.left + a.width + pad > b.left &&
    a.top - pad < b.top + b.height &&
    a.top + a.height + pad > b.top
  );
}

/** The first candidate placement whose box touches nothing occupied — null when every candidate
 *  collides ("no space, no words": the caller drops the written label, or the whole mark when
 *  the label IS the mark). Boxes and occupied rects must share one coordinate space. */
export function firstClearPlace(
  candidates: readonly { place: LabelPlace; box: Rect }[],
  occupied: readonly Rect[],
  pad = 3,
): LabelPlace | null {
  for (const c of candidates) {
    if (!occupied.some((o) => intersects(c.box, o, pad))) return c.place;
  }
  return null;
}

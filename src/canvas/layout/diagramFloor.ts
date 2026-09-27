// The labels of a diagram drawn in viewBox user units paint at the size its box gives them: a
// chart laid out narrower draws every label smaller, whatever scale is applied on top. So a fit
// that states a magnification can still show a diagram smaller than the reader saw it before —
// the Lens reflows a card to its stage, and a stage narrower than the board's card drew a
// causation chain at 0.92x of the board under a readout of 150%, and at 3.9px on a phone.
//
// A floor for those labels is the one thing no uniform scale can promise, so it is held here:
// the diagram keeps a layout width at which its smallest label reaches the floor, and the box
// around it pans the rest — the same trade the board's legibility guard makes, stated per
// diagram rather than per card.
import { regionLabel } from '../hooks/useAccessibleScrollRegions';

/** The 9px floor audit:ui and audit:surfaces hold, aimed a tenth above: fractional viewBox
 *  rounding lands an exact 9 at 8.9 painted. */
const TARGET_PX = 9.1;
/** Within this of its floor a label already holds it; re-pinning over rounding only jitters. */
const SLACK_PX = 0.05;
const SCROLLY = new Set(['auto', 'scroll']);

/** Held elements, marked so a release finds them without a registry that could outlive them. */
const PIN = 'data-diagram-floor';
const PAN = 'data-diagram-pan';

/** A diagram's labels: every element that paints glyphs, outside the ones that only define. */
function labelsOf(svg: SVGSVGElement): SVGTextContentElement[] {
  return Array.from(svg.querySelectorAll<SVGTextContentElement>('text, tspan, textPath')).filter(
    (t) => !t.closest('defs, clipPath, mask, pattern'),
  );
}

/** Every viewBox SVG under `root` that carries a label, in document order. An icon has a viewBox
 *  and no text, so it is never counted, and the order is the same wherever the block renders. */
function diagramsIn(root: Element): SVGSVGElement[] {
  return Array.from(root.querySelectorAll<SVGSVGElement>('svg[viewBox]')).filter(
    (svg) => labelsOf(svg).length > 0,
  );
}

/** The painted px of the smallest label a reader can see in `svg`; 0 when none can be measured. */
function smallestLabelPx(svg: SVGSVGElement): number {
  let min = Infinity;
  for (const label of labelsOf(svg)) {
    const cs = getComputedStyle(label);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity || '1') < 0.15) continue;
    const size = parseFloat(cs.fontSize);
    const m = label.getScreenCTM?.();
    if (!size || !m) continue;
    const det = Math.abs(m.a * m.d - m.b * m.c);
    if (det > 0) min = Math.min(min, size * Math.sqrt(det));
  }
  return Number.isFinite(min) ? min : 0;
}

/** For each labelled diagram under `root`, in document order, the painted px of its smallest
 *  label — what a reader already saw it at, for a later rendering to hold. */
export function diagramLabelPx(root: Element): number[] {
  return diagramsIn(root).map(smallestLabelPx);
}

/** What was there before a hold, so a release puts back exactly that. `null` is "absent". */
interface Authored {
  styles: Map<string, string>;
  attrs: Map<string, string | null>;
  /** Classes the hold added, and the listener it attached, to take off again. */
  classes: string[];
  off?: () => void;
}
const authored = new WeakMap<Element, Authored>();

function savedOf(el: Element): Authored {
  let saved = authored.get(el);
  if (!saved) authored.set(el, (saved = { styles: new Map(), attrs: new Map(), classes: [] }));
  return saved;
}

function setStyle(el: HTMLElement | SVGElement, prop: string, value: string): void {
  const { styles } = savedOf(el);
  if (!styles.has(prop)) styles.set(prop, el.style.getPropertyValue(prop));
  el.style.setProperty(prop, value);
}

function setAttr(el: Element, name: string, value: string): void {
  const { attrs } = savedOf(el);
  if (!attrs.has(name)) attrs.set(name, el.getAttribute(name));
  el.setAttribute(name, value);
}

function restore(el: HTMLElement | SVGElement): void {
  const saved = authored.get(el);
  authored.delete(el);
  if (!saved) return;
  for (const [prop, was] of saved.styles) {
    if (was) el.style.setProperty(prop, was);
    else el.style.removeProperty(prop);
  }
  for (const [name, was] of saved.attrs) {
    if (was === null) el.removeAttribute(name);
    else el.setAttribute(name, was);
  }
  el.classList.remove(...saved.classes);
  saved.off?.();
}

/** The board's pan cue (hscroll.css): an edge shadow while there is more to see, gone at the end. */
function cue(pan: HTMLElement): void {
  const saved = savedOf(pan);
  const added = ['canvas-hscroll'].filter((c) => !pan.classList.contains(c));
  pan.classList.add(...added);
  saved.classes.push(...added);
  const sync = (): void => {
    pan.classList.toggle(
      'canvas-hscroll--end',
      pan.scrollLeft + pan.clientWidth >= pan.scrollWidth - 2,
    );
  };
  sync();
  pan.addEventListener('scroll', sync, { passive: true });
  saved.classes.push('canvas-hscroll--end');
  saved.off = () => pan.removeEventListener('scroll', sync);
}

/** Put every diagram under `root` back to its own layout. */
export function releaseDiagrams(root: Element): void {
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>(`[${PIN}], [${PAN}]`)) {
    restore(el);
  }
}

/** The box that pans a held diagram: the nearest scroller between it and its card, else the
 *  element that holds it. */
function panOf(svg: SVGSVGElement): HTMLElement | null {
  for (let a = svg.parentElement; a && !a.classList.contains('card'); a = a.parentElement) {
    if (SCROLLY.has(getComputedStyle(a).overflowX)) return a;
  }
  return svg.parentElement;
}

/**
 * Hold every labelled diagram under `root` so its smallest label paints at `floors[i]` (the i-th
 * diagram, in document order) and never under the 9px floor. A diagram short of that keeps a
 * layout width and height grown by the same factor — its geometry stays proportional — and the
 * box around it pans. Starts from the diagrams' own layout, so it can be re-run on every fit.
 */
export function holdDiagrams(root: Element, floors: readonly number[] = []): void {
  releaseDiagrams(root);
  // Every read first, then every write: interleaved, each write would force the next read to
  // lay the whole card out again.
  const plans = diagramsIn(root).flatMap((svg, i) => {
    const now = smallestLabelPx(svg);
    const want = Math.max(TARGET_PX, floors[i] ?? 0);
    if (!now || now >= want - SLACK_PX) return [];
    const box = svg.getBoundingClientRect();
    // An inline glyph is small in BOTH axes; a wide, short chart is still a chart.
    if (box.width < 80 && box.height < 24) return [];
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h) return [];
    const k = want / now;
    return [{ svg, w: Math.ceil(w * k), h: Math.ceil(h * k), pan: panOf(svg) }];
  });
  for (const { svg, w, h, pan } of plans) {
    setAttr(svg, PIN, '');
    // The guard's own rule (hscroll.css): the diagram keeps this width instead of shrinking to
    // its box.
    setAttr(svg, 'data-legibility-guard', '');
    setStyle(svg, 'min-width', `${w}px`);
    setStyle(svg, 'min-height', `${h}px`);
    if (!pan || pan.hasAttribute(PAN)) continue;
    setAttr(pan, PAN, '');
    setStyle(pan, 'overflow-x', 'auto');
    setStyle(pan, 'max-width', '100%');
    // The diagram grows both ways, so a height cap on its box would make a second, nested scroll.
    setStyle(pan, 'max-height', 'none');
    // A region that pans is reachable and named, like every pan region on the board.
    if (!pan.hasAttribute('tabindex')) setAttr(pan, 'tabindex', '0');
    if (!pan.hasAttribute('role')) setAttr(pan, 'role', 'region');
    if (!pan.hasAttribute('aria-label') && !pan.hasAttribute('aria-labelledby')) {
      setAttr(pan, 'aria-label', regionLabel(pan));
    }
  }
  // Read after every width is on the page, so the cue knows whether there is anything past the
  // edge.
  for (const { pan } of plans) if (pan && !savedOf(pan).off) cue(pan);
}

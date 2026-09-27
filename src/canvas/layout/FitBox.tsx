// FitBox — the deterministic "it always fits its card" backstop for canvas blocks.
//
// Most blocks fit for free under the CSS contract (.card-frame + the overflow net in
// visualizations-extra.css). A few can't be tamed with CSS alone: dense diagrams,
// fixed-coordinate SVGs, and wide tables carry an intrinsic minimum size that a narrow
// card (col-3, or a phone) simply can't hold. Those blocks opt into FitBox, which
// measures the content's true size and uniformly scales it DOWN (never up, never
// squished) so it fits the card width — the same guarantee the reel's <FitScale> gives
// every finish, generalized to the canvas.
//
// Built for the weakest hardware (see [[feedback-runs-on-all-hardware]]):
//   • The process-wide shared ResizeObserver (observeResize) drives every FitBox, not one
//     observer per block — N blocks cost one observer, not N.
//   • `content-visibility: auto` so a block scrolled off-screen skips layout and paint
//     entirely until it nears the viewport.
//   • A fits-already early-out: when the content is already within the card, scale stays
//     1 and no transform is applied, so the common case pays nothing.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { observeResize } from './sharedResize';

const CLIP = new Set(['hidden', 'clip', 'auto', 'scroll']);

/** Below this many RENDERED px, type is being squinted at rather than read — the repo's floor,
 *  the one audit:ui and audit:surfaces enforce. A fit never scales a block's smallest type
 *  under it; past that point the host scrolls the remainder rather than paint the unreadable. */
const LEGIBLE_FLOOR_PX = 9;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What one unit of `el`'s font-size paints at on screen. Inside an SVG the size is in USER
 *  units, so the element's own screen CTM says what they come to (a chart drawn at 2.4x makes
 *  8 units 19px; one drawn small makes them a speck). Everywhere else it is `rendered`, the scale
 *  every ancestor applies to the host. The CTM already carries those ancestors. */
function unitPx(el: Element, rendered: number): number {
  const ctm = (el as Partial<SVGGraphicsElement>).getScreenCTM;
  if (el.namespaceURI === SVG_NS && typeof ctm === 'function') {
    const m = ctm.call(el);
    if (m) return Math.hypot(m.a, m.b);
  }
  return rendered;
}

const GEOMETRY = new Set([
  'transform',
  'translate',
  'scale',
  'rotate',
  'left',
  'top',
  'right',
  'bottom',
  'inset',
  'width',
  'height',
  'zoom',
]);

/** Does this animation move or resize what it runs on? */
function movesGeometry(a: Animation): boolean {
  if ('transitionProperty' in a) return GEOMETRY.has((a as CSSTransition).transitionProperty);
  const effect = a.effect as KeyframeEffect | null;
  if (typeof effect?.getKeyframes !== 'function') return false;
  return effect.getKeyframes().some((f) => Object.keys(f).some((p) => GEOMETRY.has(p)));
}

/** The finite, running geometry animations on `el`'s ancestors. A read taken while one runs
 *  measures a frame of the flight (the Study's card sweeping forward scales the host by an amount
 *  that is still moving), not where the host lands. A paused animation is excluded: the video
 *  export pauses every animation and seeks it, and its `finished` would never come. */
function ancestorFlights(el: HTMLElement): Animation[] {
  const out: Animation[] = [];
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (typeof a.getAnimations !== 'function') break;
    for (const anim of a.getAnimations()) {
      if (anim.playState !== 'running') continue;
      if (!Number.isFinite(anim.effect?.getComputedTiming().endTime)) continue;
      if (movesGeometry(anim)) out.push(anim);
    }
  }
  return out;
}

/** How many characters of text `el` holds DIRECTLY — its own text nodes, not its children's. A
 *  label set as `Revenue <b>up</b>` carries its own words beside an element, and a walk that
 *  only read elements with no children never saw them. */
function ownChars(el: Element): number {
  let n = 0;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === Node.TEXT_NODE) n += (c.nodeValue ?? '').trim().length;
  }
  return n;
}

/** The nearest ancestor that bounds this box's height: a scroller, or any clipped element whose
 *  height is capped. Null when nothing above the box is bounded — the block may run as tall as
 *  it likes there, so there is no height to fit. */
function boundedAncestor(el: HTMLElement): HTMLElement | null {
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (!CLIP.has(cs.overflowY)) continue;
    if (cs.maxHeight !== 'none' || (cs.height !== 'auto' && cs.height !== '')) return a;
    if (a.scrollHeight > a.clientHeight + 1) return a;
  }
  return null;
}

/** The ancestor from `box` up that caps its height, and that cap in px. A PERCENTAGE cap is a
 *  share of the parent's content box — how a sheet that hugs a short card still states the whole
 *  room a tall one may fill — so it is resolved there; read with parseFloat, `100%` was a 100px
 *  cap. In a flex column the siblings stacked with it (the Lens's strip) take their share first,
 *  exactly as the layout will. `room` is that parent, whose resize moves the cap. Null when
 *  nothing states one. */
function capOf(box: HTMLElement): { el: HTMLElement; px: number; room: HTMLElement | null } | null {
  for (let a: HTMLElement | null = box; a && a !== document.body; a = a.parentElement) {
    const raw = getComputedStyle(a).maxHeight;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) continue;
    if (!raw.endsWith('%')) return { el: a, px: n, room: null };
    const room = a.parentElement;
    if (!room) return null;
    const rs = getComputedStyle(room);
    const inner =
      room.clientHeight - parseFloat(rs.paddingTop || '0') - parseFloat(rs.paddingBottom || '0');
    let px = (inner * n) / 100;
    if (/flex/.test(rs.display) && rs.flexDirection.startsWith('column')) {
      const stacked = Array.from(room.children).filter((k): k is HTMLElement => {
        if (k === a || !(k instanceof HTMLElement)) return false;
        const ks = getComputedStyle(k);
        return ks.display !== 'none' && ks.position !== 'absolute' && ks.position !== 'fixed';
      });
      const gaps = stacked.length * (parseFloat(rs.rowGap) || 0);
      const taken = stacked.reduce((sum, k) => sum + k.getBoundingClientRect().height, gaps);
      px = Math.min(px, inner - taken);
    }
    return { el: a, px, room };
  }
  return null;
}

export interface FitBoxProps {
  children: ReactNode;
  /** Also bound the scaled height to this many times the natural card width (so an
   *  extremely tall block can't make a card a mile high). Omit to fit width only. */
  maxAspect?: number;
  /** Fit the HEIGHT of the nearest bounded ancestor too (the Study's front card, the Lens
   *  sheet): a block taller than its box is scaled down — type and chrome together — until it
   *  fits, and stops at the legibility floor, past which the box scrolls what is left. A card
   *  that fits at a glance beats one the reader has to scroll inside a frame, and the floor
   *  is measured in rendered pixels, so a big display allows more of a shrink than a phone. */
  fitHeight?: boolean;
  /** With `fitHeight`: the rendered px the block's BODY type — the size carrying most of its
   *  words — should reach. A block whose body paints under it is GROWN — type and chrome
   *  together, reflowed to the same width — as far as the box allows, so an object on a desk
   *  drawn at its floor scale is still read at a reading size rather than the desk's scenery
   *  size. The box wins: a block that cannot grow and still fit is left as it is. Omit to only
   *  ever shrink. */
  readingPx?: number;
  /** Never scale the block below this — the size a reader has already seen it at (the Lens
   *  never shows a card smaller than the board did). Past it the host scrolls. */
  minScale?: number;
  /** Hold the block at its own size and measure nothing: the host is magnifying it itself, and
   *  a fit underneath would make the magnification it states untrue. */
  hold?: boolean;
  /** This box answers for the whole block's scale, so any FitBox nested inside it stands down.
   *  Two fits compounding is a picture drawn at a size no readout can state. */
  governs?: boolean;
  /** Told the scale the fit settled on, whenever it changes — for a host that states it (the
   *  Lens's zoom readout) or carries it on (a magnification that starts where the fit left off). */
  onScale?: (k: number, fit: FitFacts) => void;
  className?: string;
}

/** What a height fit learned about its block, beyond the scale it chose. */
export interface FitFacts {
  /** The scale at which the block's smallest visible type paints at the 9px floor (0 when it
   *  holds no text). A host magnifying the block itself stops its zoom-out here. */
  legibleMin: number;
  /** The block, at the chosen scale, is still taller than its box — the host will scroll it. */
  spills: boolean;
}

/** Set by a governing FitBox for everything inside it. */
const Governed = createContext(false);

interface Fit extends FitFacts {
  k: number;
  needH: number;
}
const AT_REST: Fit = { k: 1, needH: 0, legibleMin: 0, spills: false };
/** Keep the previous fit unless something a reader could see (or a host is told) moved. */
const settle = (p: Fit, n: Fit): Fit =>
  Math.abs(p.k - n.k) > 0.002 ||
  Math.abs(p.legibleMin - n.legibleMin) > 0.002 ||
  p.spills !== n.spills
    ? n
    : p;

/** The most a reading target may grow a block. Past this the ask is not "read this at size"
 *  but "make a small thing enormous", and a block with one 8px caption would fill the box. */
const GROW_MAX = 1.5;

/**
 * Wrap a block whose intrinsic size can exceed a narrow card. FitBox keeps it at scale 1
 * whenever it fits, and downscales it to the card width when it doesn't — measured before
 * paint, re-measured on resize via the shared observer.
 */
export function FitBox({
  children,
  maxAspect,
  fitHeight = false,
  readingPx,
  minScale = 0,
  hold = false,
  governs = false,
  onScale,
  className,
}: FitBoxProps) {
  const governed = useContext(Governed);
  const still = hold || governed;
  const host = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // scale only — height collapses to the scaled content height so the card never reserves
  // empty space below a shrunk block. The natural height rides along so the reclaim below is
  // exact rather than a share of the width.
  const [fit, setFit] = useState<Fit>(AT_REST);
  const { k, legibleMin, spills } = fit;
  useEffect(() => {
    onScale?.(k, { legibleMin, spills });
  }, [k, legibleMin, spills, onScale]);

  useLayoutEffect(() => {
    const h = host.current;
    const i = inner.current;
    if (!h || !i) return;
    if (still) {
      setFit((p) => (p.k === 1 ? p : AT_REST));
      return;
    }

    // A height fit reads the scale the host PAINTS at, and mid-flight that is a scale the host is
    // only passing through: the Study's card sweeping in from the gathered pile paints its type
    // small, so the fit grew it 1.25x, and 0.9s later nothing resized to correct it (a transform
    // never resizes anything) until an unrelated re-measure — after the pen had anchored, which
    // then moved. So a height fit takes no read while an ancestor moves, and takes one when it
    // lands. A width fit reads layout px alone, which no transform changes, and keeps its reads.
    let dead = false;
    let awaitingLanding = false;
    const inFlight = (): boolean => {
      if (!fitHeight) return false;
      const flights = ancestorFlights(h);
      if (!flights.length) return false;
      if (!awaitingLanding) {
        awaitingLanding = true;
        void Promise.allSettled(flights.map((f) => f.finished)).then(() => {
          awaitingLanding = false;
          if (!dead) measure();
        });
      }
      return true;
    };

    const measure = (): void => {
      const availW = h.clientWidth;
      if (!availW || inFlight()) return;

      // Read the content's TRUE width: neutralize our own transform and momentarily reveal
      // any internal clipping, so a child that clips itself still reports its real extent.
      //
      // Batched into distinct read-then-write phases (one DOM walk, cached) rather than
      // interleaving getComputedStyle/scrollWidth reads with style writes per element —
      // interleaving forces the browser to flush layout on every iteration ("layout
      // thrashing"), which is the dominant cost here for the dense diagrams/wide tables
      // this component exists for (confirmed via a real-browser CPU profile of a demo
      // session: FitBox's measure was the top actual application hot spot). Same
      // conditions, same values, same restore — only the read/write ordering changed.
      const all = i.querySelectorAll<HTMLElement>('*');

      const prevT = i.style.transform;
      i.style.transform = 'none';
      // The stretch too: a scaled box is laid out at 100/k% so it fills the host after the
      // transform, and measured at that width it reports host ÷ k as its own extent — which is
      // exactly the overflow that produces k again. Left in place it was a ratchet: a card
      // shrunk once in a short window kept its scale at every size the window grew to after.
      const prevStretch = i.style.width;
      i.style.width = '';

      // Read phase: decide which elements need clip-neutralizing (no writes yet).
      const toNeutralize: HTMLElement[] = [];
      for (const el of all) {
        const cs = getComputedStyle(el);
        if (CLIP.has(cs.overflowX) || CLIP.has(cs.overflowY) || cs.webkitLineClamp !== 'none') {
          toNeutralize.push(el);
        }
      }

      // Write phase: apply neutralizing styles.
      const restore: { el: HTMLElement; o: string; c: string }[] = [];
      for (const el of toNeutralize) {
        restore.push({ el, o: el.style.overflow, c: el.style.webkitLineClamp });
        el.style.overflow = 'visible';
        el.style.webkitLineClamp = 'unset';
      }

      // What one CSS px of this box paints at, after every ancestor's own scale (the Study's
      // desk, a dimmed card): the floor is a promise about the retina, not the stylesheet.
      const rendered = h.offsetWidth ? h.getBoundingClientRect().width / h.offsetWidth : 1;
      // Read phase: measure with clipping neutralized, no writes in between. The smallest type,
      // in the px it PAINTS at, rides along in the same walk: it is what the legibility floor is
      // measured against. Text nobody can see (a faded label, a hidden layer) sets no floor.
      let needW = i.scrollWidth;
      const needH = i.scrollHeight;
      let minPx = Infinity;
      // The body size is the one most of the words are set in — a weighted mode, so a heading
      // and a badge cannot pull it either way.
      const words = new Map<number, number>();
      for (const el of all) {
        if (el.scrollWidth > needW) needW = el.scrollWidth;
        if (!fitHeight) continue;
        const chars = ownChars(el);
        if (chars <= 1) continue;
        if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) {
          continue;
        }
        const px =
          Math.round(parseFloat(getComputedStyle(el).fontSize) * unitPx(el, rendered) * 10) / 10;
        if (!(px > 0)) continue;
        if (px < minPx) minPx = px;
        words.set(px, (words.get(px) ?? 0) + chars);
      }
      let availH = Infinity;
      if (fitHeight) {
        const box = boundedAncestor(h);
        if (box) {
          const bs = getComputedStyle(box);
          const above =
            h.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
          availH = box.clientHeight - above / (rendered || 1) - parseFloat(bs.paddingBottom || '0');
          // A scroller that is a flex child of a capped card stands only as tall as what it
          // holds, so its client height says how tall the block IS, not how tall it MAY be.
          // The cap is on the ancestor that states one; the room is that cap less the chrome
          // between the two boxes. Without it a block that fits could never grow into the room.
          const cap = capOf(box);
          if (cap) {
            const chrome =
              (cap.el.getBoundingClientRect().height - box.getBoundingClientRect().height) /
              (rendered || 1);
            availH = Math.max(
              availH,
              cap.px - chrome - above / (rendered || 1) - parseFloat(bs.paddingBottom || '0'),
            );
          }
        }
      }

      // A reading target: try the size the type asks for, then three steps back toward 1, at the width each would
      // reflow to — text wraps to more lines as the block narrows, so its height at the candidate
      // width is what the box has to hold, not its height at full width times the scale. Read
      // while the clips are still neutralized and the transform is still off.
      let grown: { k: number; needH: number } | null = null;
      let bodyPx = 0;
      let bodyChars = 0;
      for (const [px, chars] of words) if (chars > bodyChars) [bodyPx, bodyChars] = [px, chars];
      if (fitHeight && readingPx && bodyPx > 0 && Number.isFinite(availH)) {
        const want = Math.min(GROW_MAX, readingPx / bodyPx);
        if (want > 1.01) {
          const prevW = i.style.width;
          for (const kc of [
            want,
            1 + (want - 1) * 0.75,
            1 + (want - 1) * 0.5,
            1 + (want - 1) * 0.25,
          ]) {
            i.style.width = `${(100 / kc).toFixed(3)}%`;
            const hc = i.scrollHeight;
            if (hc * kc <= availH + 1) {
              grown = { k: Math.floor(kc * 1000) / 1000, needH: hc };
              break;
            }
          }
          i.style.width = prevW;
        }
      }

      // Write phase: restore.
      for (const r of restore) {
        r.el.style.overflow = r.o;
        r.el.style.webkitLineClamp = r.c;
      }
      i.style.transform = prevT;
      i.style.width = prevStretch;

      // Early-out: already fits both ways. Stay at 1 — no transform, no cost. (1px tolerance
      // absorbs sub-pixel rounding so a block that exactly fits doesn't flutter.)
      const fitsW = !needW || needW <= availW + 1;
      const fitsH = !fitHeight || !needH || !Number.isFinite(availH) || needH <= availH + 1;
      const legible = Number.isFinite(minPx) ? LEGIBLE_FLOOR_PX / minPx : 0;
      if (grown && fitsW) {
        const next = { ...grown, legibleMin: legible, spills: false };
        setFit((p) => settle(p, next));
        return;
      }
      if (fitsW && fitsH) {
        setFit((p) => settle(p, { ...AT_REST, legibleMin: legible }));
        return;
      }
      const rawW = fitsW ? 1 : availW / needW;
      const rawH = fitsH ? 1 : availH / needH;
      let raw = Math.min(rawW, rawH);
      // The legibility floor: the smallest type in the block, as it will actually paint, stays
      // at or above the floor. A width fit keeps its old hard stop; a height fit that cannot
      // get there legibly stops at the floor and leaves the rest to the host's scroll.
      if (fitHeight && Number.isFinite(minPx)) {
        const floor = LEGIBLE_FLOOR_PX / minPx;
        raw = Math.max(raw, Math.min(1, floor));
      }
      // Floored so a block never shrinks to nothing, nor below the size it was already seen at.
      const next = Math.max(0.4, Math.min(1, minScale), Math.floor(raw * 1000) / 1000);
      const spill = fitHeight && Number.isFinite(availH) && needH * next > availH + 1;
      setFit((p) => settle(p, { k: next, needH, legibleMin: legible, spills: spill }));
    };

    measure();
    const stopHost = observeResize(h, measure);
    // A height fit answers to the BOX: the Study caps its front card from a measured stage, the
    // Lens sheet from the window, and neither moves the host's own width when it changes — so the
    // box is watched as well, or a card fitted as scenery is never refitted once it comes forward.
    const box = fitHeight ? boundedAncestor(h) : null;
    const stopBox = box ? observeResize(box, measure) : undefined;
    // A percentage cap moves with its room, and a sheet hugging its card does not resize when the
    // window grows — so the room is watched too, or a card shrunk once never grows back.
    const room = box ? capOf(box)?.room : null;
    const stopRoom = room ? observeResize(room, measure) : undefined;
    return () => {
      dead = true;
      stopHost();
      stopBox?.();
      stopRoom?.();
    };
  }, [children, fitHeight, readingPx, minScale, still]);

  const scaled = k !== 1;
  return (
    <div
      ref={host}
      className={'fit-box' + (className ? ' ' + className : '')}
      // content-visibility lets the browser skip a scrolled-away block entirely; the size
      // hint keeps the scrollbar honest before the block has been laid out once.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}
    >
      <div
        ref={inner}
        style={
          scaled
            ? {
                transformOrigin: 'top left',
                transform: `scale(${k})`,
                // Reclaim the empty space the scale leaves (or claim what a grown block now
                // paints): the visual box is k× tall/wide, so move the following layout by the
                // difference — in px off the measured height when it is known, else as the
                // share of the width the old fit used.
                width: `${100 / k}%`,
                marginBottom: fit.needH
                  ? `${-(fit.needH * (1 - k)).toFixed(1)}px`
                  : `calc(${k - 1} * 100%)`,
                ...(maxAspect
                  ? { maxHeight: `calc(${maxAspect} * 100cqw)`, overflow: 'hidden' }
                  : {}),
              }
            : undefined
        }
      >
        {governs ? <Governed.Provider value>{children}</Governed.Provider> : children}
      </div>
    </div>
  );
}

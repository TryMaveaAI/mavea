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
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { observeResize } from './sharedResize';

const CLIP = new Set(['hidden', 'clip', 'auto', 'scroll']);

/** Below this many RENDERED px, type is being squinted at rather than read — the repo's floor,
 *  the one audit:ui and audit:surfaces enforce. A fit never scales a block's smallest type
 *  under it; past that point the host scrolls the remainder rather than paint the unreadable. */
const LEGIBLE_FLOOR_PX = 9;

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
  className?: string;
}

/**
 * Wrap a block whose intrinsic size can exceed a narrow card. FitBox keeps it at scale 1
 * whenever it fits, and downscales it to the card width when it doesn't — measured before
 * paint, re-measured on resize via the shared observer.
 */
export function FitBox({ children, maxAspect, fitHeight = false, className }: FitBoxProps) {
  const host = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // scale only — height collapses to the scaled content height so the card never reserves
  // empty space below a shrunk block. The natural height rides along so the reclaim below is
  // exact rather than a share of the width.
  const [fit, setFit] = useState({ k: 1, needH: 0 });
  const k = fit.k;

  useLayoutEffect(() => {
    const h = host.current;
    const i = inner.current;
    if (!h || !i) return;

    const measure = (): void => {
      const availW = h.clientWidth;
      if (!availW) return;

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

      // Read phase: measure with clipping neutralized, no writes in between. The smallest type
      // rides along in the same walk: it is what the legibility floor is measured against.
      let needW = i.scrollWidth;
      const needH = i.scrollHeight;
      let minFont = Infinity;
      for (const el of all) {
        if (el.scrollWidth > needW) needW = el.scrollWidth;
        if (fitHeight && el.childElementCount === 0 && (el.textContent ?? '').trim().length > 1) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs > 0 && fs < minFont) minFont = fs;
        }
      }
      // What one CSS px of this box paints at, after every ancestor's own scale (the Study's
      // desk, a dimmed card): the floor is a promise about the retina, not the stylesheet.
      const rendered = h.offsetWidth ? h.getBoundingClientRect().width / h.offsetWidth : 1;
      let availH = Infinity;
      if (fitHeight) {
        const box = boundedAncestor(h);
        if (box) {
          const bs = getComputedStyle(box);
          const above =
            h.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
          availH = box.clientHeight - above / (rendered || 1) - parseFloat(bs.paddingBottom || '0');
        }
      }

      // Write phase: restore.
      for (const r of restore) {
        r.el.style.overflow = r.o;
        r.el.style.webkitLineClamp = r.c;
      }
      i.style.transform = prevT;

      // Early-out: already fits both ways. Stay at 1 — no transform, no cost. (1px tolerance
      // absorbs sub-pixel rounding so a block that exactly fits doesn't flutter.)
      const fitsW = !needW || needW <= availW + 1;
      const fitsH = !fitHeight || !needH || !Number.isFinite(availH) || needH <= availH + 1;
      if (fitsW && fitsH) {
        setFit((p) => (p.k === 1 ? p : { k: 1, needH: 0 }));
        return;
      }
      const rawW = fitsW ? 1 : availW / needW;
      const rawH = fitsH ? 1 : availH / needH;
      let raw = Math.min(rawW, rawH);
      // The legibility floor: the smallest type in the block, as it will actually paint, stays
      // at or above the floor. A width fit keeps its old hard stop; a height fit that cannot
      // get there legibly stops at the floor and leaves the rest to the host's scroll.
      if (fitHeight && Number.isFinite(minFont)) {
        const floor = LEGIBLE_FLOOR_PX / (minFont * (rendered || 1));
        raw = Math.max(raw, Math.min(1, floor));
      }
      const next = Math.max(0.4, Math.floor(raw * 1000) / 1000); // floor so we never shrink to nothing
      setFit((p) => (Math.abs(p.k - next) > 0.002 ? { k: next, needH } : p));
    };

    measure();
    const stopHost = observeResize(h, measure);
    // A height fit answers to the BOX: the Study caps its front card from a measured stage, the
    // Lens sheet from the window, and neither moves the host's own width when it changes — so the
    // box is watched as well, or a card fitted as scenery is never refitted once it comes forward.
    const box = fitHeight ? boundedAncestor(h) : null;
    const stopBox = box ? observeResize(box, measure) : undefined;
    return () => {
      stopHost();
      stopBox?.();
    };
  }, [children, fitHeight]);

  const scaled = k < 1;
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
                // Reclaim the empty space the scale leaves: the visual box is k× tall/wide,
                // so pull the following layout up by the freed amount — in px off the measured
                // height when it is known, else as the share of the width the old fit used.
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
        {children}
      </div>
    </div>
  );
}

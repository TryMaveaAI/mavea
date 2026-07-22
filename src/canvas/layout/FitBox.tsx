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

export interface FitBoxProps {
  children: ReactNode;
  /** Also bound the scaled height to this many times the natural card width (so an
   *  extremely tall block can't make a card a mile high). Omit to fit width only. */
  maxAspect?: number;
  className?: string;
}

/**
 * Wrap a block whose intrinsic size can exceed a narrow card. FitBox keeps it at scale 1
 * whenever it fits, and downscales it to the card width when it doesn't — measured before
 * paint, re-measured on resize via the shared observer.
 */
export function FitBox({ children, maxAspect, className }: FitBoxProps) {
  const host = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // scale only — height collapses to the scaled content height so the card never reserves
  // empty space below a shrunk block.
  const [k, setK] = useState(1);

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

      // Read phase: measure with clipping neutralized, no writes in between.
      let needW = i.scrollWidth;
      for (const el of all) {
        if (el.scrollWidth > needW) needW = el.scrollWidth;
      }

      // Write phase: restore.
      for (const r of restore) {
        r.el.style.overflow = r.o;
        r.el.style.webkitLineClamp = r.c;
      }
      i.style.transform = prevT;

      // Early-out: already fits. Stay at 1 — no transform, no cost. (1px tolerance absorbs
      // sub-pixel rounding so a block that exactly fits doesn't flutter.)
      if (!needW || needW <= availW + 1) {
        setK((p) => (p === 1 ? p : 1));
        return;
      }
      const raw = availW / needW;
      const next = Math.max(0.4, Math.floor(raw * 1000) / 1000); // floor so we never shrink to nothing
      setK((p) => (Math.abs(p - next) > 0.002 ? next : p));
    };

    measure();
    return observeResize(h, measure);
  }, [children]);

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
                // so pull the following layout up/left by the freed amount.
                width: `${100 / k}%`,
                marginBottom: `calc(${k - 1} * 100%)`,
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

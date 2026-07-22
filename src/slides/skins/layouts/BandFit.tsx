// The measured backstop behind the deterministic tier ladders: after layout, if a slide's actual
// content is taller than the band it has to live in, scale the whole block down uniformly (never
// up) so it's complete-but-smaller rather than clipped. The ladders + clamps in ./fit already cover
// the overwhelming majority of content; this exists for what they can't predict from length alone —
// several sibling blocks stacking taller together than any one of them looks on its own, or a skin
// whose real band (see `bandFor`) is tighter than assumed.
//
// Unlike the reel's FitScale, a slide is a fixed 1920×1080 design canvas that only ever changes with
// props (a new slide, a new skin) — nothing here continuously resizes, so this measures once with
// `useLayoutEffect` and deliberately has no ResizeObserver.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

const CLIP = new Set(['hidden', 'clip', 'auto', 'scroll']);
/** Nodes whose clipping is theirs to manage — they and their contents are left exactly as found. */
const EXEMPT = '[aria-hidden="true"], .figure-embed, [data-hard-clip]';
const MIN_SCALE = 0.85;

export interface BandFitProps {
  /** The slide this content belongs to — combined with `skinId` as the sole effect dependency, so
   *  a new slide or a skin switch re-measures cleanly instead of carrying over the last factor. */
  slideId: string;
  skinId: string;
  /** Style for the OUTER node that receives the real available height (a `flex: 1 1 auto` content
   *  column, or `alignSelf: stretch` beside a fixed-size sibling) — merged with the fixed
   *  `overflow: hidden` every hookup needs so a downscaled child can't peek past its band. */
  outerStyle?: CSSProperties;
  /** The wrapped content's own layout (`justifyContent`, `gap`, …) — applied to the measured,
   *  scaled inner node so the authored composition is unchanged when no scaling is needed. */
  style?: CSSProperties;
  children: ReactNode;
}

/** Scale-to-fit wrapper for one slide's content band. Renders at scale 1 until a real overflow is
 *  measured, then applies one bounded uniform `scale()` (clamped to `MIN_SCALE`) with a matching
 *  width compensation so the scaled box still lays out at full logical width — the same technique
 *  `clip/reel/FitScale` and `canvas/embed/fitScale` use, simplified to a single settled pass. */
export function BandFit({ slideId, skinId, outerStyle, style, children }: BandFitProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);

  useLayoutEffect(() => {
    const w = wrap.current;
    const i = inner.current;
    if (!w || !i) return;
    const availH = w.clientHeight;
    // jsdom, a detached node, or a hidden gallery tab reports 0 — leave content at its deterministic
    // size rather than measuring a meaningless box (the same guard `useAutoFit` applies).
    if (availH <= 0) {
      setK(1);
      return;
    }

    // A stale scale/width/transform from the PREVIOUS slide is still in the DOM at this point (React
    // commits props before layout effects run) — neutralize the width compensation AND the scale
    // before measuring, so neither skews this slide's line-wrap nor the child rects read below.
    const prevWidth = i.style.width;
    const prevTransform = i.style.transform;
    i.style.width = '100%';
    i.style.transform = 'none';

    // Reveal any nested clipping box so scrollHeight reports its TRUE content extent — except an
    // intentional line-clamp/ellipsis/nowrap (its clipped box IS its designed final size),
    // aria-hidden/figure-embed nodes (which manage their own fit), and a hard-clip box (a
    // deterministic, tier-sized bound where a browser measurement quirk makes scrollHeight
    // unreliable) — the same exemptions the overflow-audit gate uses.
    //
    // Mark the exempt subtrees up front rather than asking each element to walk its own ancestor
    // chain: a slide's blocks nest deep, so every element under an exempt root re-walks the same
    // spine to rediscover it. A band that itself sits inside an exempt region (Present parks the
    // outgoing slide under aria-hidden while it crossfades) exempts everything in it, and skips
    // the scan outright.
    //
    // Styles are then read for the whole tree before any are written: a write landing between two
    // getComputedStyle calls forces the browser to recompute layout for each element in between,
    // which this can't afford when it re-runs on every step of a live presentation. Same
    // conditions, same values, same restore as one interleaved pass — only the ordering differs
    // (`canvas/layout/FitBox` measures in these phases for the same reason).
    const reveal: HTMLElement[] = [];
    if (!i.closest(EXEMPT)) {
      const exempt = new Set<Element>();
      for (const root of i.querySelectorAll(EXEMPT)) {
        exempt.add(root);
        for (const inside of root.querySelectorAll('*')) exempt.add(inside);
      }
      for (const el of i.querySelectorAll<HTMLElement>('*')) {
        if (exempt.has(el)) continue;
        const cs = getComputedStyle(el);
        const clamp = cs.getPropertyValue('-webkit-line-clamp');
        if (clamp !== '' && clamp !== 'none') continue;
        if (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') continue;
        if (!CLIP.has(cs.overflowY)) continue;
        reveal.push(el);
      }
    }

    const restore: { el: HTMLElement; overflow: string; maxHeight: string }[] = [];
    for (const el of reveal) {
      restore.push({ el, overflow: el.style.overflow, maxHeight: el.style.maxHeight });
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
    }

    // scrollHeight measures content from the band's TOP edge downward, so it is blind to content
    // pushed ABOVE the top by justify-content: center / flex-end (Cover and Closing anchor their
    // title block to the bottom; framed layouts center a growth region). A too-tall stack then
    // overflows UPWARD — invisible to scrollHeight — and lands on the header chrome above the band.
    // Take the true two-edge extent from the union of the child rects (measured at scale 1 above)
    // and never trust less than scrollHeight, so both directions of overflow are caught.
    const bandTop = i.getBoundingClientRect().top;
    let unionTop = Infinity;
    let unionBottom = -Infinity;
    for (const child of i.children) {
      const r = child.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue; // skip collapsed/empty nodes
      unionTop = Math.min(unionTop, r.top);
      unionBottom = Math.max(unionBottom, r.bottom);
    }
    // Extent below the band's top edge (downward, like scrollHeight) plus any spill above it
    // (the amount the topmost child rides past the top edge).
    const rectExtent =
      unionBottom > unionTop ? unionBottom - Math.min(unionTop, bandTop) : i.scrollHeight;
    const needed = Math.max(i.scrollHeight, rectExtent);

    for (const r of restore) {
      r.el.style.overflow = r.overflow;
      r.el.style.maxHeight = r.maxHeight;
    }
    i.style.width = prevWidth;
    i.style.transform = prevTransform;

    const raw = needed > 0 ? availH / needed : 1;
    const next = Number.isFinite(raw)
      ? Math.round(Math.min(1, Math.max(MIN_SCALE, raw)) * 1000) / 1000
      : 1;
    setK((prev) => (prev === next ? prev : next));
  }, [slideId, skinId]);

  return (
    <div ref={wrap} style={{ position: 'relative', ...outerStyle, overflow: 'hidden' }}>
      <div
        ref={inner}
        {...(k !== 1 ? { 'data-bandfit': k } : {})}
        style={{
          ...style,
          width: k !== 1 ? `${100 / k}%` : '100%',
          transform: k !== 1 ? `scale(${k})` : undefined,
          // Width compensation makes the logical box wider by exactly 1/k. Scaling that box around
          // its centre also translates it right by half the added width, clipping the right edge.
          // Anchor the transform to the content band's left edge: (100/k)% × k paints at 100%
          // without translation, so both sides remain inside the frame.
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

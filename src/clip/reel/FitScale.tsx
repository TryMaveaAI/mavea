// The reel's guarantee that EVERY finish fits the frame — in every format — for free, with no extra AI
// call. A finish is drawn at its natural size, measured, and uniformly scaled down (never up) so it
// can't overflow the stage band or collide with the chrome. Length budgets keep most finishes at scale
// 1; this is the deterministic safety net for the long tail (and any future finish), applied before
// paint so the offscreen rasterizer captures the fitted layout.
//
// Three things make the measurement honest:
//  • It re-measures the instant the board's `--ru`/`--rw` design units actually change — a version
//    counter `ReelPlayer` bumps whenever it (re)computes them (mount, an aspect switch, a real resize),
//    read here via `ReelUnitsVersion`. Those units drive every finish's typography and are set by the
//    player, a parent, so a timer-based guess at "has it landed yet" is exactly the kind of race this
//    replaces. It also re-measures once real web fonts land (`document.fonts.ready`, swapped-in glyphs
//    are a different width than the fallback) and whenever the INNER content resizes on its own with no
//    other signal — a finish like documentMarkup growing after an image loads.
//  • It momentarily un-clips the finish's own `overflow:hidden` while measuring, so an accidentally
//    clipped child reports its TRUE size instead of its clipped box. Two kinds of clipping are
//    intentional and stay clipped: a scrolling marquee/ticker (opts out with `data-reel-marquee`)
//    and `-webkit-line-clamp` — a clamp ellipsizes visibly by design (the fitText tiers pair every
//    clamp with a length-picked font size), so its clamped box IS its true size. Un-clipping a clamp
//    would measure the full un-clamped text, shrink the whole finish to fit text that never paints,
//    and strand two tiny clamped lines in a huge band.
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ReelUnitsVersion } from './reelUnits';

const CLIP = new Set(['hidden', 'clip', 'auto', 'scroll']);

export function FitScale({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // Scale + the exact px offset that centers the SCALED content in the band. We center deterministically
  // (not with CSS grid/flex) because the browser START-aligns a box that's taller than its container
  // rather than centering it — which would push scaled content out of the band.
  const [fit, setFit] = useState({ k: 1, x: 0, y: 0 });
  const unitsVersion = useContext(ReelUnitsVersion);

  useLayoutEffect(() => {
    const w = wrap.current;
    const i = inner.current;
    if (!w || !i) return;

    const measure = (): void => {
      const availH = w.clientHeight;
      const availW = w.clientWidth;
      if (!availH || !availW) return;

      // Neutralize our own transform so we read natural sizes, and reveal any finish-internal clipping
      // so the true content extent is visible to scrollWidth/Height (which are transform-stable, unlike
      // getBoundingClientRect — important while finishes animate).
      const prevT = i.style.transform;
      i.style.transform = 'none';
      i.style.left = '0';
      i.style.top = '0';
      const restore: { el: HTMLElement; o: string; m: string }[] = [];
      const all = [...i.querySelectorAll<HTMLElement>('*')];

      // Leave intentional marquees clipped: un-clipping a mask would let its (deliberately huge)
      // scroll track inflate the measurement. Both passes below skip the track, anything inside it,
      // and any mask wrapping one — resolved once here, because asking each element whether it
      // contains a marquee re-walks its whole subtree, once per ancestor, on every measured frame.
      const marqueed = new Set<Element>();
      for (const track of i.querySelectorAll('[data-reel-marquee]')) {
        for (let p: Element | null = track; p && p !== i; p = p.parentElement) marqueed.add(p);
        for (const inside of track.querySelectorAll('*')) marqueed.add(inside);
      }

      // Line-clamped text keeps reporting its full un-clamped extent via scrollWidth/Height, so the
      // clamped elements (and everything inside them) must be excluded from THIS scrollWidth/Height
      // scan — a clamped element's true size is its clientWidth/clientHeight, checked separately below.
      const clamped = new Set<HTMLElement>();
      const unclip: HTMLElement[] = [];
      for (const el of all) {
        if (marqueed.has(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.webkitLineClamp !== 'none') {
          clamped.add(el);
          continue; // an intentional ellipsis — its clamped box is its true size
        }
        if (!CLIP.has(cs.overflowX) && !CLIP.has(cs.overflowY)) continue;
        unclip.push(el);
      }
      // Write only once every style has been read: a style write between two reads invalidates the
      // next getComputedStyle and forces a recalc per element (the hot spot FitBox was fixed for).
      for (const el of unclip) {
        restore.push({ el, o: el.style.overflow, m: el.style.maxHeight });
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
      }
      const insideClamp = (el: HTMLElement): boolean => {
        for (let p: HTMLElement | null = el; p && p !== i; p = p.parentElement)
          if (clamped.has(p)) return true;
        return false;
      };

      // Offset of an element's layout box inside the measured root, summed up the offsetParent
      // chain. Offsets are transform-free, so this stays honest while entrance animations play —
      // the same reason the scan below trusts scrollWidth over getBoundingClientRect.
      const layoutOff = (el: HTMLElement): { x: number; y: number } => {
        let x = 0;
        let y = 0;
        for (
          let p: HTMLElement | null = el;
          p && p !== i && i.contains(p);
          p = p.offsetParent as HTMLElement | null
        ) {
          x += p.offsetLeft;
          y += p.offsetTop;
        }
        return { x, y };
      };

      let needW = i.scrollWidth;
      let needH = i.scrollHeight;
      for (const el of all) {
        // Skip the marquee track AND the clipped band that WRAPS it (same guard as the un-clip pass
        // above): the band's overflow:hidden hides an intentionally-oversized scrolling track, so its
        // scrollWidth is the full repeated track — counting it would over-shrink the whole finish to a
        // tiny sliver (the marquee bug). The band's real on-screen size is already in i.scrollWidth.
        if (marqueed.has(el)) continue;
        if (insideClamp(el)) continue;
        if (el.scrollWidth > needW) needW = el.scrollWidth;
        if (el.scrollHeight > needH) needH = el.scrollHeight;
        // A bare scrollWidth understates an element that overflows from an offset deep in the tree
        // (a nowrap value inside a centered card): its true extent is layout position + overflow.
        if (el.scrollWidth > el.clientWidth + 1) {
          const o = layoutOff(el);
          if (o.x + el.scrollWidth > needW) needW = o.x + el.scrollWidth;
        }
        if (el.scrollHeight > el.clientHeight + 1) {
          const o = layoutOff(el);
          if (o.y + el.scrollHeight > needH) needH = o.y + el.scrollHeight;
        }
      }
      // The "already counted through their parents" assumption above doesn't always hold: a block
      // ancestor's own auto-height can under-count a `-webkit-line-clamp` descendant's true rendered
      // extent (a longstanding Chromium quirk — the clamped box lays out and paints correctly, the
      // ancestor's own scrollHeight just doesn't reliably roll it up). Cross-check every clamped
      // element directly against its real, already-clamped clientHeight/clientWidth — the one number
      // that's always trustworthy for it — so a card that stacks a clamped heading over a clamped
      // body still gets scaled to fit instead of the second block silently outrunning the first pass.
      for (const el of clamped) {
        const o = layoutOff(el);
        if (o.x + el.clientWidth > needW) needW = o.x + el.clientWidth;
        if (o.y + el.clientHeight > needH) needH = o.y + el.clientHeight;
      }

      for (const r of restore) {
        r.el.style.overflow = r.o;
        r.el.style.maxHeight = r.m;
      }
      i.style.transform = prevT;

      if (!needH || !needW) return;
      // Uniform downscale only (never up, never anisotropic — no squish), with a little breathing room
      // so content never sits edge-to-edge (which reads as "cut off").
      const raw = Math.min(1, (availH * 0.95) / needH, (availW * 0.92) / needW);
      const k = Number.isFinite(raw) && raw > 0 ? Math.floor(raw * 1000) / 1000 : 1;
      // Scale against the complete safety extent above, but center the finish's VISIBLE root box.
      // `needW` deliberately includes descendant overflow so long content still scales down; it can
      // also include paint that is not part of the perceived silhouette (a blinking caret, clipped
      // ellipsis text, a decorative sheen, or an SVG label). Centering that invisible overflow box
      // shifted the actual card/board left across many finishes. offsetWidth is transform-stable, so
      // entry animations cannot make this alignment jump while the reel is being measured.
      const visualRoot = i.firstElementChild as HTMLElement | null;
      const visualW = visualRoot?.offsetWidth || needW;
      const visualX = visualRoot ? layoutOff(visualRoot).x : 0;
      const x = Math.max(0, (availW - visualW * k) / 2 - visualX * k);
      const y = Math.max(0, (availH - needH * k) / 2);
      setFit((p) =>
        Math.abs(p.k - k) > 0.002 || Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5
          ? { k, x, y }
          : p,
      );
    };

    measure();
    // `unitsVersion` in the dependency array below re-runs this whole effect — including this initial
    // `measure()` — the instant ReelPlayer bumps it, so a real design-unit change (mount, an aspect
    // switch, a resize) is caught exactly when it lands rather than guessed at across a few frames.
    let cancelled = false;
    let fontsRaf = 0;
    // Web fonts can still be swapping in when the pass above runs — a fallback system font measures a
    // different width than the real one — so measure again once real glyphs land (mirrors the
    // fonts.ready + rAF pattern SlidesLab uses for the same reason).
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) fontsRaf = requestAnimationFrame(measure);
      });
    }
    // One deferred pass after mount, belt-and-suspenders for any layout settling the signals above
    // don't otherwise cover.
    const deferredRaf = requestAnimationFrame(measure);
    // Re-fit when the band resizes (tiny preview vs 1080px export) OR the content resizes on its own
    // with no other signal (documentMarkup after an image loads). rAF-coalesced to one pass.
    let scheduleRaf = 0;
    const schedule = (): void => {
      cancelAnimationFrame(scheduleRaf);
      scheduleRaf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(w);
    ro.observe(i);
    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(scheduleRaf);
      cancelAnimationFrame(deferredRaf);
      cancelAnimationFrame(fontsRaf);
    };
  }, [children, unitsVersion]);

  return (
    // Fill the stage band absolutely so the wrapper has a DEFINITE size to fit into (a content-sized
    // wrapper would make available === needed and never scale).
    <div ref={wrap} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        ref={inner}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: 'top left',
          transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.k})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

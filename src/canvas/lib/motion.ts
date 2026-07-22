// motion.ts — the two JS-driven halves of the motion primitives (see motion.css for the
// CSS-only half). A count-up needs a value driving a RAF loop; an SVG draw-on needs the
// element's real path length before it can animate, and neither of those is expressible in
// pure CSS. Counter.tsx had the one correct implementation of the count-up in the codebase
// (bounded RAF, easeOutCubic, an explicit reduced-motion snap, RAF cleanup on unmount) — this
// lifts that logic out so every block gets it right instead of only the one that happened to
// get written carefully. Both hooks do their own `prefers-reduced-motion` check internally so
// a consumer can't forget it the way every other count-up/draw-on in the app would have to
// remember it by hand.

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

function reducedMotionPreferred(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface CountUpOptions {
  /** Animation length in ms. Default matches Counter.tsx's original 1100ms. */
  duration?: number;
  /** Delay before the count starts, in ms (e.g. to follow a card's own `--delay`). */
  delay?: number;
  /** Fraction digits when no `format` is given. */
  decimals?: number;
  /** Overrides the default `toLocaleString` formatting (e.g. to render a currency or unit). */
  format?: (n: number) => string;
}

/**
 * Count from 0 up to `value` over `opts.duration`, easing out, and return the formatted
 * current figure as a string. Snaps straight to the final value under reduced motion instead
 * of animating. Re-triggers cleanly whenever `value` (or `duration`/`delay`) changes — the RAF
 * loop from the previous run is always cancelled first, so nothing races or leaks.
 */
export function useCountUp(value: number, opts: CountUpOptions = {}): string {
  const { duration = 1100, delay = 0, decimals = 0, format } = opts;
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  // Read through a ref so a `format` closure that's a fresh function identity every render
  // (a very common way to pass it) doesn't restart the RAF loop — only the numbers that
  // actually change what's being counted (value/duration/delay) should do that.
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    if (reducedMotionPreferred()) {
      setShown(value);
      return;
    }
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, delay]);

  const fmt = formatRef.current;
  return fmt
    ? fmt(shown)
    : shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

export interface PathDrawOptions {
  /** Draw duration in ms; falls back to the `--m-cinematic` token via CSS when omitted. */
  duration?: number;
  /** Delay before the draw starts, in ms. */
  delay?: number;
}

/**
 * Draw an SVG `<path>`/`<line>` on with `mavea-draw` (see motion.css). Measures the element's
 * real length via `getTotalLength()` once on mount — a cheap SVG API read, not a layout-thrash
 * loop — publishes it as `--path-len`, and toggles the `.m-draw-path` class that plays the
 * animation. Under reduced motion the class is never added, so the path renders fully drawn
 * (its ordinary solid stroke) with no animation and nothing to clean up. Every custom property
 * and the class itself are removed on unmount.
 */
export function usePathDraw(
  ref: RefObject<SVGPathElement | SVGLineElement | null>,
  opts: PathDrawOptions = {},
): void {
  const { duration, delay } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotionPreferred()) return; // already fully drawn by default — nothing to do

    // Real SVG geometry elements always implement this; guard anyway so an unusual host
    // environment degrades to "no animation" instead of throwing.
    if (typeof el.getTotalLength !== 'function') return;
    const len = el.getTotalLength();

    el.style.setProperty('--path-len', `${len}px`);
    if (duration !== undefined) el.style.setProperty('--draw-duration', `${duration}ms`);
    if (delay !== undefined) el.style.setProperty('--delay', `${delay}ms`);
    el.classList.add('m-draw-path');

    return () => {
      el.classList.remove('m-draw-path');
      el.style.removeProperty('--path-len');
      el.style.removeProperty('--draw-duration');
      el.style.removeProperty('--delay');
    };
  }, [ref, duration, delay]);
}

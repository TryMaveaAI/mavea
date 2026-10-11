import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** The element's content box, read from layout: unlike `getBoundingClientRect` it ignores a
 *  transform (a card's `.reveal` entrance, a magnified Lens), and it is the same box a
 *  ResizeObserver's `contentRect` reports, so the first reading and every later one agree. */
function contentSize(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const px = (v: string) => Number.parseFloat(v) || 0;
  return {
    w: Math.max(0, el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)),
    h: Math.max(0, el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom)),
  };
}

/**
 * The rendered content size of the element `ref` is attached to, kept current as the card is
 * tiled or resized. 0 by 0 until measured (jsdom, SSR), so callers keep a fallback.
 *
 * This is how a drawing stays ONE user unit per pixel: a fixed viewBox stretched to a wide card
 * scales its type along with its geometry, which turned a season calendar's 10px row names into
 * 40px display type cut off at the edge, and a connector stretched across a percentage viewBox
 * cannot stop at an HTML node's rim. The first read is synchronous so a measured layout is what
 * paints first; the observer is torn down on unmount.
 */
export function useBoxSize<T extends HTMLElement>(): [
  RefObject<T | null>,
  { w: number; h: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = ({ w, h }: { w: number; h: number }) =>
      setSize((prev) => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    settle(contentSize(el));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) settle({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** `useBoxSize` for a drawing that only lays out across its width. */
export function useHostWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const [ref, size] = useBoxSize<T>();
  return [ref, size.w];
}

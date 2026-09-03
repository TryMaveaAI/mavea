import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll: observe an element and report once it enters the viewport.
 *
 * Returns `[ref, inView]` — attach `ref` to the element and gate an entrance class
 * on `inView`. Defaults to fire-once (the reveal is a one-way door, so we disconnect
 * after the first intersection and never thrash on scroll-back). Pass `once: false`
 * to track visibility both ways.
 *
 * Where `IntersectionObserver` is absent (jsdom in tests, very old browsers) the element
 * is revealed immediately, so content is never left hidden behind a capability check.
 * The observer is disconnected on unmount, so it can't fire on a torn-down tree.
 *
 * Content that's already on screen at mount (an above-the-fold hero, say) was never
 * "scrolled to" — it has nothing to reveal. `IntersectionObserver`'s first callback is
 * always asynchronous, so relying on it alone means even already-visible content spends
 * its first instant hidden/offset (mid fade-and-rise) before the observer catches up — and a
 * load-bearing control in that content (a CTA, say) sits there physically translating under
 * whatever the user clicks in that window. A synchronous layout read in `useLayoutEffect`
 * (flushed before the browser's first paint) catches this case immediately, so already-visible
 * content renders in its resting state from frame one; the observer still runs as normal for
 * anything genuinely below the fold.
 *
 * Fire-once observation alone is not enough to guarantee content ever appears, because the
 * observer only reports at rendered frames. A scroll that lands in a single frame (scrollbar
 * drag, the End key, `scrollTo` with `behavior: 'instant'`) renders nothing between departure
 * and destination, and a scroll performed while the tab is hidden or the window occluded
 * renders no frames at all — either way an element can sit squarely in the viewport with no
 * intersection ever delivered, and fire-once semantics would keep it invisible forever. So in
 * `once` mode the observer is the path that *times* the entrance, while a direct rect check on
 * scroll-settle, on tab-reveal, and once shortly after mount guarantees *arrival*. That check
 * applies `threshold` too, so the guarantee never fires an entrance the observer would have held.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: {
    rootMargin?: string;
    threshold?: number;
    once?: boolean;
    /** Use when the caller already knows the element is above the fold (for example, a hero). */
    initiallyVisible?: boolean;
    /** Skip the synchronous geometry read when async observation is sufficient. */
    measureInitial?: boolean;
    /**
     * Observe against the nearest scrolling ancestor instead of the window viewport. Needed
     * when the page scrolls in an inner container (the flagship stage): with the implicit
     * root, `rootMargin` expands the *window's* rect while targets are still clipped by the
     * inner scroller first, so a pre-load margin silently never applies.
     */
    nearestScrollRoot?: boolean;
  } = {},
): [React.RefObject<T | null>, boolean] {
  const {
    rootMargin = '0px 0px -12% 0px',
    threshold = 0.12,
    once = true,
    initiallyVisible = false,
    measureInitial = true,
    nearestScrollRoot = false,
  } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(initiallyVisible);
  const revealed = useRef(initiallyVisible);

  useLayoutEffect(() => {
    if (initiallyVisible || !measureInitial) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      revealed.current = true;
      setInView(true);
    }
  }, [initiallyVisible, measureInitial]);

  useEffect(() => {
    const el = ref.current;
    if (!el || (once && revealed.current)) return;
    if (typeof IntersectionObserver === 'undefined') {
      revealed.current = true;
      setInView(true);
      return;
    }

    const root = nearestScrollRoot ? scrollParent(el) : null;
    const cleanups: Array<() => void> = [];
    const cleanup = () => {
      for (const fn of cleanups) fn();
      cleanups.length = 0;
    };
    const reveal = () => {
      if (revealed.current) return;
      revealed.current = true;
      setInView(true);
      if (once) cleanup();
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (once) reveal();
            else setInView(true);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { root, rootMargin, threshold },
    );
    io.observe(el);
    cleanups.push(() => io.disconnect());

    if (once) {
      // The arrival guarantee. Only ever reveals — never hides — so the one-way-door
      // semantics and the entrance animation are unchanged; every listener tears down the
      // moment the reveal fires. The leading number of the margin is enough here: fallback
      // margins are symmetric where it matters (the deferred sections), and erring eager
      // only means a slightly earlier reveal.
      const pad = Number.parseInt(rootMargin, 10) || 0;
      const near = () => {
        const rect = el.getBoundingClientRect();
        const bounds = root ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const top = bounds.top - pad;
        const bottom = bounds.bottom + pad;
        const shown = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
        // The fallback holds the caller's threshold, not bare overlap. A one-shot choreography
        // asks for one (SeeDontRead wants a third of its comparison on screen) precisely so it
        // can't play to nobody, and a scroll that settles with a 20px sliver showing was
        // otherwise enough to burn it. Measured against the ROOT as well as the element, so a
        // section taller than the window — which can never reach 12% of itself — still arrives.
        const need = threshold * Math.min(rect.height, bottom - top);
        if (shown > 0 && shown >= need) reveal();
      };
      const scroller: EventTarget = root ?? window;
      if ('onscrollend' in window) {
        scroller.addEventListener('scrollend', near, { passive: true });
        cleanups.push(() => scroller.removeEventListener('scrollend', near));
      } else {
        // Safari < 18.4 has no scrollend: settle on a debounced scroll instead.
        let timer = 0;
        const onScroll = () => {
          clearTimeout(timer);
          timer = window.setTimeout(near, 150);
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => {
          clearTimeout(timer);
          scroller.removeEventListener('scroll', onScroll);
        });
      }
      const onVisible = () => {
        if (document.visibilityState === 'visible') near();
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
      // Hash landings and restored scroll positions arrive with no scroll event at all.
      const settle = window.setTimeout(near, 200);
      cleanups.push(() => clearTimeout(settle));
    }

    return cleanup;
  }, [rootMargin, threshold, once, nearestScrollRoot]);

  return [ref, inView];
}

/**
 * Freeze a section's ambient CSS loops while it is scrolled out of view. The section's infinite
 * animations declare `animation-play-state: var(--ambient-play, running)`; this sets the inline
 * pause on the section element only once it has left the viewport ENTIRELY (threshold 0, no
 * margin), so nothing visible ever changes — and REMOVES the property when it returns, so the
 * document-level drivers (the hidden-tab pause in lib/pageVisibility.ts, perf-lite's permanent
 * one) keep flowing through from the root. Attach the returned ref to the section that owns the
 * loops (e.g. the flagship hero). Observer and inline property are both cleaned up on unmount.
 */
export function useAmbientPause<T extends HTMLElement = HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    // No observer (jsdom, very old browsers) → never pause: the loops just keep running, which
    // is exactly today's behavior.
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) el.style.removeProperty('--ambient-play');
        else el.style.setProperty('--ambient-play', 'paused');
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      el.style.removeProperty('--ambient-play');
    };
  }, []);

  return ref;
}

/** Nearest ancestor that actually scrolls vertically; null for window-scrolled documents. */
function scrollParent(el: Element): Element | null {
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
}

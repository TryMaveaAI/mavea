// useElementRect — track a chrome element's on-screen rect by CSS selector, so the walkthrough can
// ring a real control (the mic, the pen, the Focus toggle…) that may mount/animate in after the
// chapter starts. Polls (cheap) plus resize/scroll listeners; returns null when the target isn't
// present, is hidden, or sits outside the viewport (so the caller never rings an empty patch of
// screen). A target below the fold — an answer's footer chips, a card's Ask pill — is scrolled
// into view first, the way a human guide would bring the thing into frame before pointing at it.
import { useEffect, useState } from 'react';

/** True when the rect is meaningfully on screen (over half visible both ways). */
function onScreen(r: DOMRect): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visX = Math.min(r.right, vw) - Math.max(r.left, 0);
  const visY = Math.min(r.bottom, vh) - Math.max(r.top, 0);
  return visX > r.width * 0.5 && visY > r.height * 0.5;
}

export function useElementRect(selector: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector || !active) {
      setRect(null);
      return;
    }
    let alive = true;
    let lastScrollAt = 0;
    // Re-render only on real movement — a fresh DOMRect every poll would re-render the overlay 4×/s.
    let last: DOMRect | null = null;
    const put = (r: DOMRect | null): void => {
      const same =
        r === last ||
        (r !== null &&
          last !== null &&
          Math.abs(r.top - last.top) < 0.5 &&
          Math.abs(r.left - last.left) < 0.5 &&
          Math.abs(r.width - last.width) < 0.5 &&
          Math.abs(r.height - last.height) < 0.5);
      if (same) return;
      last = r;
      setRect(r);
    };
    // A selector list ("a, b") lets a chapter name a couple of candidate anchors in PRIORITY
    // order (the real control first, a fallback second). Split rather than handing the whole
    // list to one querySelector call: a comma-list resolves by DOCUMENT position, not list
    // order, so whichever candidate happens to render earlier in the DOM would win regardless
    // of which one the chapter actually means as primary — e.g. a dismissible hint banner that
    // renders before the canvas would always beat the real per-card pill it exists to fall back
    // for. Tried independently so the first-LISTED candidate that's actually present, visible,
    // and sized wins.
    const candidates = selector
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const measure = (): void => {
      if (!alive) return;
      let el: HTMLElement | null = null;
      let measured: DOMRect | null = null;
      for (const c of candidates) {
        // A feature can render the same control in more than one responsive surface. Prefer the
        // copy that is actually on screen instead of blindly ringing the first DOM match.
        const hits = Array.from(document.querySelectorAll<HTMLElement>(c));
        const visible = hits
          .filter((hit) => !hit.checkVisibility || hit.checkVisibility({ checkOpacity: true }))
          .map((hit) => ({ hit, rect: hit.getBoundingClientRect() }))
          .filter(({ rect: r }) => r.width > 0 && r.height > 0);
        const best = visible.find(({ rect: r }) => onScreen(r)) ?? visible[0];
        if (best) {
          el = best.hit;
          measured = best.rect;
          break;
        }
      }
      if (!el || !measured) {
        put(null);
        return;
      }
      const r = measured;
      if (!onScreen(r)) {
        // Bring an off-screen target into frame (throttled — smooth scrolling takes a moment),
        // and hold the ring until it arrives so it never pulses over the viewport's edge.
        const now = Date.now();
        if (now - lastScrollAt > 1200) {
          lastScrollAt = now;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        put(null);
        return;
      }
      put(r);
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [selector, active]);

  return rect;
}

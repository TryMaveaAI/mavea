// useElementRect — track a chrome element's on-screen rect by CSS selector, so the walkthrough can
// ring a real control (the mic, the pen, the Focus toggle…) that may mount/animate in after the
// chapter starts. rAF-coalesced resize/scroll listeners plus a slow fallback poll; returns null when the target isn't
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

const CLIPS = /^(hidden|auto|scroll|clip)$/;

/** Intersect a target's rect with every ancestor that actually clips it, so a control that's
 * only partly visible inside its own scrolled panel (e.g. a settings section taller than the
 * modal body scrolling it) is never rung larger than what's actually on screen — the ring
 * would otherwise stretch down to the target's full, unscrolled content height. */
export function clampToClippingAncestors(rect: DOMRect, el: HTMLElement): DOMRect {
  let top = rect.top;
  let left = rect.left;
  let right = rect.right;
  let bottom = rect.bottom;
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipsY = CLIPS.test(style.overflowY);
    const clipsX = CLIPS.test(style.overflowX);
    if (!clipsY && !clipsX) continue;
    const ar = node.getBoundingClientRect();
    if (clipsY) {
      top = Math.max(top, ar.top);
      bottom = Math.min(bottom, ar.bottom);
    }
    if (clipsX) {
      left = Math.max(left, ar.left);
      right = Math.min(right, ar.right);
    }
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
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
          .map((hit) => {
            const raw = hit.getBoundingClientRect();
            return { hit, raw, rect: clampToClippingAncestors(raw, hit) };
          })
          // Sized by the RAW rect — a target scrolled fully out of its own clipped ancestor
          // still counts as a candidate (it just isn't on screen yet, see below), whereas a
          // genuinely display:none/collapsed element has zero raw size and is skipped outright.
          .filter(({ raw }) => raw.width > 0 && raw.height > 0);
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
    // Scroll/resize are the primary signal, coalesced to one measure per frame: `measure` walks
    // every clipping ancestor with getComputedStyle + getBoundingClientRect, and running that
    // synchronously inside each scroll event is a forced style+layout flush per event during
    // momentum scrolling. Passive + rAF means at most one measure per rendered frame, after the
    // scroll has been painted. The interval is only the fallback for movement that fires no event
    // at all — a target that mounts or animates in after the chapter starts.
    let rafId = 0;
    const schedule = (): void => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measure();
      });
    };
    const id = window.setInterval(measure, 750);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    return () => {
      alive = false;
      window.clearInterval(id);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [selector, active]);

  return rect;
}

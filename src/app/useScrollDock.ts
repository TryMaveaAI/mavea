// The home orb's scroll-dock animation. As you scroll the home, the big hero orb glides into the
// topbar brand slot (and grows back on scroll up): we drive --scroll-dock (0→1) from the home
// scroll container, and the idlehome positioner transform (CSS) interpolates to the measured brand
// position (--home-x/y). measureHome reads the brand-dot vs presence-layer rects to set those
// vars + --home-scale; it re-runs on resize and once the face docks. rAF-throttled so it stays
// buttery during a fast scroll.
//
// Returns the four DOM refs the App attaches in its JSX (app root, brand dot, presence layer, home
// scroll stage). Inputs: `inCorner` (canvas arrived + focus settled to corner → re-measure) and
// `onHome` (the home is live and file-less → run the scroll listener).
import { useCallback, useEffect, useRef } from 'react';

const DOCK_DISTANCE = 200; // px of scroll to fully dock

export interface ScrollDockRefs {
  appRef: React.RefObject<HTMLDivElement | null>;
  brandDotRef: React.RefObject<HTMLSpanElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  homeStageRef: React.RefObject<HTMLDivElement | null>;
}

export function useScrollDock(inCorner: boolean, onHome: boolean): ScrollDockRefs {
  // Brand-dot / presence-layer refs for the docking animation (face flies to brand slot).
  const appRef = useRef<HTMLDivElement>(null);
  const brandDotRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // The home scroll container — drives the orb's scroll-dock (big hero orb ⇄ topbar face).
  const homeStageRef = useRef<HTMLDivElement>(null);
  const measureHome = useCallback(() => {
    const app = appRef.current;
    const dot = brandDotRef.current;
    const layer = layerRef.current;
    if (!app || !dot || !layer) return;
    const d = dot.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    if (!d.width || !l.width) return;
    app.style.setProperty(
      '--home-x',
      `${Math.round(d.left + d.width / 2 - (l.left + l.width / 2))}px`,
    );
    app.style.setProperty(
      '--home-y',
      `${Math.round(d.top + d.height / 2 - (l.top + l.height / 2))}px`,
    );
    app.style.setProperty('--home-scale', ((Math.max(d.width, 12) * 1.3) / 150).toFixed(3));
  }, []);
  useEffect(() => {
    // The measured target is not used at rest (`--scroll-dock: 0`), so forcing layout inside the
    // initial React commit only makes first paint wait. Measure on the next frame, and coalesce
    // resize bursts the same way the scroll path already does. The face is still present on first
    // paint; only its future off-screen dock destination is deferred.
    let raf = requestAnimationFrame(measureHome);
    const onResize = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureHome);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [measureHome]);
  // Re-measure when the face docks (canvas arrived + focus settled to corner).
  useEffect(() => {
    if (inCorner && appRef.current) {
      appRef.current.style.setProperty('--scroll-dock', '0');
      measureHome();
    }
  }, [inCorner, measureHome]);

  useEffect(() => {
    const el = homeStageRef.current;
    const app = appRef.current;
    if (!onHome || !el || !app) return;
    let raf = 0;
    const update = (): void => {
      raf = 0;
      const t = Math.min(1, Math.max(0, el.scrollTop / DOCK_DISTANCE));
      app.style.setProperty('--scroll-dock', t.toFixed(4));
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update(); // sync on mount (e.g. restored scroll position)
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      app.style.setProperty('--scroll-dock', '0');
    };
  }, [onHome]);

  return { appRef, brandDotRef, layerRef, homeStageRef };
}

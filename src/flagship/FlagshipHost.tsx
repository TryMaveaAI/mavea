// FlagshipHost — the standalone home: the flagship marketing landing, hosted on its own. The
// landing used to live inside the old scripted-demo surface (App.tsx); every interactive path
// now leads into the REAL product instead — the hero composer seeds a real Live session
// (seedQuery), "Take the tour" boots Live's walkthrough mode, and a demo card boots Live's
// demo replay mode (a baked real session on the real surface). This host keeps only what the
// landing itself needs: the idle face + scroll-dock, the marketing topbar, the ⌘K palette.
// Eager and light by design — nothing here may pull the block library, the providers, or any
// corpus (tests/eager-bundle.test.ts walks this graph).
import { lazy, Suspense, useCallback, useEffect, useState, type ReactElement } from 'react';
import { FlagshipLanding, DEMO_ANCHOR } from './FlagshipLanding';
import { ExploreNav } from './ExploreNav';
import { isTourSeen, markTourSeen } from '../tour/tourSeen';
import { stashTourMode, stashTourChapter, stashTourSolo } from '../tour/tourEntry';
import { stashDemoPersona } from '../demo/demoEntry';
import type { DemoCastMember } from '../demo/cast';
import { stashSeedQuery } from '../live/seedQuery';
import { useScrollDock } from '../app/useScrollDock';
import { usePresenceColor } from '../app/usePresenceColor';
import { useCommandPalette } from '../live/features/useCommandPalette';
import { TopbarSearchButton } from '../live/features/TopbarSearchButton';
import { ThemeToggle } from '../live/setup/ThemeToggle';
import { preloadRoute } from '../routes';
import { AsyncSurface } from '../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../lib/preloadableLazy';

const flagshipPalette = createPreloadableLazy(() =>
  import('./FlagshipCommandPalette').then((m) => ({ default: m.FlagshipCommandPalette })),
);
const FlagshipCommandPalette = flagshipPalette.Component;
const Presence = lazy(() =>
  import('../presence/Presence').then((module) => ({ default: module.Presence })),
);

function scrollToDemo(): void {
  document.getElementById(DEMO_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function FlagshipHost(): ReactElement {
  // The landing's signature look: indigo presence + the matching home background tint (the
  // same fallback the old per-topic tint hook applied on the home phase).
  const presenceBase = usePresenceColor('indigo');
  useEffect(() => {
    document.documentElement.style.setProperty('--topic-tint', presenceBase);
  }, [presenceBase]);

  // Scroll-dock: the big hero orb glides into the topbar brand slot as you scroll down and
  // grows back as you scroll up. Always "on home" here — this host IS the home.
  const { appRef, brandDotRef, layerRef, homeStageRef } = useScrollDock(false, true);

  // Launch the walkthrough: stash the tour flag, then hand off to the real Live surface,
  // which boots in tour mode and replays the baked conversations exactly as live turns.
  const startTour = useCallback(() => {
    stashTourMode();
    window.location.hash = '#/live';
  }, []);

  // A demo card: stash the persona, hand off to Live's demo replay mode. Navigation is
  // instant — the recorded session (its own lazy chunk) loads inside the demo boot.
  const playDemo = useCallback((p: DemoCastMember) => {
    stashDemoPersona(p.id);
    window.location.hash = '#/live';
  }, []);

  // Enter the real product. An optional seed (the hero composer's typed question) is stashed
  // for LiveApp to run (or to forward through the setup wizard first).
  const enterLive = useCallback((seed?: string) => {
    if (typeof seed === 'string' && seed.trim()) stashSeedQuery(seed.trim());
    window.location.hash = '#/live';
  }, []);

  // Topbar entry points need the same pointer/focus/touch code warmup as route cards. This imports
  // the Live shell only; it never mounts Live or runs provider/model logic.
  const preloadLiveRoute = useCallback(() => preloadRoute('#/live') ?? Promise.resolve(), []);

  // Warm the Live provider/TTS connections while the user is still typing (or reaching toward
  // the demo cards), so the click-through doesn't pay cold-start latency. Dynamically imported
  // so the Live code never weighs down the eager landing bundle; prewarmLive self-throttles.
  const warmLive = useCallback(() => {
    void preloadRoute('#/live')?.catch(() => {});
    void import('../live/prewarm').then((m) => m.prewarmLive()).catch(() => {});
  }, []);

  // First-run walkthrough invite: shown once, never a forced auto-launch (either choice
  // retires it; the tour stays reachable from "Take the tour", ⌘K, and ?tour=1 links).
  const [tourInviteSeen, setTourInviteSeen] = useState(isTourSeen);
  const playTourInvite = useCallback(() => {
    markTourSeen();
    setTourInviteSeen(true);
    startTour();
  }, [startTour]);
  const dismissTourInvite = useCallback(() => {
    markTourSeen();
    setTourInviteSeen(true);
  }, []);

  // The ⌘K command palette — on the landing it doubles as a teaser that funnels into Live.
  // Self-contained surfaces open directly; a feature that names a walkthrough chapter plays it
  // as a solo mini-demo on Live; everything that needs your own data opens Live itself.
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  const watchInLive = useCallback(
    (chapterId: string) => () => {
      stashTourMode();
      stashTourChapter(chapterId);
      stashTourSolo();
      window.location.hash = '#/live';
    },
    [],
  );

  return (
    <div className="mavea-app live-voice canvas-flat" data-title="" ref={appRef}>
      {/* presence — the idle face on the hero; docks into the brand slot on scroll. While the
          lazy chunk loads, a same-footprint ghost holds the slot so the face fades in in place
          instead of popping into an empty hero. */}
      <div className="presence-layer idlehome" ref={layerRef}>
        <div className="presence-positioner">
          <Suspense fallback={<div className="presence-ghost" aria-hidden="true" />}>
            <Presence state="idle" emotion="neutral" gaze="center" muted={false} hidden={false} />
          </Suspense>
        </div>
      </div>

      {/* topbar — the clean marketing nav */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot jelly-mark" ref={brandDotRef} />
          <span className="brand-name">Mavéa</span>
        </div>
        <div className="topbar-spacer" />
        <nav className="fl-nav" aria-label="Primary">
          <TopbarSearchButton onOpen={openPalette} preload={flagshipPalette.preload} />
          <button
            type="button"
            className="fl-nav-link"
            onClick={startTour}
            {...preloadIntentProps(preloadLiveRoute)}
          >
            Take the tour
          </button>
          <button type="button" className="fl-nav-link" onClick={scrollToDemo}>
            Demo
          </button>
          <ExploreNav onStartTour={startTour} onScrollToDemo={scrollToDemo} />
        </nav>
        <button
          type="button"
          className="fl-nav-cta"
          onClick={() => enterLive()}
          {...preloadIntentProps(preloadLiveRoute)}
        >
          Open Mavéa
        </button>
      </div>

      {/* theme toggle — parked in the lower-right corner, out of the nav's way. A theme switch
          is ambience, not navigation; in the bar it read as one more mystery link. */}
      <div className="fl-theme-fab">
        <ThemeToggle className="topbar-icon-btn fl-nav-theme" />
      </div>

      {/* the landing itself */}
      <div ref={homeStageRef} className="presence-stage stage flagship" data-active="1">
        <FlagshipLanding
          onPlay={playDemo}
          onEnterLive={enterLive}
          onWarm={warmLive}
          onDemoIntent={warmLive}
          showTourInvite={!tourInviteSeen}
          onPlayTour={playTourInvite}
          onDismissTourInvite={dismissTourInvite}
        />
      </div>

      {paletteOpen && (
        <AsyncSurface label="Feature search" overlay>
          <FlagshipCommandPalette
            onClose={closePalette}
            startTour={startTour}
            watchInLive={watchInLive}
            enterLive={() => enterLive()}
          />
        </AsyncSurface>
      )}
    </div>
  );
}

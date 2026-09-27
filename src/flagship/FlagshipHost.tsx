// The home shell stays independent of the conversation machinery. The face occupies its own
// navigation slot; tours and recorded sessions load the real Live surface on demand.
import { lazy, Suspense, useCallback, useEffect, type ReactElement } from 'react';
import { FlagshipLanding, DEMO_ANCHOR } from './FlagshipLanding';
import { ExploreNav } from './ExploreNav';
import { markTourSeen } from '../tour/tourSeen';
import { stashTourMode, stashTourChapter, stashTourSolo } from '../tour/tourEntry';
import { stashDemoPersona } from '../demo/demoEntry';
import type { DemoCastMember } from '../demo/cast';
import { stashSeedQuery } from '../live/seedQuery';
import { usePresenceColor } from '../app/usePresenceColor';
import { useVoiceEnergySink } from '../voice/voiceEnergy';
import { useCommandPalette } from '../live/features/useCommandPalette';
import { TopbarSearchButton } from '../live/features/TopbarSearchButton';
import { ThemeToggle } from '../live/setup/ThemeToggle';
import { preloadRoute } from '../routes';
import { AsyncSurface } from '../components/AsyncSurface';
import { createPreloadableLazy, preloadIntentProps } from '../lib/preloadableLazy';
import { IS_SHOWCASE } from '../lib/runtimeMode';

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
    // Dropped on the way out for the same reason usePresenceColor drops its slots: an inline
    // value on <html> beats the palettes Live applies after this host unmounts.
    return () => {
      document.documentElement.style.removeProperty('--topic-tint');
    };
  }, [presenceBase]);

  const voiceSinkRef = useVoiceEnergySink();

  // Preserve the first-run marker across every entry into the walkthrough.
  const retireTourInvite = useCallback(() => {
    markTourSeen();
  }, []);

  // Launch the walkthrough: stash the tour flag, then hand off to the real Live surface,
  // which boots in tour mode and replays the baked conversations exactly as live turns.
  const startTour = useCallback(() => {
    retireTourInvite();
    stashTourMode();
    window.location.hash = '#/live';
  }, [retireTourInvite]);

  // A demo card: stash the persona, hand off to Live's demo replay mode. Navigation is
  // instant — the curated replay (its own lazy chunk) loads inside the demo boot. Retires the
  // invite for the same reason the walkthrough does: a replay IS the "see it work" the invite
  // offers, and its own primary button plays one.
  const playDemo = useCallback(
    (p: DemoCastMember) => {
      retireTourInvite();
      stashDemoPersona(p.id);
      window.location.hash = '#/live';
    },
    [retireTourInvite],
  );

  // Enter the real product. An optional seed (the hero composer's typed question) is stashed
  // for LiveApp to run (or to forward through the setup wizard first).
  const enterLive = useCallback((seed?: string) => {
    if (typeof seed === 'string' && seed.trim()) stashSeedQuery(seed.trim());
    window.location.hash = '#/live';
  }, []);

  // Topbar entry points need the same pointer/focus/touch code warmup as route cards. This imports
  // the Live shell only; it never mounts Live or runs provider/model logic.
  const preloadLiveRoute = useCallback(() => preloadRoute('#/live') ?? Promise.resolve(), []);

  // The ⌘K command palette — on the landing it doubles as a teaser that funnels into Live.
  // Self-contained surfaces open directly; a feature that names a walkthrough chapter plays it
  // as a solo mini-demo on Live; everything that needs your own data opens Live itself.
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  const watchInLive = useCallback(
    (chapterId: string) => () => {
      retireTourInvite();
      stashTourMode();
      stashTourChapter(chapterId);
      stashTourSolo();
      window.location.hash = '#/live';
    },
    [retireTourInvite],
  );

  return (
    <div className="mavea-app live-voice canvas-flat ob-host" data-title="">
      <div className="topbar">
        <div className="brand">
          <div className="ob-brand-presence presence-positioner" ref={voiceSinkRef}>
            <Suspense fallback={<div className="presence-ghost" aria-hidden="true" />}>
              <Presence state="idle" emotion="neutral" gaze="center" muted={false} hidden={false} />
            </Suspense>
          </div>
          <span className="brand-name">Mavéa</span>
        </div>
        <div className="topbar-spacer" />
        <nav className="fl-nav" aria-label="Primary">
          {!IS_SHOWCASE && (
            <TopbarSearchButton onOpen={openPalette} preload={flagshipPalette.preload} />
          )}
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
          {!IS_SHOWCASE && <ExploreNav onStartTour={startTour} onScrollToDemo={scrollToDemo} />}
          <a
            className="ob-github-link"
            href="https://github.com/TryMaveaAI/mavea"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <button
          type="button"
          className="fl-nav-cta"
          onClick={() =>
            IS_SHOWCASE
              ? document.getElementById('install')?.scrollIntoView({ behavior: 'smooth' })
              : enterLive()
          }
          {...preloadIntentProps(preloadLiveRoute)}
        >
          {IS_SHOWCASE ? 'Run locally ↗' : 'Open Mavéa ↗'}
        </button>
      </div>

      {/* theme toggle — parked in the lower-right corner, out of the nav's way. A theme switch
          is ambience, not navigation; in the bar it read as one more mystery link. */}
      <div className="fl-theme-fab">
        <ThemeToggle className="topbar-icon-btn fl-nav-theme" />
      </div>

      {/* the landing itself */}
      <div className="presence-stage stage flagship" data-active="1">
        <FlagshipLanding
          onPlay={playDemo}
          onEnterLive={enterLive}
          onDemoIntent={preloadLiveRoute}
          onPlayTour={startTour}
          onViewWorld={watchInLive('living-answer')}
        />
      </div>

      {paletteOpen && !IS_SHOWCASE && (
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

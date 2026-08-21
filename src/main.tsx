import { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/styles.css';
// The small shared type-role layer and face styling are global by design. The full optional Live
// template palettes remain route-scoped in LiveApp, so the landing does not download unused skins.
import './styles/type-roles.css';
import './styles/presence-styles.css';
import { FlagshipHost } from './flagship/FlagshipHost';
import { useResizeQuiet } from './lib/resizeQuiet';
import { applyStartupTemplate } from './live/templates';
import { readTheme, applyTheme } from './lib/theme';
import { applyPerfTier, currentAppliedTier, resolveTierNow } from './lib/perfTier';
import { onAudioSuspended, unlockAudio } from './voice/voiceEnergy';
import { installLastResort } from './lib/lastResort';
import { installAmbientPlayDriver } from './lib/pageVisibility';
import { RootBoundary, SurfaceFallback } from './RootBoundary';
import { routeFor } from './routes';
import { LegalGate } from './legal/LegalGate';
import { isLegalGateBypassed } from './legal/routePolicy';
import { createPreloadableLazy } from './lib/preloadableLazy';

// Dashboards refresh while Mavéa is open, not while #/dashboards happens to be the visible surface
// — so the loop is owned here, above the router, rather than by any one surface. Dynamically
// imported (invisible to the eager bundle) and gated on its own side: the gate mounts the engine
// only once a dashboard exists and the legal terms are accepted. See DashboardLoopGate.
const dashboardLoopGate = createPreloadableLazy(() =>
  import('./live/dashboards/DashboardLoopGate').then((m) => ({ default: m.DashboardLoopGate })),
);
const DashboardLoopGate = dashboardLoopGate.Component;

// No StrictMode: the choreography is timing-sensitive (the reveal walks drive real timers),
// and development double-invocation would fire those effects twice.
//
// Surfaces, hash-routed: the flagship landing (FlagshipHost, the default), the real product
// (LiveApp) at #/live — which also hosts the key-free walkthrough (?tour=1) and the recorded
// demo replays (?demo=<persona>) — and the browsable visual library (GalleryApp) at #/gallery.
// The full route table (which prefix loads which chunk, and which are dev-only QA harnesses)
// lives in routes.ts.
function useHashRoute(): string {
  const [hash, setHash] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** Retires the static boot splash (index.html #boot).
 *
 *  Rendered INSIDE Suspense on purpose: it mounts only once the lazy surface chunk has resolved,
 *  which is the first moment real UI exists underneath. Run from Root's own mount it fired while
 *  that chunk was still downloading — pulling the splash off early, exactly when it was still
 *  doing its job. Until then the splash covers the window, so a slow bundle shows the pulsing orb
 *  instead of a blank page; if the bundle never runs, the splash just stays. */
function RetireBootSplash(): null {
  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);
  return null;
}

function Root() {
  // Keep the docked face glued to its corner during window resizes (no transition slide).
  useResizeQuiet();
  const hash = useHashRoute();
  const Surface = routeFor(hash);
  // Arm the refresh loop after first paint, never alongside it — the same delay the dashboards
  // surface used when it owned the mount.
  const [startLoop, setStartLoop] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStartLoop(true), 600);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <RootBoundary>
      {/* Suspense covers every lazy surface chunk; FlagshipHost (the landing) renders
          synchronously and never suspends. */}
      <Suspense fallback={<SurfaceFallback />}>
        <RetireBootSplash />
        {Surface ? (
          <LegalGate bypass={isLegalGateBypassed(hash)}>
            <Surface />
          </LegalGate>
        ) : (
          <FlagshipHost />
        )}
      </Suspense>
      {/* Its own boundary: a slow gate chunk must never pull SurfaceFallback over a live surface. */}
      {startLoop && (
        <Suspense fallback={null}>
          <DashboardLoopGate />
        </Suspense>
      )}
    </RootBoundary>
  );
}

// Apply the persisted theme before the first paint so every surface opens in the user's
// chosen brightness — demo, dashboards, gallery, reel, all of them. Without this, a hard
// reload of #/dashboards while light mode is active would flash dark until a component
// called applyTheme. The CSP forbids an inline boot script — the #boot splash in index.html
// is style-only for the same reason — so this module-scope call is the earliest possible
// point; it also recolors that splash for light-theme users the moment the bundle executes.
applyTheme(readTheme());
// …and the performance tier (data-perf on <html>), the twin of the theme switch: weak machines
// (a 2016 integrated-GPU laptop) open in the calmer "lite" visual tier so the aurora face and
// glass chrome don't peg the compositor. Applied here, pre-first-paint, so no surface ever flashes
// the heavy tier before settling. Under `auto` a runtime probe (started after render) can later
// demote a machine that looks capable but janks. See lib/perfTier.ts.
applyPerfTier(resolveTierNow());
// #/live surfaces additionally apply the chosen presentation template (fonts, palette).
applyStartupTemplate(document, typeof window !== 'undefined' ? window.location.hash : '');

// Catch what RootBoundary can't: a rejected promise nothing awaited, or a throw outside any
// component's render. See lib/lastResort.ts.
installLastResort();

// Freeze every ambient CSS loop while the tab is backgrounded. The animations keep running
// otherwise — a landing's aurora, a canvas card's glow, a hundred-odd others — repainting for
// nobody on a battery someone is paying for. One inline property on the root does all of them,
// and it is removed (never set to `running`) on return, so the stylesheet stays in charge.
installAmbientPlayDriver();

// Unlock audio on the first user gesture, app-wide. Browsers only honor AudioContext.resume()
// from within a gesture; without this, a turn that fires WITHOUT a fresh click in the Live
// document — e.g. a question typed on the landing that auto-starts a Live session after the hash
// navigation — would schedule its narration on a suspended context and play nothing. Running it
// here (eager, before any navigation) means the user's very first tap or keypress on the landing
// readies playback for the whole session. voiceEnergy is a tiny zero-dependency leaf module, so
// importing it eagerly costs almost nothing; the listeners remove themselves once the context is
// confirmed running.
if (typeof window !== 'undefined') {
  const events = ['pointerdown', 'keydown'] as const;
  const opts = { passive: true } as const;
  const unlock = (): void => {
    // resume() is async — the first gesture usually returns false; a later one confirms it.
    if (unlockAudio()) events.forEach((e) => window.removeEventListener(e, unlock));
  };
  const arm = (): void => events.forEach((e) => window.addEventListener(e, unlock, opts));
  arm();
  // The shared context suspends itself after ~30s with nothing playing (an idle tab has no
  // business holding a real-time audio thread), and Safari only honors resume() from inside a
  // user gesture — so put the unlock listener back the moment that happens. addEventListener
  // de-dupes an identical listener, so re-arming an armed one is free.
  onAudioSuspended(arm);
}

createRoot(document.getElementById('root')!).render(<Root />);

// Adaptive perf-tier probe: under `auto`, watch real frame pacing for a few seconds once the app
// is up, and DEMOTE to lite mid-session if this machine janks under the full experience (a
// promotion is only recorded for next load, never applied now). No-ops unless the mode is auto.
// Its own warm-up delay skips the boot burst, so starting it here — right after render — is safe.
// The probe ignores the first eight seconds by design. Load its implementation after the critical
// render too, so cold-start parsing never competes with the first usable frame on a slow device.
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    void import('./lib/perfProbe').then(({ startPerfProbe }) => {
      startPerfProbe((tier) => {
        if (tier === 'lite' && currentAppliedTier() === 'full') applyPerfTier('lite');
      });
    });
  }, 0);
}

// Retire the cache-first worker shipped by older releases. The browser HTTP cache already keeps
// content-hashed /assets/* files immutable; duplicating them in Cache Storage retained obsolete
// chunks and made same-URL fonts stale. Keep this cleanup for at least one public release so an
// existing installation is unregistered even before its /sw.js update check activates the
// retirement worker. Restrict removal to our exact historical script path.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => {
            const worker = registration.active ?? registration.waiting ?? registration.installing;
            if (!worker || new URL(worker.scriptURL).pathname !== '/sw.js') return false;
            return registration.unregister();
          }),
        ),
      )
      .catch(() => {
        // Best effort only; the tombstone /sw.js also self-unregisters during an update check.
      });

    if ('caches' in window) {
      void caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key.startsWith('mavea-static-')).map((key) => caches.delete(key)),
          ),
        )
        .catch(() => {
          // Cache Storage can be disabled by browser policy; there is nothing else to clean up.
        });
    }
  });
}

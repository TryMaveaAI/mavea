// Always-on's mic must not silently keep "listening" after the tab goes to the background or
// the device sleeps. Browsers throttle/suspend a hidden tab's audio work, and vad-web's own
// capture AudioContext (distinct from the PLAYBACK context voiceEnergy.ts unlocks) isn't
// guaranteed to resume cleanly on its own — nothing else in the app watches for this. Rather
// than hope it recovers, we make the transition explicit: release the mic the moment the tab
// hides, and re-open it on return if the controller isn't already listening, so the UI's
// "listening" indicator is never a lie about a session that quietly died in the background.
import { useEffect, useRef } from 'react';
import { micShouldBeOpen, type AlwaysOnState } from './alwaysOnGate';

export interface UseAlwaysOnVisibilityArgs extends AlwaysOnState {
  /** True while the controller is actually listening right now. */
  listening: boolean;
}

export interface UseAlwaysOnVisibilityActions {
  start: () => void;
  stop: () => void;
}

export function useAlwaysOnVisibility(
  args: UseAlwaysOnVisibilityArgs,
  actions: UseAlwaysOnVisibilityActions,
): void {
  // Read the latest values at fire time — the listener itself only (re)binds when whether the
  // mic SHOULD be open at all changes, not on every listening/render tick.
  const ref = useRef({ ...args, ...actions });
  ref.current = { ...args, ...actions };

  const active = micShouldBeOpen(args);
  useEffect(() => {
    if (!active) return;
    const onVisibility = (): void => {
      if (document.hidden) {
        ref.current.stop();
      } else if (micShouldBeOpen(ref.current) && !ref.current.listening) {
        // The session may have gone stale while backgrounded — start fresh rather than trust a
        // half-alive capture context that never fired anything to tell us it died.
        ref.current.start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active]);
}

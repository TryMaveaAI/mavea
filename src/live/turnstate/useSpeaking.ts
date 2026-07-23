// Whether Mavéa's voice is audibly playing right now. Queue transitions drive this store, so Live
// does no polling and consumes zero timer wake-ups while speech is idle.
import { useSyncExternalStore } from 'react';
import { isSpeaking, isVoicePreparing, subscribeSpeaking } from '../../voice/tts';

export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
}

/** Anti-flash: a fast machine synthesizes a short line inside this window, and the pill
 *  flipping "Preparing → Speaking" on every stop would be churn, not honesty. Matches the
 *  pre-walk barrier's own PREPARE_CUE_DELAY_MS beat. */
const PREPARING_CUE_DELAY_MS = 600;

// The debounce lives OUTSIDE React on purpose: the raw synthesizing signal flips twice per
// spoken line (work starts → first audio), and a hook subscribed to it would re-render its
// component — LiveApp, the largest in the app — on every flip even when the debounced value
// never changes. Subscribers here only ever hear about HELD transitions.
let heldPreparing = false;
let holdTimer: number | null = null;
let unsubscribeRaw: (() => void) | null = null;
const heldListeners = new Set<() => void>();

function onRawChange(): void {
  if (isVoicePreparing()) {
    if (holdTimer === null && !heldPreparing) {
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        heldPreparing = true;
        for (const l of heldListeners) l();
      }, PREPARING_CUE_DELAY_MS);
    }
    return;
  }
  if (holdTimer !== null) {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (heldPreparing) {
    heldPreparing = false;
    for (const l of heldListeners) l();
  }
}

function subscribeHeld(listener: () => void): () => void {
  heldListeners.add(listener);
  // Attach to the voice store only while someone is listening — the timer and subscription
  // fully release when the last consumer unmounts.
  unsubscribeRaw ??= subscribeSpeaking(onRawChange);
  return () => {
    heldListeners.delete(listener);
    if (heldListeners.size === 0) {
      unsubscribeRaw?.();
      unsubscribeRaw = null;
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      heldPreparing = false;
    }
  };
}

/**
 * True once the voice has been synthesizing (queued but not yet audible) longer than the
 * anti-flash delay — the per-stop window where a slow machine renders speech in silence. The
 * voice strip owes the user an honest held beat here, not a pulsing "Speaking" over nothing.
 * Clears the instant audio starts or the queue stops.
 */
export function useVoicePreparing(): boolean {
  return useSyncExternalStore(
    subscribeHeld,
    () => heldPreparing,
    () => false,
  );
}

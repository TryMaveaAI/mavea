// world/openWorld.ts — the one seam between a `world` card sitting in the canvas and the surface
// that can actually take over the screen with it. A plain module-level registry, NOT a React
// context (canvas/focus/stepDriver.ts's idiom): the card lives inside the block registry, which
// knows nothing about live/, and the overlay lives in LiveApp, which must not re-render the whole
// canvas tree just to arm a button.
//
// Nothing registered is the NORMAL case, not an error: the gallery, an export, a replayed demo and
// every test render the card with no opener, so `requestOpenWorld` no-ops and the card renders its
// explore affordance inert. Only the live surface arms it.

type WorldOpener = (blockId: string) => void;

let opener: WorldOpener | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  // Snapshot before iterating — a listener that unsubscribes itself mid-notify must not corrupt
  // the in-flight iteration.
  for (const fn of Array.from(listeners)) fn();
}

/**
 * Register the surface that can open a world overlay. Returns an unregister function — call it on
 * unmount. Idempotent, and it only clears the registry when THIS opener is still the current one,
 * so a remount that registered first can't be torn down by the outgoing instance's cleanup.
 */
export function registerWorldOpener(fn: WorldOpener): () => void {
  opener = fn;
  notify();
  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    if (opener !== fn) return;
    opener = null;
    notify();
  };
}

/** Ask the registered surface to open the world carried by `blockId`. A no-op when nothing is
 *  registered — a card outside the live surface simply cannot be explored. */
export function requestOpenWorld(blockId: string): void {
  opener?.(blockId);
}

/** Snapshot getter for `useSyncExternalStore` — true while some surface can open a world. */
export function hasWorldOpener(): boolean {
  return opener !== null;
}

/** Subscribe to opener availability. Meant to be handed to a component's own
 *  `useSyncExternalStore` so the card arms and disarms its button with the surface. */
export function subscribeWorldOpener(onChange: () => void): () => void {
  listeners.add(onChange);
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    listeners.delete(onChange);
  };
}

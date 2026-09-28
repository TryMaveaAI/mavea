// useBackdropDismiss — click-outside that closes only on a gesture meant for the backdrop.
//
// A bare `onClick` on a scrim also fires for a drag that began inside the panel and was released
// past its edge (selecting text, dragging a slider), because the browser dispatches that click on
// the nearest common ancestor: the scrim. It fires as well for a press whose target unmounted
// mid-gesture, since the browser retargets the click to the nearest survivor. Both read as "I
// clicked a thing and it shut". So the press has to BEGIN on the backdrop as well as end there.
//
// A click with `detail === 0` came from the keyboard (Enter or Space on a backdrop `<button>`) or
// from script; neither can be a drag, so it dismisses without a pointer press before it.
import { useRef, type MouseEvent, type PointerEvent } from 'react';

export interface BackdropDismiss {
  onPointerDown: (e: PointerEvent<Element>) => void;
  onClick: (e: MouseEvent<Element>) => void;
}

/** Handlers for a backdrop element. `onDismiss` undefined means the backdrop is inert for now
 *  (an export mid-render, a pinned palette), while the press is still tracked. */
export function useBackdropDismiss(onDismiss: (() => void) | undefined): BackdropDismiss {
  const pressedHere = useRef(false);
  return {
    onPointerDown: (e) => {
      pressedHere.current = e.target === e.currentTarget;
    },
    onClick: (e) => {
      const began = pressedHere.current || e.detail === 0;
      pressedHere.current = false;
      if (began && e.target === e.currentTarget) onDismiss?.();
    },
  };
}

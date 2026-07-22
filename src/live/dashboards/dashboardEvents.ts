const TRIPWIRE_TOAST_EVENT = 'mavea-dashboard-tripwire-toast';

export interface TripwireToastDetail {
  dashboardId: string;
  dashboardTitle: string;
  tripwireLabel: string;
}

/** Broadcast a fresh transition into a triggered tripwire state. */
export function announceTripwireToast(detail: TripwireToastDetail): void {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(TRIPWIRE_TOAST_EVENT, { detail }));
    }
  } catch {
    /* non-browser env */
  }
}

/** Subscribe to tripwire-break toasts without loading the dashboard refresh engine. */
export function onTripwireToast(cb: (detail: TripwireToastDetail) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<TripwireToastDetail>).detail);
  window.addEventListener(TRIPWIRE_TOAST_EVENT, handler);
  return () => window.removeEventListener(TRIPWIRE_TOAST_EVENT, handler);
}

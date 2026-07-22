// route.ts — the tiny hash sub-router for the Flashcards surface. The top-level router in main.tsx
// mounts <FlashcardsApp/> for any `#/flashcards…` hash; this parses the rest into a view (+ deck)
// so a deck can be deep-linked. Mirrors dashboards/route.ts.
import { useEffect, useState } from 'react';

export type FlashView = 'gallery' | 'deck';
export interface FlashRoute {
  view: FlashView;
  deck?: string;
}

const BASE = '#/flashcards';

export function parseRoute(hash: string): FlashRoute {
  if (!hash.startsWith(BASE)) return { view: 'gallery' };
  const rest = hash.slice(BASE.length).replace(/^\//, '');
  const segs = rest.split('/').filter(Boolean);
  if (segs.length === 0) return { view: 'gallery' };
  if (segs[0] === 'deck' && segs[1]) return { view: 'deck', deck: decodeURIComponent(segs[1]) };
  return { view: 'gallery' };
}

export const flashHref = {
  gallery: BASE,
  deck: (deck: string) => `${BASE}/deck/${encodeURIComponent(deck)}`,
};

/** Reactive current-hash hook, local to the surface so sub-route changes re-render it. */
export function useHash(): string {
  const [hash, setHash] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  );
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

// dashboards/route.ts — the tiny hash sub-router for the Dashboards surface. The top-level router in
// main.tsx mounts <DashboardsApp/> for any `#/dashboards…` hash; this parses the rest into a view +
// id so the surface can show the gallery, a detail, its settings, or the overview.
import { useEffect, useState } from 'react';

export type DashView = 'gallery' | 'overview' | 'detail' | 'settings' | 'rewind' | 'present';
export interface DashRoute {
  view: DashView;
  id?: string;
}

const BASE = '#/dashboards';

export function parseRoute(hash: string): DashRoute {
  if (!hash.startsWith(BASE)) return { view: 'gallery' };
  const rest = hash.slice(BASE.length).replace(/^\//, '');
  const segs = rest.split('/').filter(Boolean);
  if (segs.length === 0) return { view: 'gallery' };
  if (segs[0] === 'overview') return { view: 'overview' };
  // 'rewind'/'present' must be matched here, before the single-segment fallthrough below treats
  // any unrecognized first segment as a dashboard id — otherwise #/dashboards/rewind would render
  // as "that dashboard isn't here" instead of the Weekly Rewind overlay.
  if (segs[0] === 'rewind') return { view: 'rewind' };
  if (segs[0] === 'present') return { view: 'present' };
  if (segs.length >= 2 && segs[1] === 'settings') return { view: 'settings', id: segs[0] };
  return { view: 'detail', id: segs[0] };
}

export const dashHref = {
  gallery: BASE,
  overview: `${BASE}/overview`,
  rewind: `${BASE}/rewind`,
  present: `${BASE}/present`,
  detail: (id: string) => `${BASE}/${id}`,
  settings: (id: string) => `${BASE}/${id}/settings`,
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

// Drive the presence color CSS variables (--presence / -soft / -deep + --glow-presence) from the
// chosen presence tweak. --motion-scale is deliberately NOT set here — useMotion owns it. Returns
// the resolved base color so the caller can hand it to useTopicTint as the home/upload fallback.
import { useEffect } from 'react';

import { PRESENCE_COLORS } from '../data/presenceColors';
import type { PresenceColorId } from '../types/mavea';

export function usePresenceColor(presence: PresenceColorId): string {
  const presenceBase = (PRESENCE_COLORS[presence] || PRESENCE_COLORS.indigo).base;
  useEffect(() => {
    const c = PRESENCE_COLORS[presence] || PRESENCE_COLORS.indigo;
    const r = document.documentElement.style;
    r.setProperty('--presence', c.base);
    r.setProperty('--presence-soft', c.soft);
    r.setProperty('--presence-deep', c.deep);
    r.setProperty('--glow-presence', c.glow);
    // Inline custom properties on <html> outrank every stylesheet rule, so leaving them behind
    // would pin the next surface to this one's accent — Live's theme templates rebind
    // --presence through :root[data-template] and would silently lose to a stale inline value.
    return () => {
      r.removeProperty('--presence');
      r.removeProperty('--presence-soft');
      r.removeProperty('--presence-deep');
      r.removeProperty('--glow-presence');
    };
  }, [presence]);
  return presenceBase;
}

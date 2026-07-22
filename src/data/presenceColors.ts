// The signature color sets. The active set is written to CSS custom properties at runtime,
// so switching the presence color re-themes the face and accents in one move.
import type { PresenceColor, PresenceColorId } from '../types/mavea';

export const PRESENCE_COLORS: Record<PresenceColorId, PresenceColor> = {
  indigo: { base: '#6e8cff', soft: '#8aa0ff', deep: '#4458c9', glow: 'rgba(110,140,255,0.45)' },
  violet: { base: '#9a7cff', soft: '#b49bff', deep: '#6741cc', glow: 'rgba(154,124,255,0.45)' },
  aqua: { base: '#3fb6e8', soft: '#73d0f5', deep: '#1f6f9e', glow: 'rgba(63,182,232,0.42)' },
  gold: { base: '#e8b84f', soft: '#f5cf80', deep: '#a87e22', glow: 'rgba(232,184,79,0.42)' },
};

// atmosphere.ts — what a world is MADE OF, as light in the room.
//
// The eight domain hues are the only categorical channel a living answer carries, and until now they
// reached one 6px dot in a card's foot. That is most of why every world looks the same: nothing on
// screen is keyed to what the world is ABOUT, so a photosynthesis world and a bailout world are the
// same grey rectangles in the same left-to-right band.
//
// No claim is made by any of this. `domain` is a description rather than an assertion (the builder
// is told to omit it where no single sphere fits, never to stretch one), so it needs no receipt —
// and the boundary that keeps it honest is WHERE a hue may land: only on surfaces whose meaning is
// "which sphere is this". Never on one meaning how strong, how well-backed, or which direction. So:
// the card's dot, the card's top light-bar, the chart mark, and the stage's own air. Not the edge
// ink, not a card's border, not a tier chip, not a figure.
import type { WorldDomain } from './types';
import type { WorldData } from '../../canvas/spatial/morph/types';

/** The hue token for each sphere. A literal record rather than a template string: interpolating a
 *  model-authored value into `var(--domain-…)` would paste model text into a stylesheet, and this
 *  will not compile if a sphere is added and forgotten. */
const DOMAIN_INK: Record<WorldDomain, string> = {
  economy: 'var(--domain-economy)',
  policy: 'var(--domain-policy)',
  technology: 'var(--domain-technology)',
  science: 'var(--domain-science)',
  environment: 'var(--domain-environment)',
  society: 'var(--domain-society)',
  health: 'var(--domain-health)',
  conflict: 'var(--domain-conflict)',
};

/** Below this share of labelled top-level causes the world keeps the neutral pair. Two labelled
 *  causes out of nine are not what a world is about, and must not repaint the room. */
const QUORUM = 0.5;

export interface Atmosphere {
  /** The plurality sphere's hue, and the runner-up — or the same hue twice on a single-sphere
   *  world, which reads as one light rather than as a gradient between two. */
  air1: string;
  air2: string;
}

/**
 * The two hues this world is lit by, or null when it is not about any sphere in particular.
 *
 * Counted on TOP-LEVEL causes only: a single cause with four `technology` parts is not a
 * technology world, and letting a breakdown vote would let the reader repaint the room by pressing
 * break-down. Ties break on the domain's own name so the same world is always lit the same way.
 */
export function atmosphereOf(world: WorldData): Atmosphere | null {
  const top = world.nodes.filter((n) => n.parentId === undefined);
  if (top.length === 0) return null;
  const tally = new Map<string, number>();
  for (const n of top) {
    if (n.domain === undefined) continue;
    tally.set(n.domain, (tally.get(n.domain) ?? 0) + 1);
  }
  const labelled = [...tally.values()].reduce((a, b) => a + b, 0);
  if (labelled / top.length < QUORUM) return null;
  const ranked = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([domain]) => DOMAIN_INK[domain as WorldDomain])
    .filter((ink): ink is string => ink !== undefined);
  if (ranked.length === 0) return null;
  return { air1: ranked[0], air2: ranked[1] ?? ranked[0] };
}

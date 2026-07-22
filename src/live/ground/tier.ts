// tier.ts — bridges the spine's Tier to the existing Conf vocabulary the canvas already renders, so a
// grounded value lights up the current provenance badges (canvas/provenance.tsx: LiveMark /
// InferredMark / EvidencePill) with no new UI. Pure; type-only import.
import type { Tier } from './types';
import type { Conf } from '../../data/conversation';

/** Map a provenance tier to the canvas confidence level that drives badge rendering.
 *   T1 user-data  → strong    (a real figure the user gave us)
 *   T2 web-cited  → partial   (real, but snippet-level — honestly weaker than a held document)
 *   T3 illustrative → inferred (a model magnitude, shown caveated)
 *   T0 structure  → unverified (no number; qualitative only) */
export function tierToConf(t: Tier): Conf {
  switch (t) {
    case 'T1':
      return 'strong';
    case 'T2':
      return 'partial';
    case 'T3':
      return 'inferred';
    case 'T0':
    default:
      return 'unverified';
  }
}

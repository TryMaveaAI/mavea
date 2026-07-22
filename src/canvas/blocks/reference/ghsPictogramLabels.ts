// Plain data, split out of GhsPictograms.tsx so that file exports a component only (mixing a
// component with a constant export defeats React Fast Refresh for the whole module).
import type { GhsPictogram } from './types';

/** Human-readable label for each pictogram — the caption under the glyph and its aria-label. */
export const GHS_LABELS: Record<GhsPictogram, string> = {
  flammable: 'Flammable',
  corrosive: 'Corrosive',
  toxic: 'Toxic',
  irritant: 'Irritant',
  oxidizer: 'Oxidizer',
  healthHazard: 'Health hazard',
  // "Environment", not the longer "Environmental hazard" — at the pictogram row's narrow
  // per-item width, the full phrase's first word alone overflows and wraps mid-word.
  environment: 'Environment',
  explosive: 'Explosive',
  compressedGas: 'Compressed gas',
};

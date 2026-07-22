// The reel's look is two orthogonal choices: a PALETTE (color) and a VIBE (shell skin + which finishes
// the director favors). Both are data here; the actual colors live as CSS variables in reel.css, keyed
// off `data-palette`/`data-vibe`, so a single slide component serves every combination and there's no
// hex in the JSX. This module is the source of truth for the modal chips and the director's options.
import type { ClipTheme } from '../types';

export interface PaletteMeta {
  id: ClipTheme;
  label: string;
  /** A CSS gradient for the modal's color dot (the only place the swatch is shown literally). */
  dot: string;
  blurb: string;
}

/** Four palettes, matching the design's Aurora/Ember/Ocean/Chalk; see reel.css for the token values. */
export const PALETTES: PaletteMeta[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    dot: 'linear-gradient(135deg,#6d6dff,#a78bfa)',
    blurb: 'Indigo',
  },
  {
    id: 'ember',
    label: 'Ember',
    dot: 'linear-gradient(135deg,#f4923c,#e0603a)',
    blurb: 'Warm amber',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    dot: 'linear-gradient(135deg,#2ad0e6,#0f9bad)',
    blurb: 'Deep teal',
  },
  {
    id: 'chalk',
    label: 'Chalk',
    dot: 'linear-gradient(135deg,#c3c8d6,#7d8398)',
    blurb: 'Editorial',
  },
];

// The reel ships the "clean" vibe (the cinematic DATA look); the data-vibe hook is wired on the board
// so additional whole-reel skins (bold/editorial/playful/neon, see VibeId) can be styled later without
// touching the player or the finishes.

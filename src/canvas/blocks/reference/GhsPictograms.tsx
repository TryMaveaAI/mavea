// GHS pictogram glyphs — the nine red-bordered-diamond hazard symbols defined by the
// UN Globally Harmonized System (flame, skull-and-crossbones, exclamation mark…). No icon
// font ships these, so each is a small bespoke inline SVG: a shared diamond outline plus a
// minimal symbol, simplified to stay legible at the ~40px size a card renders it at. Every
// stroke/fill is a design token (`--danger`) so the glyph is identical in light and dark —
// only the diamond's faint fill tint comes from `color-mix`, never a raw hex.
import type { ReactElement } from 'react';
import type { GhsPictogram } from './types';
import { GHS_LABELS } from './ghsPictogramLabels';

/** Diamond outline every pictogram shares, inset a hair from the 0..24 viewBox edge. */
const DIAMOND_POINTS = '12,1.6 22.4,12 12,22.4 1.6,12';

/** The symbol markup for each pictogram, drawn inside the shared diamond. */
const SYMBOLS: Record<GhsPictogram, () => ReactElement> = {
  flammable: () => (
    <path
      className="ghs-symbol-fill"
      d="M12 6c1.9 2.4 2.9 4.2 2.9 6a2.9 2.9 0 0 1-5.8 0c0-.7.15-1.3.45-1.85-.05.5.1.9.5 1.15-.15-1.7.3-3.4 1.95-5.3Z"
    />
  ),
  corrosive: () => (
    <g className="ghs-symbol">
      <line x1="5.6" y1="13.4" x2="18.4" y2="13.4" />
      <path d="M9 6.6v3.6q0 1.7-1.1 3.2" />
      <path d="M15 6.6v3.6q0 1.7 1.1 3.2" />
      <path d="M7.6 15.4q.6 1.2 0 2.4" />
      <path d="M16.4 15.4q.6 1.4-.2 2.6" />
    </g>
  ),
  toxic: () => (
    <g className="ghs-symbol">
      <circle cx="12" cy="10.1" r="3.15" />
      <circle className="ghs-symbol-fill" cx="10.6" cy="9.8" r="0.55" />
      <circle className="ghs-symbol-fill" cx="13.4" cy="9.8" r="0.55" />
      <path d="M10.6 12.3q1.4 1 2.8 0" />
      <path d="M8.1 17.1 15.9 13.7" />
      <path d="M8.1 13.7 15.9 17.1" />
    </g>
  ),
  irritant: () => (
    <g className="ghs-symbol-fill">
      <rect x="11.05" y="6.4" width="1.9" height="6.6" rx="0.95" />
      <circle cx="12" cy="15.9" r="1.1" />
    </g>
  ),
  oxidizer: () => (
    <>
      <circle className="ghs-symbol" cx="12" cy="15.1" r="3.05" />
      <path
        className="ghs-symbol-fill"
        d="M12 6c1.5 2 2.3 3.5 2.3 5a2.3 2.3 0 0 1-4.6 0c0-.55.1-1 .3-1.45-.05.4.1.7.4.9-.1-1.35.35-2.7 1.6-4.45Z"
      />
    </>
  ),
  healthHazard: () => (
    <g className="ghs-symbol">
      <circle cx="12" cy="7.5" r="1.75" />
      <path d="M8.3 17c.1-3.15 1.7-5.1 3.7-5.1s3.6 1.95 3.7 5.1" />
      <path d="M12 12.6v3.4" />
      <path d="M10.5 14.3h3" />
      <path d="M10.8 13.15l2.4 2.4" />
      <path d="M13.2 13.15l-2.4 2.4" />
    </g>
  ),
  environment: () => (
    <g className="ghs-symbol">
      <path d="M8.7 7.4v6.2" />
      <path d="M8.7 9.7 7 8.2" />
      <path d="M8.7 8.9l1.9-1.6" />
      <path d="M8.7 11.7 7 13" />
      <path d="M6 15.9c1.35.85 2.85.85 4.2 0" />
      <path d="M13.6 15.9c1.35.85 2.85.85 4.2 0" />
      <path
        className="ghs-symbol-fill"
        d="M14.9 12.6c1.7-.35 3.05.2 3.7 1.15-.7.95-2.1 1.5-3.7 1.15.35-.5.35-1.8 0-2.3Z"
      />
    </g>
  ),
  explosive: () => (
    <g>
      <circle className="ghs-symbol-fill" cx="12" cy="12" r="1.55" />
      <g className="ghs-symbol">
        <path d="M12 6.5v2.3" />
        <path d="M12 15.2v2.3" />
        <path d="M6.5 12h2.3" />
        <path d="M15.2 12h2.3" />
        <path d="M8.3 8.3l1.6 1.6" />
        <path d="M14.1 14.1l1.6 1.6" />
        <path d="M15.7 8.3l-1.6 1.6" />
        <path d="M9.9 14.1l-1.6 1.6" />
      </g>
    </g>
  ),
  compressedGas: () => (
    <g className="ghs-symbol">
      <rect x="9.3" y="9.1" width="5.4" height="8.4" rx="1.3" />
      <rect x="10.55" y="6.35" width="2.9" height="2.4" rx="0.5" />
      <line x1="9.6" y1="12.6" x2="14.4" y2="12.6" />
    </g>
  ),
};

/** One GHS hazard diamond, drawn as an inline SVG (no icon-font glyph exists for these). */
export function GhsPictogramGlyph({ kind, className }: { kind: GhsPictogram; className?: string }) {
  // Named "Glyph", never "Symbol" — shadowing the built-in Symbol global here breaks the
  // React Compiler's injected memoization sentinel (it calls the real Symbol.for at render).
  const Glyph = SYMBOLS[kind];
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={GHS_LABELS[kind]} className={className}>
      <polygon className="ghs-diamond" points={DIAMOND_POINTS} />
      <Glyph />
    </svg>
  );
}

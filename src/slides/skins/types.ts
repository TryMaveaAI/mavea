// The slide-skin contract. A skin is mostly *data* — a palette + a font set + a few decorative
// knobs — plus the handful of layouts it draws structurally differently from the shared defaults.
// One set of token-driven shared layouts serves every skin; a skin overrides a layout only where
// its reference diverges (Noir centres + ornaments; Grid rules its grid; Cobalt goes mono + dots).
//
// Skins are a self-contained, fixed-palette layer — deliberately isolated from the app's design
// tokens, so a cream slide never tints when the app is in dark mode. Only `dark` skins are dark.
import type { FC } from 'react';
import type { Slide, SlideKind } from '../model/Slide';

export type SlideSkinId =
  'folio' | 'meridian' | 'noir' | 'north' | 'lumen' | 'grid' | 'terra' | 'cobalt' | 'press' | 'sol';

/** The colour world of a skin. Layouts read these (never literals) so one component fits all. */
export interface SlideTokens {
  /** Slide background. For a `dark` skin this is the dark surface. */
  paper: string;
  /** Primary ink. */
  ink: string;
  /** Secondary / muted ink. */
  muted: string;
  /** Faint ink (eyebrows, ghost numerals). */
  faint: string;
  /** Brand accent — overridable per-export, exposed as `--accent`. */
  accent: string;
  /** Soft wash of the accent (tinted cards) — exposed as `--tint`. */
  tint: string;
  /** Optional second accent (North coral, Sol yellow, Cobalt blue). */
  accent2?: string;
  /** Hairline / rule colour. */
  rule: string;
  /** A stronger rule for structure (mastheads, section heads). */
  ruleStrong: string;
  /** Empty-track fill (progress bars, unfilled dots). */
  track: string;
  /** Raised card surface on the paper. */
  card: string;
  /** A dark surface for dividers / inverted panels on a light skin. */
  darkSurface: string;
  /** Ink used on `darkSurface`. */
  darkInk: string;
  /** Accent used on `darkSurface` (often a lighter tint of `accent`). */
  darkAccent: string;
  /** True when the whole slide is dark (Noir, Cobalt). */
  dark?: boolean;
  /** Card / tile corner radius in px (0 = Grid's sharp edges, ~26 = Sol's friendly cards). */
  radius: number;
  /** Content padding inside the 1920×1080 frame, CSS shorthand. */
  pad: string;
  /**
   * Text-grade tone of the accent, used ONLY where the accent prints as small text on `paper`
   * (kickers, labels, ghost numerals). The bright `accent` stays the fill/decor identity colour;
   * `accentInk` is a darker tone of the *same hue* so legibility rises without changing identity.
   * Falls back to `accent` (set only on skins whose accent fails contrast as text, e.g. Folio/Sol).
   */
  accentInk?: string;
  /**
   * Surface finish for cards / tiles / raised panels. Omit (or 'flat') to stay flat — a flat skin
   * (Grid, Press, Noir's hairline world) renders a rule instead of a shadow. 'glow' is the dark-skin
   * accent-tinted ring (Cobalt) rather than a black drop shadow.
   */
  elevation?: 'flat' | 'soft' | 'raised' | 'glow';
  /**
   * Optional paper finish, rendered as a raster-safe low-opacity CSS gradient overlay (never an SVG
   * filter). 'paper' = a faint warm tooth for cream skins; 'linen' = a fine weave for luxe black.
   */
  texture?: 'paper' | 'linen';
  /** Decor opacity multiplier (0–2), to push near-invisible decor up. Defaults to 1 when unset. */
  decorStrength?: number;
  /** Brighter highlight tone for a skin's signature flourish (Noir foil, Cobalt glow). → `accent`. */
  flourish?: string;
}

/** A skin's typography. `href` points to the self-hosted OFL stylesheet. */
export interface SlideFonts {
  href: string;
  /** Display family for headlines and big numerals. */
  display: string;
  /** Body family. */
  body: string;
  /** Mono / label family for kickers; falls back to `body` uppercased. */
  mono?: string;
  /** Display weight (Grid 900, Noir 500…). */
  displayWeight?: number;
  /** Default body weight. */
  bodyWeight?: number;
  /** True when display *and* body are the same serif (Press) — used for italic emphasis. */
  allSerif?: boolean;
}

/** Per-skin decorative background (geometry, dot grids, organic blobs, visible grids). */
export type DecorKind = 'none' | 'geo' | 'dots' | 'organic' | 'grid' | 'playful' | 'ornament';

/** Position the deck gives a slide, for page numbers + progress. */
export interface SlideContext {
  index: number;
  total: number;
}

export type SlideLayoutProps<K extends SlideKind> = {
  slide: Extract<Slide, { kind: K }>;
  skin: SlideSkin;
  ctx: SlideContext;
};
export type SlideLayout<K extends SlideKind> = FC<SlideLayoutProps<K>>;
export type SlideLayoutMap = { [K in SlideKind]: SlideLayout<K> };

/** The wordmark + standing line a skin prints in its footer/colophon. */
export interface SlideBrand {
  name: string;
  tagline: string;
}

export interface SlideSkin {
  id: SlideSkinId;
  label: string;
  blurb: string;
  /** Human archetype label shown in the gallery ("Editorial", "Corporate", "Luxury"…). */
  archetype: string;
  brand: SlideBrand;
  tokens: SlideTokens;
  fonts: SlideFonts;
  decor: DecorKind;
  /** Layouts this skin draws structurally differently from the shared defaults. */
  layouts: Partial<SlideLayoutMap>;
}

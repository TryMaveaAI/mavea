// The template-skin contract. A skin is mostly *data* — a palette + font set — plus the
// page chrome (masthead / running header / footer) and any section renderers it draws
// differently from the shared defaults. One shared section component serves every skin by
// reading these tokens; a skin overrides a renderer only where its reference diverges
// structurally (Luxury centres its title; Swiss hard-rules its grid).
import type { FC } from 'react';
import type { ExportMeta, SectionDataMap, SectionKind } from '../model/ExportDoc';
import type { PageFormat } from '../paginate/geometry';
import type { FaceSpec } from '../render/fonts';

export type SkinId =
  | 'editorial'
  | 'swiss'
  | 'terminal'
  | 'executive'
  | 'luxury'
  | 'medical'
  | 'school'
  | 'financial'
  | 'research'
  | 'legal';

/** The colour world of a skin. Sections read these (never literals) so one component fits all. */
export interface SkinTokens {
  /** The page (paper) background. Terminal is dark. */
  pageBg: string;
  /** Optional background-image layered on the page (Terminal's dot grid). */
  pageBgImage?: string;
  /** background-size for `pageBgImage` (e.g. "22px 22px"). */
  pageBgSize?: string;
  /** Optional left page rule (Executive's 4px accent edge), CSS border shorthand. */
  pageBorderLeft?: string;
  /** Body ink. */
  ink: string;
  /** Secondary / muted ink. */
  muted: string;
  /** Faint label ink (eyebrows over light fills). */
  faint: string;
  /** Brand accent (overridable per-export). */
  accent: string;
  /** A soft wash of the accent for tinted callouts/tiles. */
  tint: string;
  /** Hairline / rule colour. */
  rule: string;
  /** A stronger rule for mastheads/structure (Swiss 2px black; Editorial 1px ink). */
  ruleStrong: string;
  /** Fill for an empty track (progress bars, unfilled dots). */
  track: string;
  /** Page padding, CSS shorthand "T R B" or "T R B L" (matches the reference exactly). */
  padding: string;
  /** Page corner radius in px. */
  radius: number;
  /** Inner card/tile/callout corner radius in px. */
  cardRadius: number;
  /** True for a dark page — flips the raster paper background to `pageBg`. */
  dark?: boolean;
  /** Ink + fill used by the inverted spotlight card (defaults derive from ink/accent). */
  invertBg?: string;
  invertInk?: string;
  /** Up/down colours for signed deltas in numeric ledgers (Financial). Optional — skins that
   *  don't carry financial figures leave them unset and renderers fall back to accent/muted. */
  pos?: string;
  neg?: string;
}

/**
 * A skin's typography. All ten skins are self-hosted (public/fonts/, see LICENSE.txt) — `hrefs`
 * lists the local family stylesheet(s) this skin needs, one per family under
 * public/fonts/export/families/ plus the app-wide public/fonts/fonts.css for whichever of
 * Hanken Grotesk/Newsreader/IBM Plex Mono it shares with the landing page. A family's stylesheet
 * always appears at the same URL across every skin that uses it — `ensureFacesLoaded` dedupes by
 * href, so two skins sharing a family (Hanken Grotesk, IBM Plex Sans…) never register its
 * `@font-face` rules twice in one session (a real, verified Chromium bug: duplicate bindings for
 * the same family/weight/style make `document.fonts.load`/`check` resolve unreliably).
 */
export interface SkinFonts {
  hrefs: string[];
  /** Display family for big titles (Instrument Serif, Bodoni Moda, Archivo…). */
  display: string;
  /** Body copy family. */
  body: string;
  /** Mono / label family for eyebrows (JetBrains Mono, IBM Plex Mono…); falls back to body. */
  mono?: string;
  /** Display weight (Swiss/Financial run heavy). */
  displayWeight?: number;
  /**
   * Every face (family + weight + optional italic) this skin's chrome and section renderers
   * actually paint with — declared explicitly, not derived, so `ensureFacesLoaded` warms exactly
   * what's used and never requests (or silently misses) a weight. Mirrors the weight/style set
   * `hrefs`' stylesheets declare.
   */
  faces: FaceSpec[];
}

export type SectionComponentProps<K extends SectionKind> = {
  data: SectionDataMap[K];
  skin: TemplateSkin;
  /** The page size this render is laid out for — only the figure archetype reads it (its frame
   *  width must match the real content column). Optional (defaults to Letter) so a renderer can
   *  still be exercised directly, without a full document, in isolation. The real render path
   *  (RenderSection) always supplies it explicitly. */
  format?: PageFormat;
};

/** A renderer for one archetype, keyed by kind so `data` is precisely typed. */
export type SectionComponent<K extends SectionKind> = FC<SectionComponentProps<K>>;

/** The full set of shared archetype renderers. */
export type SectionComponentMap = { [K in SectionKind]: SectionComponent<K> };

export type MastheadComponent = FC<{ meta: ExportMeta; skin: TemplateSkin }>;
export type FooterComponent = FC<{
  meta: ExportMeta;
  skin: TemplateSkin;
  page: number;
  total: number;
}>;

export interface SkinChrome {
  /** Page-1 full masthead. */
  masthead: MastheadComponent;
  /** Page-2+ slim running header. */
  runningHeader: MastheadComponent;
  /** Footer with the provenance line + "NN / TT". */
  footer: FooterComponent;
}

/** The wordmark + standing line a skin prints in its masthead/footer. */
export interface SkinBrand {
  /** The masthead wordmark (currently "MAVÉA" for every skin). */
  name: string;
  /** The standing tagline under the wordmark / in the footer. */
  tagline: string;
}

export interface TemplateSkin {
  id: SkinId;
  label: string;
  blurb: string;
  brand: SkinBrand;
  tokens: SkinTokens;
  fonts: SkinFonts;
  /** Overrides for archetypes this skin draws structurally differently. */
  sections: Partial<{ [K in SectionKind]: SectionComponent<K> }>;
  chrome: SkinChrome;
}

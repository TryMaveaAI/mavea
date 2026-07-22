// bridge — turn an export/slide skin's palette into the canvas design-token overrides a real
// component reads, so an embedded chart/diagram renders in the skin's colours on the skin's paper
// instead of the app's dark defaults.
//
// Canvas components colour themselves through a fixed vocabulary of CSS custom properties
// (`--presence`, `--insight`, `--text-primary`, `--grid-line`, `--surface-elevated`…). Setting
// those properties inline on the figure wrapper re-points the whole subtree at the skin palette —
// inline custom properties cascade to descendants and override `:root`, so no component edit is
// needed. The mapping is deterministic CSS `color-mix` (no colour parsing): the brand accent
// becomes a small monochrome category ramp (a true second hue only when the skin offers `accent2`),
// and surfaces are ink-tinted paper rather than the app's translucent glass — translucent glass
// washes out to near-invisible on light paper (a known trap), so we never reuse it here.

/** A skin-agnostic palette. The export `SkinTokens` and the slide `SlideTokens` each adapt into
 *  this at their call site, so this module depends on neither export/ nor slides/. */
export interface FigurePalette {
  /** True for a dark skin (Terminal, Noir, Cobalt). */
  dark: boolean;
  /** Page / slide background. */
  paper: string;
  /** Primary ink. */
  ink: string;
  /** Secondary ink. */
  muted: string;
  /** Faint label ink. */
  faint: string;
  /** Brand accent (fill identity). */
  accent: string;
  /** Text-grade accent (darker, same hue) where the skin defines one; falls back to `accent`. */
  accentInk?: string;
  /** A true second accent hue where the skin has one (slide North/Sol/Cobalt); else derived. */
  accent2?: string;
  /** A soft wash of the accent for tinted fills (mirrors the doc's `--tint`). */
  tint: string;
  /** Hairline rule. */
  rule: string;
  /** Structural rule. */
  ruleStrong: string;
  /** Empty-track fill. */
  track: string;
  /** Raised surface (slide card); export derives one from paper when absent. */
  card?: string;
  /** Body font-family (so SVG `<text>` inherits the skin's type). */
  font: string;
  /** Mono/label font-family. */
  mono?: string;
}

const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/**
 * The CSS custom properties to set on the figure wrapper. Spread into the wrapper `style`; every
 * descendant component then reads the skin palette. Pure — the same palette always yields the same
 * vars, so a contrast test can assert legibility without rendering.
 */
export function bridgeVars(p: FigurePalette): Record<string, string> {
  const accentInk = p.accentInk ?? mix(p.accent, 80, p.ink);
  const second = p.accent2 ?? mix(p.accent, 58, p.paper); // category 2: true 2nd hue, else a lighter tint
  const surface = p.card ?? mix(p.ink, 4, p.paper);

  return {
    // type
    '--text-primary': p.ink,
    '--text-secondary': p.muted,
    '--text-muted': mix(p.muted, 70, p.faint),
    '--text-faint': p.faint,

    // accents — a monochrome category ramp anchored on the brand accent, so a multi-series
    // chart stays distinguishable AND on-brand; a genuine second hue is used when the skin has one.
    '--presence': p.accent,
    '--presence-soft': mix(p.accent, 72, p.paper),
    '--presence-deep': accentInk,
    '--accent-ink': accentInk,
    '--insight': second,
    '--insight-soft': mix(second, 60, p.paper),
    '--warning': mix(p.accent, 42, p.ink),
    '--warning-soft': mix(p.accent, 30, p.paper),
    '--danger': mix(p.accent, 26, p.ink),
    '--tint': p.tint,
    '--topic-tint': p.accent,

    // glows — a soft accent wash, never the app's heavy coloured shadow
    '--glow-presence': mix(p.accent, 22, 'transparent'),
    '--glow-insight': mix(second, 18, 'transparent'),
    '--glow-warning': mix(p.accent, 16, 'transparent'),

    // surfaces — ink-tinted paper (NOT translucent glass, which washes out on light paper)
    '--surface-default': p.paper,
    '--surface-deep': mix(p.ink, 5, p.paper),
    '--surface-elevated': surface,
    '--surface-elevated-2': mix(p.ink, 7, p.paper),
    '--surface-glass': mix(p.ink, 6, p.paper),
    '--surface-glass-strong': mix(p.ink, 10, p.paper),

    // hairlines
    '--line': p.rule,
    '--line-soft': mix(p.rule, 60, p.paper),
    '--line-strong': p.ruleStrong,

    // chart structural colours
    '--grid-line': mix(p.ink, 10, p.paper),
    '--grid-strong': mix(p.ink, 20, p.paper),
    '--track': p.track,
    '--hover-line': p.muted,
    '--cell-empty': mix(p.ink, 5, p.paper),

    // type families (SVG <text> with no explicit family inherits these)
    '--font': p.font,
    '--mono': p.mono ?? p.font,
  };
}

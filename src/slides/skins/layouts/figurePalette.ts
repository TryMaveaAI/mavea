// The skin -> figure palette adapter, in its own file so figure.tsx keeps exporting only its
// component and a test can judge every skin's embedded figures through the same mapping.
import type { FigurePalette } from '../../../canvas/embed';
import type { SlideSkin } from '../types';

/** Adapt the slide skin's palette to the shared figure-embed token bridge. */
export function paletteFor(skin: SlideSkin): FigurePalette {
  const t = skin.tokens;
  return {
    dark: !!t.dark,
    paper: t.paper,
    ink: t.ink,
    muted: t.muted,
    faint: t.faint,
    accent: t.accent,
    accentInk: t.accentInk,
    accent2: t.accent2,
    tint: t.tint,
    rule: t.rule,
    ruleStrong: t.ruleStrong,
    track: t.track,
    card: t.card,
    font: skin.fonts.body,
    mono: skin.fonts.mono,
  };
}

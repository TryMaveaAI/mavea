// The skin -> figure palette adapter, in its own file so figure.tsx keeps exporting only its
// component and a test can judge every skin's embedded figures through the same mapping.
import type { FigurePalette } from '../../../canvas/embed';
import type { TemplateSkin } from '../types';

/** Adapt an export skin's palette to the shared figure-embed token bridge. */
export function paletteFor(skin: TemplateSkin): FigurePalette {
  const t = skin.tokens;
  return {
    dark: !!t.dark,
    paper: t.pageBg,
    ink: t.ink,
    muted: t.muted,
    faint: t.faint,
    accent: t.accent,
    tint: t.tint,
    rule: t.rule,
    ruleStrong: t.ruleStrong,
    track: t.track,
    font: skin.fonts.body,
    mono: skin.fonts.mono,
  };
}

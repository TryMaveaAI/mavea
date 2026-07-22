// buildDemoPaletteItems — how the Demo surface resolves the feature registry into palette rows.
// Before this, every feature the Demo couldn't open in place was a dead-end teaser: the row said
// "Opens in Live" and clicking it dropped the user on Live's default screen, never the feature they
// searched for. Now a feature that names a walkthrough chapter becomes a real "Watch" — clicking it
// plays that feature's key-free mini-demo on the real Live surface. Only genuinely data-dependent,
// chapterless features keep the honest "Opens in Live" fallback.
//
// Pure and host-agnostic (the three callbacks come from App) so it's unit-testable without mounting
// the whole demo. See CommandPalette for what `watch` does with a row.
import type { Feature } from './registry';
import type { PaletteItem } from './CommandPalette';

export interface DemoPaletteDeps {
  /** Features the Demo can open in place (visual library, dashboards, the tour itself). */
  direct: Record<string, () => void>;
  /** Build a "play this chapter's mini-demo on Live" action for a feature that names a chapter. */
  watchInLive: (chapterId: string) => () => void;
  /** Fallback for a chapterless, data-dependent feature: hand off to a real Live session. */
  enterLive: () => void;
}

export function buildDemoPaletteItems(features: Feature[], deps: DemoPaletteDeps): PaletteItem[] {
  return features.map((f) => {
    const direct = deps.direct[f.id];
    if (direct) {
      // Opening in place wins as the row's primary action — but a chapter still earns the row
      // its "See how" demo. Rows with and without one otherwise sit inconsistently side by side.
      const watch = f.tourChapter ? deps.watchInLive(f.tourChapter) : undefined;
      return { feature: f, available: true, run: direct, watch };
    }
    if (f.tourChapter) {
      // The row's primary action AND its "Watch" are the same mini-demo — clicking anywhere on it
      // now shows the feature instead of dumping the user on the Live home.
      const play = deps.watchInLive(f.tourChapter);
      return { feature: f, available: true, run: play, watch: play };
    }
    return { feature: f, available: false, reason: 'Opens in Live', run: deps.enterLive };
  });
}

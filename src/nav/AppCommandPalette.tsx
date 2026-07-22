// AppCommandPalette — the ⌘K feature search as it runs on a standalone surface (no live session
// behind it). It resolves the whole feature registry into palette rows the off-Live way: a surface
// that truly opens in place stays a direct link, everything data-dependent hands off to a real Live
// session, and a feature that names a walkthrough chapter plays that chapter as a key-free mini-demo
// on Live. Kept out of `flagship/` on purpose so the standalone hosts (the landing, Dashboards)
// share one off-Live palette instead of the marketing bundle owning it. The registry, the search
// runtime, and this file all stay off the first-paint chunk (lazy-mounted by AppMenuBar).
import { useMemo, type ReactElement } from 'react';
import { preloadRoute } from '../routes';
import { CommandPalette, type PaletteItem } from '../live/features/CommandPalette';
import { buildDemoPaletteItems } from '../live/features/demoPaletteItems';
import { FEATURES } from '../live/features/registry';

interface Props {
  onClose: () => void;
  startTour: () => void;
  watchInLive: (chapterId: string) => () => void;
  enterLive: () => void;
}

export function AppCommandPalette({
  onClose,
  startTour,
  watchInLive,
  enterLive,
}: Props): ReactElement {
  const items = useMemo<PaletteItem[]>(() => {
    // The only rows that open in place off-Live: Dashboards is its own surface, and "How Mavéa
    // works" IS the tour. Everything else names a chapter (→ a mini-demo) or hands off to Live.
    const direct: Record<string, () => void> = {
      dashboards: () => {
        window.location.hash = '#/dashboards';
      },
      how: startTour,
    };

    return buildDemoPaletteItems(FEATURES, { direct, watchInLive, enterLive }).map((item) => ({
      ...item,
      // "How Mavéa works" has no chapter but its "See how" plays the whole tour, so every row
      // carries a demo — none sits without one.
      watch: item.feature.id === 'how' ? startTour : item.watch,
      preload:
        item.feature.id === 'dashboards'
          ? () => preloadRoute('#/dashboards') ?? Promise.resolve()
          : () => preloadRoute('#/live') ?? Promise.resolve(),
    }));
  }, [enterLive, startTour, watchInLive]);

  return <CommandPalette items={items} surface="demo" onClose={onClose} />;
}

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

/** The landing palette's registry and search runtime stay out of the first-paint chunk. */
export function FlagshipCommandPalette({
  onClose,
  startTour,
  watchInLive,
  enterLive,
}: Props): ReactElement {
  const items = useMemo<PaletteItem[]>(() => {
    // Only surfaces that truly open in place stay "direct"; everything else (Ripple included) names
    // a walkthrough chapter, so it gets a uniform "See how" mini-demo rather than a bespoke opener.
    // (The visual gallery is deliberately absent everywhere here: it's an internal QA surface,
    // reachable by URL, not a feature to search for.)
    const direct: Record<string, () => void> = {
      dashboards: () => {
        window.location.hash = '#/dashboards';
      },
      how: startTour,
    };

    return buildDemoPaletteItems(FEATURES, { direct, watchInLive, enterLive }).map((item) => ({
      ...item,
      // "How Mavéa works" IS the tour, so its "See how" plays the whole thing — every row now
      // carries a demo, none excepted.
      watch: item.feature.id === 'how' ? startTour : item.watch,
      preload:
        item.feature.id === 'dashboards'
          ? () => preloadRoute('#/dashboards') ?? Promise.resolve()
          : () => preloadRoute('#/live') ?? Promise.resolve(),
    }));
  }, [enterLive, startTour, watchInLive]);

  return <CommandPalette items={items} surface="demo" onClose={onClose} />;
}

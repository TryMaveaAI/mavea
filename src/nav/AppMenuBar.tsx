// AppMenuBar — Live's topbar menu bar, on a surface that has no live conversation behind it (the
// Dashboards bar today). It renders the same Create · Practice · Share · Explore menus + ⌘K feature
// search Live leads with, reusing Live's own TopbarMenu / TopbarSearchButton so the bar is identical,
// not a lookalike. The menu items resolve the off-Live way (see appMenus): a feature with its own
// surface navigates there, a conversation-only feature opens Live. Every feature is also one
// keystroke away through the search palette, which indexes the whole registry.
import { useCallback, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { TopbarMenu } from '../live/TopbarMenu';
import { TopbarSearchButton } from '../live/features/TopbarSearchButton';
import { useCommandPalette } from '../live/features/useCommandPalette';
import { AsyncSurface } from '../components/AsyncSurface';
import { createPreloadableLazy } from '../lib/preloadableLazy';
import { stashTourMode, stashTourChapter, stashTourSolo } from '../tour/tourEntry';
import { useStudyableCount } from '../live/srs/useStudy';
import { buildAppMenus } from './appMenus';

const palette = createPreloadableLazy(() =>
  import('./AppCommandPalette').then((m) => ({ default: m.AppCommandPalette })),
);
const AppCommandPalette = palette.Component;

interface Props {
  /** Hide the destination that IS this surface, so no menu links to itself
   *  (the Dashboards bar passes '#/dashboards'). */
  omitHash?: string;
}

export function AppMenuBar({ omitHash }: Props): ReactElement {
  const { open, openPalette, closePalette } = useCommandPalette();

  // Every off-Live handoff is a stash-then-navigate to Live — the same moves the landing makes.
  const enterLive = useCallback(() => {
    window.location.hash = '#/live';
  }, []);
  const startTour = useCallback(() => {
    stashTourMode();
    enterLive();
  }, [enterLive]);
  const watchInLive = useCallback(
    (chapterId: string) => () => {
      stashTourMode();
      stashTourChapter(chapterId);
      stashTourSolo();
      enterLive();
    },
    [enterLive],
  );

  const menus = buildAppMenus({ openPalette, enterLive, omitHash });
  // Mirror Live's Practice badge — how many cards a study session would serve right now.
  const srsDue = useStudyableCount();

  return (
    <>
      <TopbarMenu label="Create" items={menus.create} />
      <TopbarMenu label="Practice" items={menus.practice} badge={srsDue} />
      <TopbarMenu label="Share" items={menus.share} />
      <TopbarMenu label="Explore" items={menus.explore} />
      <TopbarSearchButton onOpen={openPalette} preload={palette.preload} />
      {/* The palette is a `position: fixed` full-screen overlay, so it must escape the top bar:
          a bar with `backdrop-filter` becomes the containing block for fixed descendants, which
          would trap the scrim inside the bar-height strip. Portal it to the document root, the
          way Live and the landing mount their palette at the surface root, not in the bar. */}
      {open &&
        createPortal(
          <AsyncSurface label="Feature search" overlay>
            <AppCommandPalette
              onClose={closePalette}
              startTour={startTour}
              watchInLive={watchInLive}
              enterLive={enterLive}
            />
          </AsyncSurface>,
          document.body,
        )}
    </>
  );
}

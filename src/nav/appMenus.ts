// The off-Live twin of Live's topbar menus. Live builds Create / Practice / Share / Explore from
// live session state (the current answer, its frames, SRS due count…); a standalone surface like
// the Dashboards bar has none of that, but should still read as the same menu bar. So this mirrors
// Live's exact categories, labels, order, and wording, and resolves each item the off-Live way:
// a feature with its own surface navigates straight there; a feature that only exists inside a
// conversation (Present / Export / Share a conversation, Atlas, Rehearse…) hands off to Live.
// A category with nothing to show hides itself (TopbarMenu drops empty menus).
import type { TopbarMenuItem } from '../live/TopbarMenu';
import { preloadRoute } from '../routes';
import { PALETTE_SHORTCUT } from '../live/features/paletteShortcut';

export interface AppMenus {
  create: TopbarMenuItem[];
  practice: TopbarMenuItem[];
  share: TopbarMenuItem[];
  explore: TopbarMenuItem[];
}

export interface AppMenuDeps {
  /** Open the ⌘K feature palette (Explore's first item, mirroring Live). */
  openPalette: () => void;
  /** Hand off to Live — for the items that only mean something inside a conversation. */
  enterLive: () => void;
  /** Skip the destination that IS this surface, so a menu never links to itself. */
  omitHash?: string;
}

export function buildAppMenus(deps: AppMenuDeps): AppMenus {
  // A feature with its own route: navigate there, and warm its chunk on hover/focus.
  const route = (label: string, blurb: string, hash: string): TopbarMenuItem => ({
    label,
    blurb,
    onClick: () => {
      window.location.hash = hash;
    },
    preload: () => preloadRoute(hash) ?? Promise.resolve(),
    show: hash !== deps.omitHash,
  });
  // A conversation-only feature: open Live ready to go.
  const inLive = (label: string, blurb: string): TopbarMenuItem => ({
    label,
    blurb,
    onClick: deps.enterLive,
    show: true,
  });

  return {
    create: [inLive('New', 'Start a fresh session')],
    practice: [
      inLive('Rehearse', 'Practice a hard conversation — take the seat, or send your Mavéa'),
      // In Live these are two entries (Review goes THROUGH the cards, Manage flashcards organises
      // them); out here both land on the same page, so offering them twice is just a longer menu.
      route('Review', 'Go through your flashcards, and organize your decks', '#/flashcards'),
      route(
        'Courses',
        'Turn a topic into a structured syllabus — a lesson at a time, at your pace',
        '#/courses',
      ),
    ],
    share: [
      inLive('Present', 'Fill the room — the chrome falls away, the mic stays live'),
      inLive('Export', 'Turn this answer into a presentation deck or a designed document'),
      inLive('Share', 'Share this conversation as a story'),
    ],
    explore: [
      {
        // First, like Live: the palette is the index of every feature, so a "where do I find X"
        // scan hits it immediately (it's also the persistent Search button's twin).
        label: 'Search all features',
        blurb: `Browse Mavéa’s feature index · ${PALETTE_SHORTCUT}`,
        onClick: deps.openPalette,
        show: true,
      },
      inLive('Atlas', 'Kept conversations and topics, as a place'),
      inLive('Watch me think', 'A live map of your thinking'),
      route('Prism', 'Split your document into a map of its claims', '#/prism'),
      route(
        'Ripple',
        'Model a code change’s impact, its risks, and what to check first',
        '#/ripple',
      ),
      route(
        'Dashboards',
        'Dashboards that refresh on schedule while Mavéa is open',
        '#/dashboards',
      ),
      route('Deep Zoom', 'Telescope any topic from big picture to finest detail', '#/deepzoom'),
    ],
  };
}

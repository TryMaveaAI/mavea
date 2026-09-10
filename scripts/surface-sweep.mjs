// surface-sweep.mts — WHAT the geometry suite visits: every surface, the state worth measuring on
// each, and the window shapes it is measured at. Data only, so a test can hold it against the route
// table (src/routeTable.ts): a gate cannot see a surface it does not visit, and the failure mode of a
// hand-kept list is a new route that nobody remembered to add a row for.
//
// Every row names the route prefix it covers. Live's takeovers (the board, the Lens, the Study,
// Focus) are states of `#/live` reached by clicks and `?view=`, so several rows share one prefix;
// the dev-only labs are rows too (`lab: true`) — swept in full mode, never in the per-push or fast
// subsets, because they are QA harnesses rather than anywhere a reader lands.

/**
 * @typedef {object} Surface
 * @property {string} key
 * @property {string} label
 * @property {string} route     The route prefix this row covers; '' is the landing.
 * @property {string} hash      Where it lives, relative to the base URL.
 * @property {string} ready     Rendered when the surface is ready to measure.
 * @property {string[]} [click] Accessible names to click, in order, to reach the state worth measuring.
 * @property {string} [reading] The element whose height is the reading column, when the surface has one.
 * @property {number} [settleMs] Extra settle time for a surface that animates itself in.
 * @property {string[]} [owns]  Source prefixes that belong to this surface alone. A changed file under
 *   one of them re-checks only the rows that own it; a file under none of them (shared chrome, tokens,
 *   the block library) re-checks every row.
 * @property {boolean} [lab]    A dev-only QA harness.
 */

const LIVE = ['src/live/', 'src/canvas/', 'src/tour/', 'src/demo/'];

/** @type {Surface[]} */
export const SURFACES = [
  {
    key: 'landing',
    label: 'Landing',
    route: '',
    hash: '',
    ready: '.fl-landing',
    settleMs: 2500,
    owns: ['src/flagship/'],
  },
  {
    key: 'live',
    label: 'Live (empty)',
    route: '#/live',
    hash: '#/live',
    ready: '.mavea-app',
    reading: '.canvas-scroll',
    owns: LIVE,
  },
  {
    key: 'board',
    // Every view row names itself in the URL. The curated replay re-asserts its own view on each
    // step, so a row that only clicks "Start demo" measures whatever the script is showing —
    // which is how this row and the two below were all measuring the desk.
    label: 'Answer · the board',
    route: '#/live',
    hash: '#/live?demo=dev&view=board',
    ready: '.mavea-app',
    click: ['Start demo'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
    owns: LIVE,
  },
  {
    key: 'lens',
    // The Lens is a STATE of the board, not a view of its own — but it is the state with new
    // layout in it (one card forward, the rest dimmed, notes beside it), so it needs its own row.
    // The settle is short on purpose: the curated replay moves on after a few seconds and takes
    // the spotlight back, and a row that measures the board while claiming to measure the Lens is
    // worse than no row at all.
    label: 'Answer · the Lens',
    route: '#/live',
    hash: '#/live?demo=dev&view=board',
    ready: '.mavea-app',
    click: ['Start demo', 'Look closer'],
    reading: '.canvas-scroll',
    settleMs: 2500,
    owns: LIVE,
  },
  {
    key: 'study',
    label: 'Answer · Study',
    route: '#/live',
    hash: '#/live?demo=dev&view=study',
    ready: '.mavea-app',
    click: ['Start demo'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
    owns: LIVE,
  },
  {
    key: 'focus',
    // Focus has no control of its own now — Present drives it, plus ⌘K.
    label: 'Answer · Focus',
    route: '#/live',
    hash: '#/live?demo=dev&view=focus',
    ready: '.mavea-app',
    click: ['Start demo'],
    reading: '.canvas-scroll',
    settleMs: 14_000,
    owns: LIVE,
  },
  {
    key: 'tour',
    // The key-free walkthrough: its own panel, transport and coach over the board.
    label: 'Walkthrough',
    route: '#/live',
    hash: '#/live?tour=1',
    ready: '.mavea-app',
    reading: '.canvas-scroll',
    settleMs: 6000,
    owns: LIVE,
  },
  {
    key: 'ripple',
    label: 'Ripple',
    route: '#/ripple',
    hash: '#/live?ripple=1',
    ready: '.ripple-panel',
    settleMs: 3000,
    owns: ['src/live/ripple/'],
  },
  {
    key: 'deepzoom',
    label: 'Deep Zoom',
    route: '#/deepzoom',
    hash: '#/deepzoom?demo=1',
    ready: '.dz-topbar',
    settleMs: 2500,
    owns: ['src/live/deepzoom/'],
  },
  {
    key: 'gallery',
    label: 'Gallery',
    route: '#/gallery',
    hash: '#/gallery',
    ready: '.vlib-body',
    settleMs: 2500,
    owns: ['src/gallery/', 'src/canvas/'],
  },
  {
    key: 'legal',
    label: 'Legal',
    route: '#/legal',
    hash: '#/legal',
    ready: '.legal-app',
    owns: ['src/legal/'],
  },
  {
    key: 'prism',
    label: 'Prism',
    route: '#/prism',
    hash: '#/prism',
    ready: '.prism-app',
    settleMs: 2500,
    owns: ['src/live/prism/'],
  },
  {
    key: 'synthesis',
    label: 'Synthesis (empty)',
    route: '#/synthesis',
    hash: '#/synthesis',
    ready: '.prism-app',
    owns: ['src/live/prism/'],
  },
  {
    // ?demo=1 opens straight into the mapped overlay, past the .prism-app shell — so the settled
    // corpus is a different surface from the dropzone, and both are states a reader reaches.
    key: 'synthesis-map',
    label: 'Synthesis · mapped',
    route: '#/synthesis',
    hash: '#/synthesis?demo=1',
    ready: '.syn-lenses',
    settleMs: 4000,
    owns: ['src/live/prism/'],
  },
  {
    key: 'dashboards',
    label: 'Dashboards',
    route: '#/dashboards',
    hash: '#/dashboards',
    ready: '.dash-app',
    owns: ['src/live/dashboards/'],
  },
  {
    key: 'flashcards',
    label: 'Flashcards',
    route: '#/flashcards',
    hash: '#/flashcards',
    ready: '.fc-app',
    owns: ['src/live/srs/'],
  },
  {
    key: 'courses',
    label: 'Courses',
    route: '#/courses',
    hash: '#/courses',
    ready: '.cr-app',
    owns: ['src/live/course/'],
  },
  {
    key: 'course',
    label: 'Course reader',
    route: '#/course',
    hash: '#/course',
    ready: '.clr-app',
    owns: ['src/live/course/', 'src/canvas/'],
  },
  {
    key: 'terms',
    label: 'Terms',
    route: '#/terms',
    hash: '#/terms',
    ready: '.legal-app',
    owns: ['src/legal/'],
  },
  {
    key: 'privacy',
    label: 'Privacy',
    route: '#/privacy',
    hash: '#/privacy',
    ready: '.legal-app',
    owns: ['src/legal/'],
  },
  // ── dev-only labs ──
  {
    key: 'reel',
    label: 'Reel gallery (lab)',
    route: '#/reel',
    hash: '#/reel',
    ready: '#root > *',
    settleMs: 3000,
    owns: ['src/clip/'],
    lab: true,
  },
  {
    key: 'slidelab',
    label: 'Slide lab',
    route: '#/slidelab',
    hash: '#/slidelab',
    ready: '#root > *',
    settleMs: 4000,
    owns: ['src/slides/'],
    lab: true,
  },
  {
    key: 'exportlab',
    label: 'Export lab',
    route: '#/exportlab',
    hash: '#/exportlab',
    ready: '#root > *',
    settleMs: 4000,
    owns: ['src/export/'],
    lab: true,
  },
  {
    key: 'synlab',
    label: 'Synthesis lab',
    route: '#/synlab',
    hash: '#/synlab',
    ready: '.syn-lenses',
    settleMs: 4000,
    owns: ['src/live/prism/'],
    lab: true,
  },
  {
    key: 'pageviewlab',
    label: 'Page view lab',
    route: '#/pageviewlab',
    hash: '#/pageviewlab',
    ready: '.prism-page-wrap',
    settleMs: 2500,
    owns: ['src/live/prism/'],
    lab: true,
  },
  {
    key: 'mindlab',
    label: 'Mind lab',
    route: '#/mindlab',
    hash: '#/mindlab',
    ready: '.mindlab-bar',
    settleMs: 3000,
    owns: ['src/live/mindshape/', 'src/canvas/blocks/diagrams/'],
    lab: true,
  },
  {
    key: 'whylab',
    label: 'Why lab',
    route: '#/whylab',
    hash: '#/whylab',
    ready: '.wm-panel',
    settleMs: 3000,
    owns: ['src/live/why/'],
    lab: true,
  },
  {
    key: 'worldlab',
    label: 'World lab',
    route: '#/worldlab',
    hash: '#/worldlab',
    ready: '.wl-root',
    settleMs: 4000,
    owns: ['src/live/world/', 'src/canvas/spatial/'],
    lab: true,
  },
];

/** Route prefixes with no row in the sweep — the list a test holds at zero. */
/** @param {string[]} prefixes @returns {string[]} */
export function uncoveredRoutes(prefixes) {
  const covered = new Set(SURFACES.map((s) => s.route));
  return prefixes.filter((p) => !covered.has(p));
}

/** The rows a set of changed files can have moved, or null when a change touched something every
 *  surface shares. A file under a row's own prefix re-checks that row; when two rows claim
 *  overlapping prefixes (`src/live/` and `src/live/prism/`), the more specific claim wins, so a
 *  Prism edit does not drag five 14-second Live rows into a fast pass. */
/** @param {string[]} changedFiles @returns {Set<string> | null} */
export function surfacesTouchedBy(changedFiles) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const file of changedFiles) {
    let best = 0;
    /** @type {{ key: string; len: number }[]} */
    const claims = [];
    for (const s of SURFACES) {
      for (const prefix of s.owns ?? []) {
        if (file.startsWith(prefix)) {
          claims.push({ key: s.key, len: prefix.length });
          best = Math.max(best, prefix.length);
        }
      }
    }
    if (!claims.length) return null;
    for (const c of claims) if (c.len === best) keys.add(c.key);
  }
  return keys;
}

/** The widths the suite measures at: the phone, tablet, laptop and desktop shapes readers actually
 *  hold, plus the two wide ones where a design that only knows how to grow shows it. */
export const WIDTHS = [320, 375, 414, 768, 834, 1024, 1280, 1366, 1440, 1536, 1920, 2560, 3440];

/** The height that goes with a width: a phone's real height, 620 for the short laptop (the shape a
 *  1440×900 sweep never finds), 1080 from 1920 up, and 900 otherwise. */
/** @param {number} width @returns {number} */
export function heightFor(width) {
  if (width <= 320) return 568;
  if (width <= 375) return 812;
  if (width <= 414) return 896;
  if (width <= 768) return 1024;
  if (width <= 834) return 1194;
  if (width === 1366) return 620;
  if (width >= 1920) return 1080;
  return 900;
}

/** `WxH` for every sweep width. */
export const DEFAULT_SIZES = WIDTHS.map((w) => `${w}x${heightFor(w)}`);

/** The two sizes also swept zoomed: the common laptop and the common desktop. */
export const ZOOM_SIZES = ['1366x620', '1920x1080'];
export const ZOOM_DPRS = [1.25, 1.5];

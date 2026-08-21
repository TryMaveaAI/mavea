// startWithIds — which capabilities the Go hub offers as a way to BEGIN, and the one row whose
// behaviour depends on what is staged.
//
// Its own module, and deliberately NOT in features/registry.ts: the landing page imports the
// registry for its own palette, so a Live-only curation list parked there rides into the eager
// landing bundle for a surface that has no launcher. (Measured — the landing sits within ~20 bytes
// of its gzip budget, so "it's only a few ids" is not an argument that survives contact.)
//
// It is still one source of truth: `tests/feature-registry-sync` checks every id against FEATURES,
// so a renamed or removed feature fails CI rather than painting a card that does nothing.

/**
 * The order they appear in.
 *
 * Deliberately not everything the registry declares: "Present", "Export" and "Track this" act on an
 * answer that does not exist yet, and a row promising something to see when there is nothing is
 * worse than no row at all.
 */
export const START_WITH_IDS: readonly string[] = [
  'pdf-world', // Prism — the paperclip used to be its only route in
  'just-listen',
  'watch-me-think',
  'deepzoom',
  'delegate',
  'courses',
  'synthesis',
  'ripple',
];

/** What the Prism row says and does, given the explodable documents staged right now.
 *
 * Pure, because the trap it fixes was a state machine nobody could see. On a new conversation the
 * real attach strip is hidden with the rest of the dock, so a document picked here leaves no trace
 * — and the row, left generic, silently re-opened that first file on every later visit with nothing
 * on screen explaining why or how to choose another. The row now names the file it will open.
 */
export function prismRow(staged: readonly { name: string }[]): {
  blurb: string;
  opensPicker: boolean;
} {
  if (staged.length === 0) {
    return {
      blurb: 'Choose a PDF, Office doc, or data file to map its claims',
      opensPicker: true,
    };
  }
  return {
    blurb:
      staged.length === 1
        ? `Open the map for ${staged[0].name}`
        : `Open the map across ${staged.length} documents`,
    opensPicker: false,
  };
}

/**
 * The launcher rows that genuinely need the live conversation surface, because what they start
 * lives in the dock the wizard hides.
 *
 * Everything else opens a full-page overlay at the app root, or navigates away entirely — neither
 * needs the wizard dismissed, and dismissing it was actively harmful: it set the session started
 * with no turn behind it, so closing the overlay landed on an empty stage that was neither the hub
 * nor an answer, with half the menus gone because they key off having one.
 */
export const NEEDS_LIVE_SURFACE: ReadonlySet<string> = new Set(['just-listen', 'watch-me-think']);

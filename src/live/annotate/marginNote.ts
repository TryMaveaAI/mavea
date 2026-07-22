// marginNote.ts — the pure text + layout math behind Mavéa's margin notes: the persistent
// asides a muted walk writes beside the cards it visits (the gutter rail in Everything view,
// the trail column in Focus). Rendering lives in MarginNoteRail / FocusStage; this module is
// DOM-free and unit-tested.
//
// A note is a margin scrawl, not a paragraph: the first sentence, cut on a word boundary. The
// first written-aside feature handwrote whole lines over card content and was pulled for it —
// notes now live only in reserved margin space, so the text math here is about reading rhythm,
// not collision safety.

/** Cap on a condensed note — about four clamped lines of the note card at rail width. */
const NOTE_MAX_CHARS = 140;

/** One written aside, in walk order. `spot` is the card's data-spot-id — the tether target in
 *  the gutter rail, and the jump-to-card handle in the Focus trail. */
export interface WalkNote {
  spot: string;
  text: string;
}

/** The first sentence of `line`, cut on a word boundary at ~`max` chars with an ellipsis.
 *  A real terminator must be followed by space/end, so "3.5%" never splits a sentence.
 *  Empty/whitespace input condenses to ''. */
export function condenseForNote(line: string, max = NOTE_MAX_CHARS): string {
  const text = line.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const sentence = /^(.*?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max + 1);
  const atWord = cut.lastIndexOf(' ');
  return (atWord > 0 ? cut.slice(0, atWord) : cut.slice(0, max)).replace(/[,;:\s]+$/, '') + '…';
}

/** Stack rail notes without overlap: each note wants to sit level with its card (`top`), and a
 *  later note is pushed down until it clears the one above — its full `height` plus `gap`.
 *  Heights are per-note because notes render their WHOLE text (never clamped: a cut-off aside
 *  reads as a bug, not restraint), so a long note simply takes more of the rail. Returns the
 *  final tops in input order. With `maxBottom`, a run that would spill past the grid's bottom
 *  is lifted back up as one block (never past the top), so the last note stays on the canvas. */
export function layoutNotes(
  anchors: readonly { top: number; height?: number }[],
  gap = 12,
  maxBottom?: number,
): number[] {
  if (anchors.length === 0) return [];
  const order = anchors
    .map((a, i) => ({ top: a.top, h: a.height ?? 84, i }))
    .sort((a, b) => a.top - b.top || a.i - b.i);
  const tops = new Array<number>(anchors.length).fill(0);
  let cursor = -Infinity;
  let lastBottom = -Infinity;
  for (const { top, h, i } of order) {
    const t = Math.max(top, cursor);
    tops[i] = t;
    cursor = t + h + gap;
    lastBottom = t + h;
  }
  if (maxBottom !== undefined && lastBottom > maxBottom) {
    // Lift the whole run by the overflow (bounded by the highest note's own top) — every gap
    // stays intact while the stack pulls back onto the canvas.
    const lift = Math.min(lastBottom - maxBottom, Math.max(0, Math.min(...tops)));
    if (lift > 0) for (let i = 0; i < tops.length; i++) tops[i] -= lift;
  }
  return tops;
}

// Node/center labels in the constellation-style finishes are raw SVG <text> — there's no DOM flow to
// wrap them and no bounding box for FitScale (the reel's uniform downscale safety net) to measure, so
// an oversized label just paints past its intended spot and depends entirely on the padded viewBox +
// `overflow: hidden` clip to hide the mess. This module makes that overflow unreachable in the first
// place, with the same PRECOMPUTED approach fitText.ts takes for its own type ramps: no
// `getComputedTextLength()` (untestable in jsdom, and timing-dependent on font load) — just
// character-count math against a measured average glyph width, so the same result holds in the
// browser, the rasterizer, and a plain unit test.

/**
 * Average glyph width as a fraction of font-size (em), for the finishes' bold/semibold SVG label font
 * (`var(--reel-sans)` at weight 600–700). Matches the ~0.55–0.6em/glyph convention fitText.ts derives
 * its own ru↔rw ladder capacities from (see that file's "Capacity math" comment) — heavier weights
 * sit at the top of that measured range, hence 0.58 rather than 0.55.
 */
export const GLYPH_WIDTH_RATIO = 0.58;

/** Estimated rendered width, in the caller's own viewBox units, of `text` set at `sizePx`. */
export function estWidth(text: string, sizePx: number): number {
  return text.length * sizePx * GLYPH_WIDTH_RATIO;
}

/** A label at or under this length reads fine on one line — no need to split it. */
const SPLIT_THRESHOLD = 10;

/**
 * Break a label into one or two lines. A label past `SPLIT_THRESHOLD` splits at the whitespace
 * nearest the string midpoint, so both halves read as whole words; a run with no whitespace (rare —
 * `clampToken` upstream already guarantees no unbroken run over ~24 chars reaches here) falls back to
 * a hard midpoint cut.
 */
export function splitTwoLines(text: string): string[] {
  if (text.length <= SPLIT_THRESHOLD) return [text];
  const mid = text.length / 2;
  let breakAt = -1;
  let closest = Infinity;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ' ') continue;
    const dist = Math.abs(i - mid);
    if (dist < closest) {
      closest = dist;
      breakAt = i;
    }
  }
  if (breakAt === -1) {
    const cut = Math.round(mid);
    return [text.slice(0, cut), text.slice(cut)];
  }
  return [text.slice(0, breakAt), text.slice(breakAt + 1)];
}

/** Size ladder for SVG labels, largest first — shared by every finish so a node/center pill and an
 *  axis label degrade the same way under the same pressure. */
export const LABEL_SIZE_LADDER: readonly number[] = [12, 10.5, 9];

/**
 * Collapse the middle of an over-long line to an ellipsis, keeping head + tail context — the same
 * "replace the middle" scheme as `reelScript.ts`'s `clampToken`, sized to a caller-given budget
 * instead of a fixed run length. A true last resort: the per-slot `CHAR_BUDGET` ceilings, `clampToken`
 * itself, and the size ladder above should already have landed the label inside `maxChars` before this
 * ever fires — it exists for correctness, not because it's expected to run.
 */
export function middleEllipsis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.max(0, Math.floor(maxChars / 2) - 1);
  const tail = Math.max(0, maxChars - head - 1);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export interface LabelFit {
  lines: string[];
  size: number;
}

/**
 * The one entry point the finishes call: split, then pick the largest ladder size whose longest
 * resulting line fits `availableWidth` — the caller's honest, geometry-derived usable width (a
 * circle/pill's usable chord, an axis label's clearance to the viewBox edge — see `centeredLabelWidth`
 * / `edgeLabelWidth` below). If even the floor size overflows, `middleEllipsis` trims each line to
 * what that floor size can actually hold — the belt-and-suspenders case that should never fire given
 * the upstream guards.
 */
export function fitLabel(text: string, availableWidth: number): LabelFit {
  const lines = splitTwoLines(text);
  for (const size of LABEL_SIZE_LADDER) {
    if (lines.every((line) => estWidth(line, size) <= availableWidth)) return { lines, size };
  }
  const floor = LABEL_SIZE_LADDER[LABEL_SIZE_LADDER.length - 1];
  const maxChars = Math.max(1, Math.floor(availableWidth / (floor * GLYPH_WIDTH_RATIO)));
  return { lines: lines.map((line) => middleEllipsis(line, maxChars)), size: floor };
}

/**
 * Usable width for a `text-anchor: middle` label centered at `anchorX` inside a `[viewMinX, viewMaxX]`
 * viewBox — twice the SHORTER clearance to whichever edge is nearer, less a small margin so the
 * estimated glyph run doesn't kiss the border. This is the actual constraint the padded viewBox exists
 * to enforce, so it's what "available width" honestly means for a centered node or center label.
 */
export function centeredLabelWidth(
  anchorX: number,
  viewMinX: number,
  viewMaxX: number,
  margin = 12,
): number {
  return 2 * Math.min(anchorX - viewMinX, viewMaxX - anchorX) - margin;
}

/**
 * Usable width for a `text-anchor: start`/`end` label anchored at `anchorX` — the label only grows
 * toward ONE viewBox edge, so its clearance is one-sided rather than doubled.
 */
export function edgeLabelWidth(
  anchorX: number,
  viewMinX: number,
  viewMaxX: number,
  anchor: 'start' | 'end',
  margin = 6,
): number {
  return (anchor === 'start' ? viewMaxX - anchorX : anchorX - viewMinX) - margin;
}

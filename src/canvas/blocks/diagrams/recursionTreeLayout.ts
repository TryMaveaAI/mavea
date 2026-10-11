// RecursionTree sizing, measured from the longest call and result so siblings never touch.

// Both labels are monospace, so a character is ~0.6em wide at any content.
const MONO_ADVANCE = 0.6;

const CALL_FS = 14;

const BADGE_FS = 11;

const BOX_MIN_W = 96;

const BOX_PAD = 16;

const BADGE_MIN_W = 40;

const BADGE_PAD = 14;

/** How far the badge's centre sits in from the box's right edge; the rest of it hangs outside. */
export const BADGE_INSET = 6;

/** Clear air between two neighbouring calls, badge included. */
const SIBLING_GAP = 20;

export const CALL_MAX_CHARS = 16;

export const BADGE_MAX_CHARS = 8;

export interface TreeMetrics {
  boxW: number;
  badgeW: number;
  /** Centre-to-centre distance between adjacent leaf slots. */
  pitch: number;
}

/** Box, badge and slot sizes measured from the tree's own longest call and result. The pitch
 *  is the box plus whatever of the badge hangs past its right edge plus real air — a fixed 108
 *  left 12 units between 96-wide boxes, and the overhanging badges filled even that. */
export function treeMetrics(calls: string[], results: string[]): TreeMetrics {
  const longest = (xs: string[], cap: number) =>
    Math.min(cap, Math.max(0, ...xs.map((x) => x.length)));
  const boxW = Math.max(
    BOX_MIN_W,
    longest(calls, CALL_MAX_CHARS) * CALL_FS * MONO_ADVANCE + BOX_PAD,
  );
  const badgeW = Math.max(
    BADGE_MIN_W,
    longest(results, BADGE_MAX_CHARS) * BADGE_FS * MONO_ADVANCE + BADGE_PAD,
  );
  const overhang = Math.max(0, badgeW / 2 - BADGE_INSET);
  return { boxW, badgeW, pitch: boxW + overhang + SIBLING_GAP };
}

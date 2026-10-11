// The FiveForces hub caption, fitted to the circle's chord at each line's height.
import { estimateTextWidth, fitText } from '../../lib/fitText';

export const HUB_R = 62;

/** The hub caption's size — must track .ff-hub-sub. */
const HUB_SUB_FS = 15.5;

/** Clear air between a hub line's ends and the disc's rim. */
const HUB_INSET = 6;

/** How wide the hub disc is across a line whose glyphs run from `top` to `bottom` (offsets from
 *  the centre), less the inset: the narrowest chord the line crosses. */
function hubChord(top: number, bottom: number): number {
  const y = Math.max(Math.abs(top), Math.abs(bottom));
  return 2 * Math.sqrt(Math.max(0, HUB_R * HUB_R - y * y)) - HUB_INSET * 2;
}

export interface HubLayout {
  sub: string[];
  /** Baselines, as offsets from the hub centre. */
  titleY: [number, number];
  subY: number[];
  strengthY: number;
}

/** The hub's text stack, laid out from the industry caption's own length. A caption the disc
 *  can carry on one line keeps the roomy spacing; a longer one gets a second line and the stack
 *  tightens around it, each line fitted to the chord it actually crosses — a twelve-character
 *  cap showed "AI coding assistants" as "AI coding…" in a disc with room for both words. */
export function hubLayout(industry: string): HubLayout {
  const text = industry.trim() || 'this market';
  const asc = HUB_SUB_FS * 0.72;
  const desc = HUB_SUB_FS * 0.2;
  const one = { titleY: [-22, -1] as [number, number], subY: [19], strengthY: 38 };
  if (estimateTextWidth(text, HUB_SUB_FS) <= hubChord(19 - asc, 19 + desc)) {
    return { ...one, sub: [text] };
  }
  const two = { titleY: [-29, -10] as [number, number], subY: [8, 25], strengthY: 43 };
  const maxWidth = Math.min(...two.subY.map((b) => hubChord(b - asc, b + desc)));
  const { lines } = fitText(text, { maxWidth, fontSize: HUB_SUB_FS, minFontSize: HUB_SUB_FS });
  if (lines.length <= 2) return { ...two, sub: lines };
  let last = `${lines[1]} ${lines[2]}`;
  while (last.length > 1 && estimateTextWidth(`${last}…`, HUB_SUB_FS) > maxWidth) {
    last = last.slice(0, -1);
  }
  return { ...two, sub: [lines[0], `${last.trimEnd()}…`] };
}

// ── satellite boxes ──
// Every size here is in viewBox user units and has to track the type sizes in styles.css.

export const VB_W = 512;
export const BOX_W_MAIN = 240; // N/S: nothing else shares their row
export const BOX_W_SIDE = 160; // E/W: each splits its row with the hub

export const SLOT_H = 25; // slot-label strip at the top
export const LABEL_LINE_H = 22;
export const NOTE_LINE_H = 20;
const STRENGTH_ROW_H = 25; // bottom strip reserved for the strength badge
export const BOX_PAD_BOTTOM = 10;
/** Clear air between a wrapped line and either side of its box; the left side also carries
 *  the 4-unit strength bar. */
const BOX_PAD_X = 12;

const LABEL_FS = 16.5; // .ff-box-lbl
const NOTE_FS = 15.5; // .ff-box-note

// Generous on purpose: a box grows to hold what the model wrote, and these only stop a
// paragraph pasted into a note from running the figure off the card.
const MAX_LABEL_LINES = 3;
const MAX_NOTE_LINES = 8;

/** Clear space a connector crosses, between the two shapes it joins. */
const ARM_GAP = 26;
const VB_MARGIN = 9; // breathing room outside the outermost box edge

/** `text` wrapped to `width` at its real size, cut at a word with an ellipsis only past
 *  `maxLines` — the same rule the causation chain's cards follow. */
function measuredLines(
  text: string,
  width: number,
  fontSize: number,
  bold: boolean,
  maxLines: number,
): { lines: string[]; cut: boolean } {
  const { lines } = fitText(text, { maxWidth: width, fontSize, minFontSize: fontSize, bold });
  if (lines.length <= maxLines) return { lines, cut: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.includes(' ') && estimateTextWidth(`${last}…`, fontSize, bold) > width) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[maxLines - 1] = last.replace(/[\s.,;:…–—-]+$/, '') + '…';
  return { lines: kept, cut: true };
}

export interface BoxText {
  labelLines: string[];
  noteLines: string[];
  /** Whether either string had to be cut, so the box can carry the whole text as a tooltip. */
  cut: boolean;
  h: number;
}

/** A satellite's label and note wrapped to its own width, and the height that holds them. A
 *  narrow E/W box gets more lines rather than a shorter note: a character budget used to cut
 *  "A handful of frontier labs set the price and the pace." after its third line. */
export function boxText(label: string, note: string, w: number): BoxText {
  const width = w - BOX_PAD_X * 2;
  const lbl = measuredLines(label, width, LABEL_FS, true, MAX_LABEL_LINES);
  const nt = note
    ? measuredLines(note, width, NOTE_FS, false, MAX_NOTE_LINES)
    : { lines: [], cut: false };
  const noteH = nt.lines.length > 0 ? nt.lines.length * NOTE_LINE_H + 4 : 0;
  return {
    labelLines: lbl.lines,
    noteLines: nt.lines,
    cut: lbl.cut || nt.cut,
    h: SLOT_H + lbl.lines.length * LABEL_LINE_H + noteH + STRENGTH_ROW_H + BOX_PAD_BOTTOM,
  };
}

export interface BoxHeights {
  n?: number;
  s?: number;
  /** The taller of the E/W pair, if either is drawn. */
  side?: number;
}

export interface Frame {
  vbH: number;
  cy: number;
  /** Hub centre → E/W box centre. */
  radiusH: number;
  /** Hub centre → the near edge of the N and S boxes. */
  reachV: number;
}

/** The figure's frame, built from the boxes it actually draws. The N/S boxes overlap the E/W
 *  pair horizontally, so they have to sit beyond the taller side box as well as the hub; the
 *  height then follows from what is above and below. Sizing it from the tallest box a wrap
 *  budget allowed was only safe while that budget also cut the notes short. */
export function forceFrame({ n, s, side }: BoxHeights): Frame {
  const core = Math.max(HUB_R, (side ?? 0) / 2);
  const reachV = core + ARM_GAP;
  const up = n == null ? core : reachV + n;
  const down = s == null ? core : reachV + s;
  return {
    vbH: up + down + VB_MARGIN * 2,
    cy: VB_MARGIN + up,
    radiusH: HUB_R + ARM_GAP + BOX_W_SIDE / 2,
    reachV,
  };
}

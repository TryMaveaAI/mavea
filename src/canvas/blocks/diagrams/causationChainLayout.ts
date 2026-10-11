// CausationChain card text: how a node's label wraps and how tall that makes its card.
import { estimateTextWidth, fitText } from '../../lib/fitText';

export const COL_W = 190; // cause / consequence card width

const CARD_H = 46; // node card height for up to two lines; a third line grows the card

export const NODE_LH = 13; // line height for a wrapped node label

/** The label's measuring size: the top of .cau-node-lbl's --fs-2xs clamp, so the estimate errs
 *  toward wrapping a little early rather than running past the card's edge. */
const NODE_FS = 10.5;

export const NODE_TEXT_X = 14; // label inset from the card's left edge (past the term rail)

const NODE_TEXT_W = COL_W - NODE_TEXT_X - 20; // the right 20 keeps clear of the term dot

const NODE_MAX_LINES = 3;

const NODE_PAD_Y = 20; // card height beyond its lines

/** A node label wrapped by measured width to at most three lines. Only a label that still
 *  overruns is cut, at a word, and trailing punctuation goes with it so "vs." never meets the
 *  ellipsis as four dots. */
export function nodeLines(label: string): string[] {
  const { lines } = fitText(label, {
    maxWidth: NODE_TEXT_W,
    fontSize: NODE_FS,
    minFontSize: NODE_FS,
    bold: true,
  });
  if (lines.length <= NODE_MAX_LINES) return lines;
  const kept = lines.slice(0, NODE_MAX_LINES);
  let last = kept[NODE_MAX_LINES - 1];
  while (last.includes(' ') && estimateTextWidth(`${last}…`, NODE_FS, true) > NODE_TEXT_W) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[NODE_MAX_LINES - 1] = last.replace(/[\s.,;:…–—-]+$/, '') + '…';
  return kept;
}

/** Two lines fit the standard card; each further line grows it by one line. */
export function cardHeight(lineCount: number): number {
  return Math.max(CARD_H, lineCount * NODE_LH + NODE_PAD_Y);
}

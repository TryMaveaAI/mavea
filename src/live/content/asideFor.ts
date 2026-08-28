// asideFor.ts — what Mavéa writes in the margin, in her own voice rather than the card's.
//
// The first version of the room's margin note condensed the block's OWN summary, which moved text
// without adding a voice: the card already said it, usually in the same words. An aside has to
// carry something the card structurally cannot say about itself, and the one thing Mavéa knows
// that no block does is WHICH OF ITS FIGURES SHE CAN ACTUALLY BACK.
//
// So the aside is the honest read: the figures a source sentence really states, and the ones that
// are the model's shape rather than anyone's measurement. That admission is the whole point — a
// card never volunteers its own weak spots, and a machine that does is the reason to trust the
// ones it does stand behind.
//
// Pure and DOM-free: it reads a ContentGraph (content/fromAnswer) and returns a sentence, or null
// when it has nothing honest to say. Never invents a figure — every number it prints is a figure's
// own rendered text, taken from the registry that resolved it.
import { rawOf } from '../trust/display';
import { statusOf } from '../trust/types';
import type { ContentGraph } from './types';

/** Ids are `block:<index>:<key>` (fromAnswer's blockValueId) — the index is how a figure finds its
 *  way back to the object it is printed on. */
const BLOCK_VALUE_ID = /^block:(\d+):/;

/** How many figures the aside will name before it stops listing and starts counting. Two reads as
 *  a remark; four reads as an inventory, and an inventory is not something a person says. */
const NAME_CAP = 2;

export interface Aside {
  text: string;
  /** True when the aside is reporting something it cannot stand behind — the surface may want to
   *  mark it differently (a scrawled question rather than a confident underline). */
  flagged: boolean;
}

function listOf(raws: readonly string[]): string {
  if (raws.length === 1) return raws[0];
  if (raws.length === 2) return `${raws[0]} and ${raws[1]}`;
  return `${raws.slice(0, NAME_CAP).join(', ')} and ${raws.length - NAME_CAP} more`;
}

/**
 * The aside for one block of an answer, or null when there is nothing honest to add.
 *
 * Null is a real and common answer: a block carrying no readable figures (prose, a list, a
 * diagram) has nothing for this to be about, and a made-up remark would be worse than silence —
 * the surface falls back to the block's own words.
 */
export function asideFor(graph: ContentGraph, blockIndex: number): Aside | null {
  const grounded: string[] = [];
  const unbacked: string[] = [];

  for (const [id, value] of graph.trust.values) {
    const match = BLOCK_VALUE_ID.exec(id);
    if (!match || Number(match[1]) !== blockIndex) continue;
    const status = statusOf(value);
    // A structure value never had a number, so it is neither backed nor unbacked — it is not a
    // claim at all, and counting it either way would misreport the block.
    if (status === 'structure') continue;
    (status === 'illustrative' ? unbacked : grounded).push(rawOf(value));
  }

  if (grounded.length === 0 && unbacked.length === 0) return null;

  // A textbook shape is honestly illustrative WHOLESALE — saying "I can't back the 9.8" about a
  // worked example reads as a defect when it is the genre.
  if (graph.illustrative) {
    return {
      text: 'These figures illustrate the shape — they are not a measurement.',
      flagged: true,
    };
  }

  if (unbacked.length === 0) {
    return {
      text:
        grounded.length === 1
          ? `${listOf(grounded)} traces back to your sources.`
          : `Every figure here traces back to your sources.`,
      flagged: false,
    };
  }

  if (grounded.length === 0) {
    return {
      text: `Nothing states ${listOf(unbacked)} — I'm illustrating, not measuring.`,
      flagged: true,
    };
  }

  return {
    text: `${listOf(grounded)} I can point to in your sources. ${listOf(unbacked)} I can't — that one's illustrative.`,
    flagged: true,
  };
}

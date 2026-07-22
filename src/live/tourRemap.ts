// Tour index remapping across the canvas merge. A model tour's indices refer to THIS
// response's blocks, but augment/refine merge those blocks into the prior canvas and
// re-number everything — so a stop's index must be translated to where its block actually
// landed. The merge is signature-based, which makes the translation exact: a response
// block either lands in the merged canvas (fresh/appended/replaced-in-place) or matches a
// prior block by content signature (an augment duplicate — the stop then points at the
// existing block, which is precisely what the model was talking about).
import type { Block } from '../data/conversation';
import { blockSignature } from './lifecycle';
import type { TourMark } from '../engine/liveSchema';

export interface TourStop {
  index: number;
  say?: string;
  saySpoken?: string;
  mark?: TourMark;
  marks?: TourMark[];
}

/**
 * Translate tour stops authored against `responseBlocks` into indices over `mergedBlocks`.
 * Duplicate signatures claim distinct merged slots in order; a stop whose block can't be
 * found (or whose index is out of range) is dropped rather than guessed. On a clean
 * replace the mapping is the identity, so callers can use this unconditionally.
 */
export function remapTour(
  tour: TourStop[],
  responseBlocks: Block[],
  mergedBlocks: Block[],
): TourStop[] {
  if (tour.length === 0) return tour;
  const slotsBySig = new Map<string, number[]>();
  mergedBlocks.forEach((b, i) => {
    const sig = blockSignature(b);
    const slots = slotsBySig.get(sig);
    if (slots) slots.push(i);
    else slotsBySig.set(sig, [i]);
  });
  // A "connect" mark's `onIndex` names WHICH block the arrow lands on, not a stop claiming its
  // own exclusive slot — so its lookup is a separate, never-mutated map (first merged slot per
  // signature), independent of the exclusivity bookkeeping `slotsBySig` does for stops below.
  const firstSlotBySig = new Map<string, number>();
  mergedBlocks.forEach((b, i) => {
    const sig = blockSignature(b);
    if (!firstSlotBySig.has(sig)) firstSlotBySig.set(sig, i);
  });

  // Re-target a "connect" mark's onIndex, or drop the mark if the block it named can no longer
  // be found post-merge — never guess a new target. Every other kind is untouched: its `at`/`to`
  // text stays valid regardless of which merged slot the block ends up in.
  const remapMark = (m: TourMark): TourMark | undefined => {
    if (m.kind !== 'connect') return m;
    const target = responseBlocks[m.onIndex ?? -1];
    const onIndex = target ? firstSlotBySig.get(blockSignature(target)) : undefined;
    return onIndex === undefined ? undefined : { ...m, onIndex };
  };
  const remapStopMarks = (stop: TourStop): { mark?: TourMark; marks?: TourMark[] } => {
    const list = (stop.marks ?? (stop.mark ? [stop.mark] : []))
      .map(remapMark)
      .filter((m): m is TourMark => !!m);
    if (!list.length) return {};
    return { mark: list[0], ...(list.length > 1 ? { marks: list } : {}) };
  };

  const out: TourStop[] = [];
  const seen = new Set<number>();
  for (const stop of tour) {
    const block = responseBlocks[stop.index];
    if (!block) continue;
    const slots = slotsBySig.get(blockSignature(block));
    const index = slots?.shift();
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    const { mark, marks } = remapStopMarks(stop);
    const next: TourStop = { ...stop, index, mark, marks };
    const same = index === stop.index && mark === stop.mark && marks === stop.marks;
    out.push(same ? stop : next);
  }
  return out;
}

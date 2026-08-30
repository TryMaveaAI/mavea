// studyVoices.ts — the four notes Mavéa pins beside one object in the Study.
//
// The design pages four notes per object and the set never changes, so the reader learns the
// chips rather than re-reading a count that moves per card: △ assumption · ◈ pattern ·
// ✓ evidence check · ? pressure-test.
//
// Each note has TWO possible authors, and which one speaks is the whole point of this file:
//
//   1. The MODEL, in `block.study`, written in the same call that wrote the answer — so it costs
//      no extra request and it can say things the card does not contain: an outside benchmark,
//      the mechanism underneath a number, the assumption an expert would challenge.
//   2. MAVÉA HERSELF, derived from the object on screen. A derived voice can only ever re-read
//      what is already visible, which is why it is the floor rather than the preference — it
//      carries demo replays, answers saved before the field existed, and any voice the model
//      left blank.
//
// The evidence check is the exception and is ALWAYS Mavéa's: it reads the turn's real sources,
// and a model-authored receipt would be a fabricated one. Where it has nothing to point at it
// says so plainly — "no sources are attached" is a real evidence check, not a missing one.
import type { Block } from '../../data/conversation';
import type { StudyAside } from '../../canvas/study/types';
import { blockLabel } from '../../canvas/blockLabel';
import { asideFor } from './asideFor';
import { assumptionIn, notableIn, studyPromptIn, type NoteLevel } from './notableIn';
import { collectionSize, penMarks, PEN_MARK_MAX, PEN_SLOTS, type PenMark } from './penQuip';
import type { ContentGraph } from './types';

/**
 * The four notes for one block, in the design's order.
 *
 * @param block   the object being studied
 * @param index   its position in the answer — seeds the margin quip, so three lists in one
 *                answer do not scrawl the same words
 * @param content the turn's semantic graph, when the answer carries figures worth checking
 * @param level   the reader's explain level, which shapes the DERIVED assumption (a
 *                model-authored one is already written at that level — the prompt says so)
 */
export function studyVoices(
  block: Block,
  index: number,
  content: ContentGraph | null,
  level: NoteLevel,
): StudyAside[] {
  const notable = notableIn(block);
  const honest = content ? asideFor(content, index) : null;
  const notes: StudyAside[] = [
    { text: block.study?.assumes ?? assumptionIn(block, level).text, kind: 'caution' },
    {
      text:
        block.study?.pattern ??
        notable?.text ??
        'Nothing in this object states a relationship on its own — the nearby ones carry it.',
      kind: 'insight',
    },
    honest
      ? { text: honest.text, kind: honest.flagged ? 'caution' : 'evidence' }
      : {
          // Names what is unverified ON THIS CARD rather than repeating one disclaimer down the
          // whole answer: the reader is deciding how much weight to put on THIS object.
          text: notable?.at
            ? `Nothing here backs ${notable.at} — no sources are attached to this answer.`
            : `Nothing in “${blockLabel(block)}” is checked against a source — none are attached to this answer.`,
          kind: 'evidence',
        },
    { text: block.study?.test ?? studyPromptIn(block).text, kind: 'question' },
  ];
  // The margin scrawls ride the first note. A model-authored pair carries substance a derived
  // one cannot — the derived ones can only read the block's structure, so at best they name what
  // it contains. Over-long scrawls are dropped rather than truncated: the margin is a fixed
  // width, and half a remark is not a remark.
  const authored = (block.study?.scrawls ?? []).filter((t) => t.length <= PEN_MARK_MAX);
  // How much ink the slide has EARNED, from what it actually renders. The prompt asks for this
  // count, but asking is not enough: measured on live turns a small model settles on two scrawls
  // whatever it is looking at, so a four-row breakdown came out annotated exactly like a
  // one-figure card. Below the floor the derived readings top it up — they are read from the
  // block's own structure, so they name real rows rather than repeating a stock phrase, and they
  // only ever appear on a slide the model under-marked. The floor is a TARGET, not a promise —
  // there are two derived readings per block, and inventing a third to hit a number is exactly
  // the stock-phrase failure this file exists to avoid.
  const size = collectionSize(block);
  const floor = size >= 6 ? 4 : size >= 4 ? 3 : authored.length;
  const texts = [...authored];
  if (texts.length < floor) {
    const seen = new Set(texts.map((t) => t.toLowerCase()));
    for (const derived of penMarks(block, index)) {
      if (texts.length >= floor) break;
      if (seen.has(derived.text.toLowerCase())) continue;
      seen.add(derived.text.toLowerCase());
      texts.push(derived.text);
    }
  }
  const marks: PenMark[] = texts.length
    ? texts.slice(0, PEN_SLOTS.length).map((text, i) => ({ text, slot: PEN_SLOTS[i] }))
    : penMarks(block, index);
  if (marks.length) notes[0] = { ...notes[0], marks };
  return notes;
}

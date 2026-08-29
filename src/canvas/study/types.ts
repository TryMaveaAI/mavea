import type { PenMark } from '../../live/content/penQuip';

export type StudyNoteKind = 'insight' | 'evidence' | 'caution' | 'question' | 'takeaway';

export interface StudyAside {
  text: string;
  kind: StudyNoteKind;
  /** The pen's scrawls around the object — up to three, in the design's own slots. Carried on a
   *  block's FIRST note; they belong to the card, not to any one page of the note stack. */
  marks?: readonly PenMark[];
}

export type StudyNoteKind = 'insight' | 'evidence' | 'caution' | 'question' | 'takeaway';

export interface StudyAside {
  text: string;
  kind: StudyNoteKind;
  /** The pen's short margin quip beside the object — a DIFFERENT register from the note card,
   *  condensed to a line a hand would actually write. Carried on a block's FIRST note. */
  quip?: string;
}

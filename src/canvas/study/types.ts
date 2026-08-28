export type StudyNoteKind = 'insight' | 'evidence' | 'caution' | 'question' | 'takeaway';

export interface StudyAside {
  text: string;
  kind: StudyNoteKind;
  /** The pen's short margin quip beside the object — a DIFFERENT voice from the note card, never
   *  the same words twice. Present only when the block yielded two distinct things to say (the
   *  structural observation and the trust read); a live walk's own written line outranks it. */
  quip?: string;
}

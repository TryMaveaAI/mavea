export type StudyNoteKind = 'insight' | 'evidence' | 'caution' | 'question' | 'takeaway';

export interface StudyAside {
  text: string;
  kind: StudyNoteKind;
}

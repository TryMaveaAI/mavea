export type RoomNoteKind = 'insight' | 'evidence' | 'caution' | 'question' | 'takeaway';

export interface RoomAside {
  text: string;
  kind: RoomNoteKind;
}

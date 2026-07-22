// Speaker-notes text for a composed slide — shared by Present's presenter overlay, the notes-print
// handout, and the pptx export, so all three read identically for the same deck. A slide's own
// `notes` field (set by compose.ts from the real answer content) always wins; `slideText` is the
// honest fallback when a layout never got one (a content-derived label, never invented copy).
import type { Slide } from './Slide';

/** A short human label for a slide — the fallback when it has no composed `notes` line. */
export function slideText(s?: Slide): string {
  if (!s) return '';
  switch (s.kind) {
    case 'quote':
      return s.data.body;
    case 'prose':
      return s.data.heading ?? s.data.body;
    case 'cover':
    case 'closing':
    case 'sectionDivider':
      return s.data.title;
    default:
      return 'title' in s.data ? (s.data.title ?? '') : '';
  }
}

/** The notes text to show for a slide wherever there's no live session to fall back to (the notes
 *  print handout, the pptx export): the composed `notes` line, else `slideText`. Present's on-stage
 *  overlay layers one more fallback on top of this for the cover slide (the live narration/question,
 *  unavailable to a static export) — see PresentationDeck's `speakerNotes`. */
export function slideNotes(s: Slide): string {
  return s.notes ?? slideText(s);
}

// Self-healing history: when a turn declares it corrects an earlier answer, find WHICH
// earlier moment it corrects so the rail and recap can mark that moment visibly — answers
// that own being wrong, never history that silently disagrees with itself.
//
// Matching is honest and conservative: the correcting turn names its subject (`what`), and
// we look backwards for the most recent earlier frame whose own words actually mention it.
// No match → only the correcting turn carries a badge; we never guess a victim. Pure.
import type { TurnFrame } from '../history';
import type { CorrectsNote } from '../../engine/liveSchema';

/** Where a frame's correction landed. */
export interface CorrectionMark {
  /** The note declared by the correcting turn. */
  note: CorrectsNote;
  /** Index of the frame that issued the correction. */
  by: number;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The searchable text a frame says about itself — its question, headline and spoken line. */
function frameText(f: TurnFrame): string {
  return norm(`${f.question} ${f.spec.title ?? ''} ${f.narration}`);
}

/**
 * Map of frame index → the correction that hit it. For every frame that declares
 * `corrects`, the most recent EARLIER frame mentioning the corrected subject gets marked.
 * Frames that issued a correction are discoverable via `mark.by`.
 */
export function correctionMarks(frames: readonly TurnFrame[]): Map<number, CorrectionMark> {
  const marks = new Map<number, CorrectionMark>();
  frames.forEach((f, i) => {
    const note = f.corrects;
    if (!note) return;
    const subject = norm(note.what);
    if (!subject) return;
    for (let j = i - 1; j >= 0; j--) {
      if (frameText(frames[j]).includes(subject)) {
        marks.set(j, { note, by: i });
        return;
      }
    }
  });
  return marks;
}

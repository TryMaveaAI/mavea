// Splits a conversation's frames into topic sections, and derives a short, punchy heading for one —
// both pure, deterministic and dependency-free (no model, no React, no clock), so the director and its
// tests can reason about them directly instead of the render/generation path branching on "how many
// topics does this reel cover".
//
// A section boundary mirrors what the user actually perceives: a turn that REPLACED the canvas started
// a fresh subject, while an augment/refine kept building the same one — the same signal
// `live/scrubber/chapters.ts` already folds into the scrubber's chapters. The very first frame always
// opens the first section, whatever its own mode, so a reel that opens on a continuation turn (the
// window's oldest frame happens to be an augment) still gets a home instead of an orphan section.
import type { TurnFrame } from '../../live/history';
import { clampText, SLOT_BUDGET } from './reelScript';

/** Partition frames into topic runs, in order. Length 1 for the common single-topic conversation —
 *  every caller must treat that as the plain, unsectioned reel (no title beyond the first). */
export function sectionFrames(frames: readonly TurnFrame[]): TurnFrame[][] {
  const sections: TurnFrame[][] = [];
  for (const frame of frames) {
    const startsSection = sections.length === 0 || frame.mode === 'replace';
    if (startsSection) sections.push([frame]);
    else sections[sections.length - 1].push(frame);
  }
  return sections;
}

// A leading question word reads as scaffolding once it's promoted to a headline ("How do eigenvalues
// work?" → "Eigenvalues work"), so it's stripped before the first clause is taken.
const LEADING_QUESTION_WORD =
  /^(how|what|why|should|can|could|would|will|plan|show|make|build|tell|give|explain|who|when|where|which|is|are|do|does|did|help|me)\b[\s,]*/i;
// The first natural break in a sentence — a clause boundary, not just any comma (so "Q1, Q2 and PCA"
// doesn't get chopped at a mid-term comma).
const CLAUSE_BREAK = /\s*[,;:]\s+|\s+—\s+|\s+–\s+|\s+\band\b\s+|\s+\bbut\b\s+|\s+\bso\b\s+/i;

/** A short, punchy heading for a section — real text only, never invented: the conversation's own
 *  (already short) title when the answer gave one, else the first clause of the question with its
 *  leading question-word stripped. Empty when there's nothing usable, so the title slide can fall back
 *  to its own generic label rather than showing a blank line. */
export function deriveHeading(frames: readonly TurnFrame[]): string {
  const first = frames[0];
  if (!first) return '';
  const title = first.spec?.title?.trim();
  if (title) return clampText(title, SLOT_BUDGET.heading);
  const q = (first.question || '').trim();
  if (!q) return '';
  const stripped = q
    .replace(LEADING_QUESTION_WORD, '')
    .replace(/[?!.]+$/, '')
    .trim();
  const clause = (stripped.split(CLAUSE_BREAK)[0] || '').trim();
  const body = clause || stripped;
  if (!body) return '';
  return clampText(body.charAt(0).toUpperCase() + body.slice(1), SLOT_BUDGET.heading);
}

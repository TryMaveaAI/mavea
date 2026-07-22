// Voice routing for "The Blank Space": while an answer is awaiting the user's input, a spoken
// reply should FILL the armed hole rather than start a new turn — unless it's plainly a new
// question (the escape hatch). Kept here (not in LiveApp) so the surface only has to call one
// function inside its voice onResult.
import type { Blank, FillValue } from '../data/conversation';
import type { TurnPhase } from './useLiveTurn';

/** A transcript that looks like a NEW question, not an answer to the hole — so a real ask while a
 *  blank is armed still starts a turn instead of being swallowed into the slot. */
const BLANK_QUESTION_RE =
  /\?\s*$|^\s*(what|why|how|when|where|who|which|can|could|should|would|is|are|do|does|tell me|show me|explain)\b/i;
export function looksLikeNewQuestion(text: string): boolean {
  return BLANK_QUESTION_RE.test(text.trim());
}

/** Coerce a spoken transcript into a fill for one hole, by kind. Returns null when it doesn't fit
 *  (a number hole with no number, a choice with no matching option, a card — which can't be
 *  spoken), so the caller can re-prompt or fall through. text/date holes accept the raw words. */
export function transcriptToFill(blank: Blank, text: string): FillValue | null {
  const key = blank.key;
  const t = text.trim();
  if (!t) return null;
  switch (blank.kind) {
    case 'number': {
      const m = t.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      if (!m) return null;
      const n = Number(m[0]);
      return Number.isFinite(n)
        ? { kind: 'number', key, value: n, ...(blank.unit ? { unit: blank.unit } : {}) }
        : null;
    }
    case 'choice': {
      const opt = blank.options?.find((o) => t.toLowerCase().includes(o.toLowerCase()));
      return opt ? { kind: 'choice', key, value: opt } : null;
    }
    case 'card':
      return null; // a card can't be spoken — fill it by drag / tap-to-place
    case 'date':
      return { kind: 'date', key, value: t };
    default:
      return { kind: 'text', key, value: t };
  }
}

/** The current Blank-Space gather state the voice gate reads (mirrored from turn state via refs). */
export interface BlankVoiceCtx {
  phase: TurnPhase;
  activeKey: string | null;
  blanks: Blank[];
  fill: (v: FillValue) => void;
}

/**
 * Route a transcript while gathering input. Returns true when it was HANDLED (filled the hole, or
 * deliberately swallowed because it didn't fit a tight hole and wasn't a question) — the caller
 * then returns without starting a turn. Returns false to let the caller submit it as a new ask.
 */
export function routeBlankVoice(ctx: BlankVoiceCtx, text: string): boolean {
  if (ctx.phase !== 'awaiting_input' || !ctx.activeKey) return false;
  const blank = ctx.blanks.find((b) => b.key === ctx.activeKey);
  if (!blank) return false;
  const fv = transcriptToFill(blank, text);
  const isQuestion = looksLikeNewQuestion(text);
  if (fv && !isQuestion) {
    ctx.fill(fv);
    return true;
  }
  // Didn't fit a tight hole and isn't a question → leave the hole open (re-prompt), don't submit.
  if (!fv && !isQuestion) return true;
  // A real new question → let the caller submit it (this abandons awaiting via the turn reset).
  return false;
}

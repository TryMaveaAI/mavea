// procedural.ts — capture "what the user corrected / what went wrong" as durable PROCEDURAL memory,
// so Mavéa answers THIS user better next time. This is the axis Perplexity's "Brain" is built on
// (what worked, what failed, corrections) — except here it's captured in REAL TIME from signals the
// turn already produced (a declared correction, an ink correction), never an extra model call, and
// fed back on the very next turn instead of an overnight batch.
import type { CorrectsNote } from '../../engine/liveSchema';
import type { MemorySource, MemoryUpdate } from './store';

const MAX_SEG = 24;

/** First letter-led token of a phrase, as a valid concept segment ("budget figure" → "budget").
 *  Concept slugs must start with a letter, so a leading number/symbol falls back. */
export function conceptSegment(text: string, fallback = 'item'): string {
  const m = text.toLowerCase().match(/[a-z][a-z0-9]*/g);
  return (m && m[0] ? m[0] : fallback).slice(0, MAX_SEG);
}

/**
 * A user-driven correction becomes a durable lesson: honor the corrected value and verify this
 * kind of figure next time. The prior answer's approach gets a `loss`. High trust — it's anchored
 * to a real correction the user surfaced, the single most reliable signal we have.
 */
export function correctionUpdate(
  c: CorrectsNote,
  opts: { turnId?: string; source?: MemorySource } = {},
): MemoryUpdate {
  return {
    concept: `corrections.${conceptSegment(c.what)}`,
    body: `On "${c.what}", an earlier answer said ${c.was}; the user corrected it to ${c.now}. Use the corrected value and double-check figures like this before stating them.`,
    kind: 'procedural',
    // The `corrects` field is model-authored, so the caller classifies whether the user actually
    // supplied the corrected value; default to user-stated only for direct/test callers.
    source: opts.source ?? 'user-stated',
    verify: true,
    outcome: 'loss',
    turnId: opts.turnId,
    quote: c.now,
  };
}

/**
 * An ink correction (the user drew on the answer to say "this is wrong — it should be X") is the
 * gold teaching signal. Recorded as a procedural lesson keyed to the corrected subject, optionally
 * steering block choice for that subject away from `avoid` and toward `prefer`. Used by PR6's ink
 * route; kept here so all procedural capture lives in one place.
 */
export function inkCorrectionUpdate(
  subject: string,
  note: string,
  opts: { turnId?: string; prefer?: string[]; avoid?: string[] } = {},
): MemoryUpdate {
  return {
    concept: `corrections.${conceptSegment(subject)}`,
    body: `On "${subject}", the user corrected the answer by drawing: ${note}. Honor this next time.`,
    kind: 'procedural',
    source: 'ink-correction',
    verify: true,
    outcome: 'loss',
    prefer: opts.prefer,
    avoid: opts.avoid,
    turnId: opts.turnId,
    quote: note,
  };
}

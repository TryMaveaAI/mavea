// effort.ts — how hard to think, how hot to sample, and how much to say.
//
// Three cheap, pure decisions that keep Live fast and cheap without feeling thin:
//
//  1) thinkingLevel — most Live turns are VISUAL COMPOSITION, not deep reasoning, so the
//     model should think as little as possible (lower latency, fewer thinking tokens). We
//     only step the reasoning effort up for a genuinely HARD ask (a derivation, a multi-
//     way trade-off, a grounded synthesis). A user "quality" preference shifts the whole
//     mapping a notch so the choice stays in their hands.
//
//  2) temperature — the sampling-determinism dial, picked from the SAME zero-cost
//     classifiers (never an extra model call). Precision asks (arithmetic, a derivation, a
//     debug) want a LOW temperature so the model commits to the single best answer instead
//     of a plausible-sounding variant; creative asks (brainstorm, names, ideas) want a HIGH
//     one because variety is the whole point. Everything in between keeps the proven 0.3.
//
//  3) spoken cap — the narrated line should sound like a person talking, never a wall of
//     text. Lean asks get a tweet; richer asks get up to a couple of sentences. The depth
//     lives in the canvas, not the monologue — "good detail when needed, sometimes right
//     to the point, never longer than 2–3 messages."
//
// Zero-dependency, word-bounded, never-throws — same spirit as classifyAsk / detectShapes,
// and identical on every model/provider so behavior doesn't drift by backend.
import type { ThinkingLevel } from './providers/types';
import { trimToSentence } from '../lib/spokenText';
import type { AskComplexity } from './select/complexity';
import type { IntentSignals } from './select/intent';

/** The user's reasoning/cost preference. Default is `balanced` (one notch up from the
 *  cheapest mapping — first answers should be trustworthy, not just snappy); `fast` is the
 *  cheapest/snappiest and `thorough` shifts the whole effort mapping up two notches. */
export type QualityPref = 'fast' | 'balanced' | 'thorough';

// A genuinely HARD ask — one where a little reasoning measurably helps the answer. Kept
// tight on purpose: most "rich" asks are still just composition and stay at minimal effort.
const HARD =
  /\b(deriv\w*|prove|proof|theorem|integral|derivative|equation|algebra|calculus|optimi[sz]e|trade-?offs?|step[-\s]?by[-\s]?step|reason\w* through|figure out|work out|why (?:does|is|are|do)|analy[sz]e|compare\b.*\bvs\b|root cause|debug|diagnose|strategy|plan\b.*\b(?:budget|trip|itinerary|migration))\b/;

/** True when the ask is hard enough to justify a step up in reasoning effort. */
export function isHardAsk(userText: string): boolean {
  return HARD.test(userText.toLowerCase());
}

// The base reasoning level before the user's quality preference is applied. Lean → as low
// as possible; rich → still minimal (composition, not reasoning); hard → a notch up.
function baseLevel(complexity: AskComplexity, hard: boolean): ThinkingLevel {
  if (complexity === 'lean') return 'minimal';
  return hard ? 'low' : 'minimal';
}

const LADDER: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high'];

/** Shift a level up the ladder by `steps`, clamped to the ends. */
function bump(level: ThinkingLevel, steps: number): ThinkingLevel {
  const i = LADDER.indexOf(level);
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, i + steps))];
}

/**
 * The reasoning effort for this turn. Defaults to the cheapest level that fits the ask,
 * then nudges up for the user's quality preference (`balanced` +1, `thorough` +2). Returns
 * a `ThinkingLevel` the Gemini adapter maps to `thinkingConfig.thinkingLevel`; providers
 * without the knob ignore it.
 */
export function thinkingLevelFor(
  complexity: AskComplexity,
  userText: string,
  quality: QualityPref = 'fast',
): ThinkingLevel {
  const hard = isHardAsk(userText);
  // An ask that isn't a hard problem never benefits from more reasoning, so pin it at minimal
  // regardless of the quality dial — the dial raises effort for hard asks, not for composition.
  // This used to guard only `lean`, so at the DEFAULT dial (balanced, +1) every ordinary rich ask
  // ran at 'low' and every "why does…" / "compare…" at 'medium' — hundreds to thousands of hidden
  // reasoning tokens generated BEFORE the first visible one, which was the single largest slice
  // of a measured 3.2s first-token wait. A canvas is composition, not derivation: the model is
  // arranging an answer it already knows into blocks, and reasoning about the arrangement is time
  // the reader spends staring at a blank screen.
  if (!hard) return 'minimal';
  // A genuinely hard ask climbs from 'low'. But HARD matches everyday phrasings — "why does…",
  // "compare A vs B", "plan a trip" — so at the default dial it is clamped to 'low': one rung of
  // real reasoning, never a medium/high pass the reader waits through unasked. Only the explicit
  // Thorough dial buys the deeper rungs, because that user chose to trade time for it.
  const base = baseLevel(complexity, hard);
  if (quality !== 'thorough') return base;
  return bump(base, 2);
}

// Temperature operating points. We deliberately move only the two TAILS that the default
// serves poorly and leave the well-tuned middle untouched — a minimal, defensible change.
const TEMP_PRECISE = 0.1; //   arithmetic / derivation / debug: near-greedy, repeatable
const TEMP_DEFAULT = 0.3; //   the proven middle for explainers, decisions, plans, facts
const TEMP_CREATIVE = 0.75; // brainstorm / names / ideas: variety is the value

/**
 * The sampling temperature for this turn, from the same zero-cost classifiers as the
 * reasoning level — so a math answer is deterministic and a brainstorm is varied, with no
 * extra model call to "ask" what temperature to use (that would cost a round-trip and still
 * be a guess). Honored by every adapter that accepts a temperature; Anthropic overrides it
 * to 1 only when extended thinking fires, which is correct (Claude reasons at temp 1 by
 * design). Never throws.
 *
 * - creative intent → high (0.75): repetition is the failure mode, novelty the goal.
 * - precision ask   → low (0.10): a trivial fact/arithmetic, a hard derivation, or a
 *   debug/troubleshoot — one best answer, the same every time.
 * - everything else → 0.30: accurate but natural, the long-proven default.
 */
export function temperatureFor(
  complexity: AskComplexity,
  intent: IntentSignals,
  userText: string,
): number {
  if (intent.creative) return TEMP_CREATIVE;
  if (complexity === 'lean' || isHardAsk(userText) || intent.troubleshoot) return TEMP_PRECISE;
  return TEMP_DEFAULT;
}

// Spoken-line ceilings (characters). A tweet-ish floor for trivial asks; up to ~2–3 short
// sentences for substantive ones. Hard ceiling so a model can never monologue.
const SPOKEN_LEAN = 140;
const SPOKEN_RICH = 320;

/**
 * Cap the narrated line to a conversational length for the ask. Lean → ~140 chars; rich →
 * up to ~320 (a couple of sentences). The canvas carries the depth, so the voice stays
 * human and short. Never throws; empty stays empty.
 */
export function capSpoken(text: string, complexity: AskComplexity): string {
  const max = complexity === 'lean' || complexity === 'brief' ? SPOKEN_LEAN : SPOKEN_RICH;
  return trimToSentence(text.trim(), max);
}

/** The character ceiling for a complexity — exported so a prompt can tell the model the
 *  budget it's writing to (keeps the model from over-writing then getting truncated). */
export function spokenBudget(complexity: AskComplexity): number {
  return complexity === 'lean' || complexity === 'brief' ? SPOKEN_LEAN : SPOKEN_RICH;
}

/** OUTPUT ORDER — a fixed instruction (doesn't vary by ask), pulled out here so it's exported
 *  from the same module as the length rule it pairs with (see spokenLineDirective) rather than
 *  duplicated at every caller (generateLive.ts, and the eval harness, which must build the SAME
 *  per-turn prompt production does to score what users actually see). */
export const NARRATION_FIRST_LINE =
  'OUTPUT ORDER — emit the "narration" field FIRST in the JSON, before "title", "sub", and "blocks", and write it as complete sentences. It is spoken aloud the moment it streams, so it must lead.';

/** The per-turn SPOKEN LINE directive — the single source of truth for narration length (see
 *  spokenBudget/capSpoken above). Exported so the eval harness can assemble the SAME prompt
 *  production sends instead of a hand-rolled, complexity-blind subset. */
export function spokenLineDirective(complexity: AskComplexity): string {
  return complexity === 'lean' || complexity === 'brief'
    ? `SPOKEN LINE ("narration") — keep it to ONE short sentence (≈${spokenBudget(complexity)} characters). Right to the point.`
    : `SPOKEN LINE ("narration") — at most two or three short sentences (≈${spokenBudget('rich')} characters), like a person talking. The visuals carry the detail; never narrate the whole canvas.`;
}

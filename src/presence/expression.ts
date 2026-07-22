// Read an answer into a facial expression — honestly.
//
// Live used to hold the face at `neutral` forever, so it looked identical whether it was
// celebrating good news or flagging a risk. This maps a rendered answer to the small, calm
// emotion vocabulary the face already supports, using only STRUCTURED signals the model put
// in the blocks (a verdict's stance, a quote's tone, a headline's confidence) — never a text
// guess. The bar is deliberately high so the face stays calm by default: warmth only on a
// genuinely positive answer, concern only on a genuine caution; everything else is neutral.

import type { Block, Conf } from '../data/conversation';
import type { Emotion } from '../types/mavea';

/** The expressive read of an answer. Mirrors the CSS `data-emotion` set. */
export type Mood = 'neutral' | 'warm' | 'concerned';

/** A spec we can read an emotion from — just the blocks; accepts the live/partial shape too. */
export interface ExpressiveSpec {
  blocks?: Block[];
  /** "The Blank Space": the answer is waiting on the user to fill a hole — the face leans in
   *  (warm/attentive) to invite the input. Concern still wins if a caution block is present. */
  awaiting?: boolean;
}

// Lowercased stance words (verdictcard et al.) that read as a caution vs. an encouragement.
const CAUTION_STANCES = new Set(['no', 'caution', 'avoid', 'risk', 'wait']);
const POSITIVE_STANCES = new Set(['yes', 'go', 'recommended', 'good']);

/** Read an optional string field off a block's props bag without widening the typed union. */
function strProp(b: Block, key: string): string | undefined {
  const v = (b.props as unknown as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.toLowerCase() : undefined;
}

/**
 * The honest mood of an answer. Concern wins over warmth — a caution is the more important
 * thing to signal truthfully than a positive — but both require an explicit signal, so a plain
 * informational answer stays neutral (the calm base face).
 */
export function responseToMood(spec: ExpressiveSpec | null | undefined): Mood {
  const blocks = spec?.blocks;
  if (!blocks?.length) return 'neutral';

  let concerned = false;
  // An awaiting answer leans the face in — "tell me" — within the locked face vocabulary
  // (neutral|warm|concerned). A caution block can still override to concerned below.
  let warm = spec?.awaiting === true;

  for (const b of blocks) {
    const tone = strProp(b, 'tone'); // QuoteSpec.tone: pos | neg | warn | neutral
    if (tone === 'warn' || tone === 'neg') concerned = true;
    if (tone === 'pos') warm = true;

    const stance = strProp(b, 'stance'); // verdictcard et al.
    if (stance && CAUTION_STANCES.has(stance)) concerned = true;
    if (stance && POSITIVE_STANCES.has(stance)) warm = true;

    // A headline the model itself marked as unverified reads as a careful, "let me caveat
    // that" face. `inferred`/`partial` are routine reasoning, not alarm — left neutral so the
    // face doesn't look worried on every estimate.
    if (b.type === 'insight') {
      const conf: Conf | undefined = b.props.conf;
      if (conf === 'unverified') concerned = true;
    }
  }

  if (concerned) return 'concerned';
  if (warm) return 'warm';
  return 'neutral';
}

/** Map a mood to the face's emotion attribute. */
export function moodToEmotion(mood: Mood): Emotion {
  switch (mood) {
    case 'concerned':
      return 'concerned';
    case 'warm':
      return 'warm';
    default:
      return 'neutral';
  }
}

/** Convenience: the face emotion for a rendered answer (neutral when there's nothing to read). */
export function emotionForSpec(spec: ExpressiveSpec | null | undefined): Emotion {
  return moodToEmotion(responseToMood(spec));
}

/**
 * Whether an answer has earned the full celebration (joy bounce + confetti) rather than the
 * everyday happy face. The bar is an explicit, unambiguous green light from the model — a
 * positive verdict stance — with no caution anywhere in the same answer; mere positive tone
 * stays `warm`. Callers gate it once per session so the moment keeps its weight.
 */
export function celebrationWorthy(spec: ExpressiveSpec | null | undefined): boolean {
  const blocks = spec?.blocks;
  if (!blocks?.length || responseToMood(spec) !== 'warm') return false;
  return blocks.some((b) => {
    const stance = strProp(b, 'stance');
    return stance !== undefined && POSITIVE_STANCES.has(stance);
  });
}

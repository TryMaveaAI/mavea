// topicTokens.ts — the lexical fingerprint of a turn, and the overlap below which two turns are
// different subjects. A leaf on purpose: the reel's chapter marks read it too, and reaching it
// through lifecycle.ts carried the whole canvas merge into the share preview's first load.

/** Common words that carry no topic signal — dropped before comparing turns. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'in',
  'on',
  'at',
  'for',
  'my',
  'me',
  'i',
  'you',
  'it',
  'this',
  'that',
  'these',
  'those',
  'how',
  'what',
  'why',
  'when',
  'where',
  'which',
  'who',
  'should',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'will',
  'with',
  'about',
  'please',
  'show',
  'tell',
  'give',
  'make',
  'get',
  'see',
  'want',
  'need',
  'from',
  'by',
  'as',
  'so',
  'if',
  'then',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
]);

/** Lowercased, stopword-free, length≥2 word set — the topic fingerprint of some text. */
export function topicTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

/** Below this cohesion two consecutive turns are genuinely different SUBJECTS. Tuned against
 *  realistic pairs (see live-lifecycle tests): same-subject answers in different words land
 *  ~0.2–0.6 (the subject nouns recur even when everything else changes), a real pivot
 *  ~0.0–0.1 (only conversational filler survives the stopword strip) — the band holds. */
export const SAME_SUBJECT_FLOOR = 0.15;

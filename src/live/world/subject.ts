// subject.ts — what a living answer is ABOUT, which is not always what the reader just typed.
//
// A world is built from one string, and for most turns that string is the question. But a
// conversation is full of follow-ups that carry no subject of their own — "tell me more", "why?",
// "go on" — and handed one of those the builder has nothing to explain, so it explains the words
// themselves. A reader deep in a thread about refinancing pressed "tell me more" and got a causal
// web about Systems Thinking, Logic Mapping and Causal World Building: the model, asked to explode
// the phrase "Tell me more", reasonably explained the act of explaining.
//
// So the subject is resolved BEFORE anything is offered: the reader's own words when they name
// something, the answer's headline when they don't, and nothing at all when neither does. A card
// that opens onto the wrong subject is worse than no card.

/** Words that carry no subject: pronouns, articles, auxiliaries, question words, and the small
 *  vocabulary of asking-for-more. A phrase built only from these names nothing to explain. */
import { friendlyAsk } from '../friendlyAsk';

const EMPTY_WORDS = new Set([
  'a',
  'about',
  'again',
  'ahead',
  'all',
  'also',
  'am',
  'an',
  'and',
  'another',
  'any',
  'anything',
  'are',
  'as',
  'at',
  'be',
  'been',
  'bit',
  'but',
  'by',
  'can',
  'carry',
  'continue',
  'could',
  'detail',
  'did',
  'do',
  'does',
  'down',
  'each',
  'else',
  'elaborate',
  'expand',
  'explain',
  'for',
  'from',
  'further',
  'get',
  'give',
  'go',
  'going',
  'got',
  'had',
  'has',
  'have',
  'he',
  'her',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'keep',
  'know',
  'like',
  'little',
  'look',
  'make',
  'many',
  'maybe',
  'me',
  'mean',
  'means',
  'might',
  'more',
  'most',
  'much',
  'my',
  'no',
  'not',
  'now',
  'of',
  'ok',
  'okay',
  'on',
  'one',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'please',
  'put',
  'really',
  'right',
  'say',
  'see',
  'she',
  'should',
  'show',
  'simple',
  'simpler',
  'so',
  'some',
  'something',
  'sure',
  'tell',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'thing',
  'things',
  'think',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'understand',
  'up',
  'us',
  'use',
  'very',
  'want',
  'was',
  'we',
  'well',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'yeah',
  'yep',
  'yes',
  'you',
  'your',
  'yep',
  'yup',
  'hmm',
  'hm',
  'mhm',
  'uh',
  'huh',
  'oh',
  'again',
  'bit',
  'deeper',
  'deep',
  'further',
  'next',
  'better',
  'best',
  'briefly',
  'clearly',
  'exactly',
  'basically',
  'quick',
  'quickly',
  'short',
  'shorter',
  'longer',
  'simply',
  'fully',
  'properly',
  'instead',
  'anyway',
  'though',
  'actually',
  'sorry',
]);

/** Does this utterance name anything of its own? */
export function namesSubject(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.some((w) => !EMPTY_WORDS.has(w));
}

/**
 * What a living answer offered on this turn should be about, or null when nothing can be.
 *
 * The reader's own words win whenever they name something — they asked it, and it is what they will
 * see on the card. A subjectless follow-up falls back to the answer's own headline, which is the
 * thread's subject stated by the turn that just answered it. With neither, there is no honest
 * subject, and the caller offers no world rather than one about the phrase itself.
 */
export function worldSubject(userText: string, headline: string | undefined): string | null {
  const asked = userText.trim();
  // A turn whose "question" is a COMPOSED INSTRUCTION is the other way a subject goes missing, and
  // the more damaging one. "Correction — you understood X, but it's actually Y. Keep the rest of
  // your understanding…" is written by the app, not the reader; it names a dozen words, so
  // namesSubject waves it through, and the world is then asked to explain the instruction rather
  // than the thing it corrects. That build does not come back — a causal web of an edit request is
  // not something a model can honestly return, so the reader pressed the button and got nothing.
  //
  // friendlyAsk already knows every one of these prompts by shape (it exists to keep them off the
  // screen), so a text it rewrites is by definition not the reader's own question, and the thread's
  // headline — the subject stated by the turn that just answered — is what the world is about.
  const composed = asked !== '' && friendlyAsk(asked) !== asked;
  if (!composed && asked !== '' && namesSubject(asked)) return asked;
  const fallback = headline?.trim();
  return fallback !== undefined && fallback !== '' && namesSubject(fallback) ? fallback : null;
}

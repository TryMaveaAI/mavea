// annotationGuard.ts — throw out a pronunciation the voice does not need.
//
// The model marks terms a synthesizer would mangle as [[shown|said]] (see lib/spokenText), and the
// said side is INVENTED, not looked up. That is fine for "gnocchi" and disastrous for "analysis":
// asked to catch anything a voice "could plausibly mispronounce", the model also respells ordinary
// vocabulary, and the voice then dutifully says a common word wrong. Loosening the prompt helps but
// cannot guarantee anything, so this is the deterministic floor underneath it.
//
// Two passes, in order of confidence:
//
//   1. SHAPE. A shown side carrying a digit, a symbol, a period, a space, an uppercase letter or a
//      non-ASCII character is self-evidently a term rather than a word — "$5,000/mo", "3.4×",
//      "E=mc²", "Aug 2", "Dr.", "St. Louis", "CUDA", "PyTorch", "Qwen", "Nguyen", "Omakase". These
//      are exactly the cases a synthesizer really does get wrong, and they pass untouched.
//
//   2. WORD. What survives pass 1 is a plain lowercase word, where shape says nothing: "gnocchi"
//      and "analysis" look identical. A common-English-word list decides, and it decides safely in
//      both directions — a borrowed or technical term is never in one.
//
// Dropping an annotation keeps the SHOWN side, so the reader's text is never altered and the voice
// simply reads the ordinary spelling. Pure and idempotent; text with no annotations comes back
// byte-identical.
import { isPlainEnglishWord } from './plainWords';

/** [[shown|said]] — the same pattern lib/spokenText resolves, matched here to inspect the pair. */
const ANNOTATED = /\[\[([^[\]|]*)\|([^[\]]*)\]\]/g;

/** True when the shown side is a plain lowercase ASCII word — the only case pass 1 cannot settle. */
function isBareLowercaseWord(shown: string): boolean {
  return /^[a-z]+$/.test(shown);
}

/**
 * Strip the said side of any annotation the voice does not need, keeping the shown side exactly as
 * written. Everything else — including text with no annotations at all — is returned unchanged.
 */
export function guardAnnotations(text: string): string {
  if (!text.includes('[[')) return text;
  return text.replace(ANNOTATED, (whole, shown: string, said: string) => {
    const word = shown.trim();
    if (!isBareLowercaseWord(word)) return whole;
    // A respelling that is really the same word ("[[often|often]]") is noise either way.
    if (said.trim().toLowerCase() === word) return word;
    return isPlainEnglishWord(word) ? shown : whole;
  });
}

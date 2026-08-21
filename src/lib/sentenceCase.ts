// sentenceCase — how a reader's own words are shown back to them.
//
// A typed question is stored verbatim (the world's `title` is a blockSignature key, and a library
// entry is the record of what was actually asked), so the raw string is what the reader typed:
// "tell me about event driven edge in investing". Printed unchanged into a serif display face it
// reads as unfinished rather than as a question someone asked.
//
// So this touches exactly one character. It does NOT title-case (that shouts), does NOT add a
// question mark (the reader did not, and inventing punctuation puts words in their mouth), and does
// NOT lowercase anything — an acronym they typed is theirs to keep. A string already starting with
// a capital or a non-letter comes back unchanged, because upper-casing those is a no-op.
//
// It reads a CODE POINT rather than `text[0]`: on a string opening with an emoji or any astral
// character, `[0]` is half a surrogate pair and upper-casing it corrupts the text.

/** The reader's own words, shown back to them as a sentence. Display only — never store the result. */
export function sentenceCase(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const first = String.fromCodePoint(t.codePointAt(0)!);
  return first.toUpperCase() + t.slice(first.length);
}

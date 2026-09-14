// plainText.ts — the words inside markup, for the places that want text rather than HTML:
// a clipboard body, a search needle, an SRS key, an exported paragraph, a fetched snippet, an
// imported .docx page.
//
// Each of those once carried its own one-line `replace(/<[^>]*>/g, '')` plus a hand-ordered list
// of entity replacements, and that shape gets two things wrong on markup nobody here authored
// (model output, a Wikipedia snippet, an Office document):
//
//   • One pass over `<[^>]*>` is not a strip. It cannot see past the first `>`, so
//     `<!-- a > b -->` leaves ` b -->` and `<a title="a > b">link</a>` leaves ` b">link` — the
//     markup's own characters, handed to the reader as if the author had written them. Comments go
//     first here, a quoted attribute value is stepped over whole rather than read for its `>`, and
//     the strip repeats until the string holds still. It does hold still — every pass is strictly
//     shorter than the last — but MAX_PASSES stops it first on a string crafted to need one pass
//     per level; see there for what that one gets back.
//   • Decoding `&amp;` before `&lt;` decodes twice: `&amp;lt;` becomes `&lt;` becomes `<`, so a
//     sentence that meant to SHOW an escaped tag ends up carrying a real one. A single pass over
//     one alternation cannot make that mistake — every entity is read once, from the original.
//
// Pure string work, no DOMParser: this runs in the export pipeline and in Prism's document
// import as readily as in a component, and the same input must give the same words in all three.

/** Comments go before tags for the reason above: their body may contain a `>`. An unterminated
 *  comment runs to the end of the input, which is what a parser does with one too. */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/** What has to follow a `<` for it to open a tag: a name, a closing slash, or a `!`/`?`
 *  declaration — the same thing a parser requires. The loose `<[^>]*>` this replaced also
 *  swallowed prose: "3 < 4 and 5 > 4" came out of it as "3 4", and comparisons like that are
 *  ordinary model output, an ordinary spreadsheet cell and an ordinary exported sentence. A bare
 *  `<` is a character, not an opening. Sticky, so the scanner below asks "does a tag start exactly
 *  here?" rather than searching. */
const TAG_NAME = /[/!?]?[a-zA-Z]/y;

/** The characters HTML counts as whitespace inside a tag. */
const SPACE = /[ \t\n\r\f]/;

/** `tagEnd`'s two ways of saying no, told apart because they mean different things to the scan.
 *  NOT_A_TAG is local — a `<` that opens nothing, and the very next one may still open a tag.
 *  UNTERMINATED means the walk reached the end of the input without meeting a `>`, so no LATER
 *  opening can meet one either and the pass is finished. Collapsing the two costs a full scan per
 *  opening on a run like `'<a '.repeat(n)`, which is quadratic on exactly the imported document
 *  MAX_PASSES is sized for. */
const NOT_A_TAG = -1;
const UNTERMINATED = -2;

/** Index just past the `>` closing the tag that opens at `lt`, or one of the two sentinels above.
 *
 *  A quoted attribute value is stepped over whole, so `<a title="a > b">` ends at the SECOND `>`;
 *  reading the first one as the end is what put ` b">link` on the clipboard while the card beside
 *  it rendered `link`. A quote only opens a value where a parser would read one — immediately
 *  after the `=`, whitespace allowed — because a quote is an ordinary character anywhere else in a
 *  tag: `<em class=o'brien>` carries an apostrophe in an unquoted value, and reading it as an
 *  opening runs to the apostrophe in the element's own text and swallows the sentence between
 *  them. A value counts as quoted only while its closing quote arrives before the next `<`: an
 *  unbalanced quote otherwise reaches into the FOLLOWING tag's attributes and takes the sentence
 *  between the two tags with it, which is a worse answer than the stray tag it was avoiding — so
 *  that case falls back to ending the tag at its first `>`, as before.
 *
 *  Left to right, with no pattern to backtrack into: each quoted value costs one lookahead,
 *  bounded by its own closing quote, and that quote is stepped over rather than re-read as an
 *  opening — so a crafted run of quotes cannot turn this quadratic the way an alternation would.
 *  It runs on model output and on an imported document, where that matters. */
function tagEnd(input: string, lt: number): number {
  TAG_NAME.lastIndex = lt + 1;
  if (!TAG_NAME.exec(input)) return NOT_A_TAG;
  let afterEq = false; // the last non-space character was "=", so a quote here opens a value
  for (let i = TAG_NAME.lastIndex; i < input.length; i++) {
    const ch = input[i];
    if (ch === '>') return i + 1;
    if (afterEq && (ch === '"' || ch === "'")) {
      let close = i + 1;
      while (close < input.length && input[close] !== ch && input[close] !== '<') close++;
      if (input[close] === ch) i = close;
      afterEq = false;
      continue;
    }
    // Whitespace neither opens nor closes anything, so `title = "a > b"` still reads as a value.
    if (!SPACE.test(ch)) afterEq = ch === '=';
  }
  return UNTERMINATED;
}

/** One strip of every tag, `separator` left where each stood. */
function stripTagsOnce(input: string, separator: string): string {
  let out = '';
  let kept = 0; // start of the run of text not yet copied across
  for (let i = input.indexOf('<'); i !== -1; i = input.indexOf('<', i + 1)) {
    const end = tagEnd(input, i);
    if (end === UNTERMINATED) break; // no `>` remains, so nothing after this opens a tag either
    if (end === NOT_A_TAG) continue;
    out += input.slice(kept, i) + separator;
    kept = end;
    i = end - 1; // the loop's own +1 resumes after the ">"
  }
  return out + input.slice(kept);
}

/** The entities authored copy, model output and OOXML actually use. Anything else is left as
 *  written rather than guessed at. Keys are literal — no regex metacharacters — so the one
 *  alternation below is built from them directly and the table stays the single source. */
const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
  '&mdash;': '—',
  '&amp;': '&',
};
const ENTITY = new RegExp(Object.keys(ENTITIES).join('|'), 'g');

/** Where the repeat stops. Nesting costs exactly one pass per level — a leftover `<` closes up
 *  against the text a removed tag left behind and forms a fresh opening — so `'<'.repeat(n) +
 *  'script>'.repeat(n)` asks for n passes over a string of length n, and an imported document is
 *  large enough for that to be a hang rather than a slow function. Sixteen is far past any
 *  authored nesting; a string that reaches the ceiling is a crafted one, and what it gets back is
 *  what the loop had: `<` characters and words. That residue is TEXT to every caller here (a
 *  clipboard body, a search needle, an SRS key, an exported paragraph); the callers that also
 *  paint their markup on screen (MessageDraft, Deflist) reach the DOM through richText's sanitizer
 *  instead, never through this, so the residue is ugly rather than live. */
const MAX_PASSES = 16;

/** Remove every tag and comment, repeating until the string holds still or MAX_PASSES is spent.
 *  `separator` is what a removed tag leaves behind — `''` to close the words up, `' '` where the
 *  markup was the only thing separating them (one XML run from the next). It must not itself
 *  contain `<` or `>`. */
export function stripTags(input: string, separator = ''): string {
  let out = input;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = stripTagsOnce(out.replace(COMMENT, separator), separator);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Decode the entity table in one pass, so an already-escaped `&` cannot be decoded a second
 *  time. */
export function decodeEntities(input: string): string {
  return input.replace(ENTITY, (entity) => ENTITIES[entity] ?? entity);
}

/** Tags out, entities in, whitespace collapsed. Decoding runs AFTER stripping on purpose: a
 *  `&lt;` in the source is a character the author typed, not a tag to remove. */
export function plainFromMarkup(input: string, separator = ''): string {
  return decodeEntities(stripTags(input, separator)).replace(/\s+/g, ' ').trim();
}

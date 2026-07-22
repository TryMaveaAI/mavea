// spokenText.ts — split the model's text into what's SHOWN and what's SAID.
//
// A synthetic voice mangles things a reader has no trouble with: it spells acronyms out
// ("CUDA" → "C-U-D-A"), reads "$5,000/mo" as "dollar sign five thousand slash em-oh", and
// fumbles equations and unusual names. Rather than guess at fixes, the model — which knows how
// each is really said — annotates the tricky spans inline as [[shown|said]]:
//
//   "It runs on a [[$5,000/mo|five thousand dollars a month]] rig with [[CUDA|kooda]]."
//   "[[E=mc²|E equals m c squared]] ties energy to mass."
//
// One field carries both readings; we parse it two ways — forDisplay keeps the shown side (for
// the screen), forSpeech keeps the said side (for the voice). One model payload, no extra call,
// no per-term dictionary to maintain — it scales to anything the model can say. Pure string
// helpers (no DOM), so they run identically in the browser, the validator, and headless eval.

/** [[shown|said]] — the said side wins for speech, the shown side for display. */
const ANNOTATED = /\[\[([^[\]|]*)\|([^[\]]*)\]\]/g;
/** [[x]] — a bare span with no alternate reading; both sides are just x. */
const PLAIN = /\[\[([^[\]|]*)\]\]/g;
/** An unclosed "[[…" with no closing "]]" — happens while a reply is still streaming; drop it so
 *  a half-arrived annotation is never shown or spoken as literal brackets. */
const DANGLING = /\[\[[^\]]*$/;

/** True when the text carries at least one (possibly still-open) annotation. */
export function hasAnnotation(text: string): boolean {
  return text.includes('[[');
}

/** A parenthetical that is ONLY a citation — a markdown link and/or bare URL(s), e.g.
 *  "([fifa.com](https://…))" or "(https://…)". The real sources render in the answer's SOURCES
 *  footer, so this inline echo is redundant noise on the card and gibberish read aloud. The
 *  `(?<!\])` lookbehind keeps it from swallowing a *standalone* markdown link's own "(url)" parens
 *  (those follow a "]"), which MD_LINK converts to text instead. */
const CITATION_PARENS =
  /\s*(?<!\])\((?:\s*(?:\[[^\]]*\]\((?:https?:\/\/|www\.)[^)]*\)|https?:\/\/[^\s)]+)\s*[,;·|]*\s*)+\)/gi;
/** A markdown link — "[text](https://…)". Keeps the visible text, drops the URL. */
const MD_LINK = /\[([^\]]*)\]\((?:https?:\/\/|www\.|mailto:)[^)]*\)/gi;
/** A bare URL dropped into prose. */
const BARE_URL = /\bhttps?:\/\/[^\s)\]]+/gi;
/** A markdown link whose URL is still arriving ("…final. ([fifa.com](https://www.fi") — drop it
 *  mid-stream so a half-typed citation never flashes as literal brackets, mirroring DANGLING. */
const DANGLING_LINK = /\s*\(?\s*\[[^\]]*\]\((?:https?:\/\/|www\.|\/)[^)]*$/;

/** Strip links the model sometimes drops into prose. A raw markdown link or URL renders as literal
 *  "[fifa.com](https://…)" on the card and reads as gibberish aloud, and the real sources already
 *  surface in the answer's SOURCES footer. Remove citation parentheticals whole, keep the visible
 *  text of any other markdown link, drop stray bare URLs, then tidy the spacing left behind. */
export function stripLinks(text: string): string {
  return text
    .replace(CITATION_PARENS, '')
    .replace(DANGLING_LINK, '') // before BARE_URL, which would otherwise eat the partial URL first
    .replace(MD_LINK, '$1')
    .replace(BARE_URL, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trimEnd();
}

/** Replace every non-overlapping match of `re` with `group`, re-running until nothing changes.
 *  A malformed, nested annotation ("[[outer [[inner|said]] rest|meant]]") hides its outer pair
 *  from a single pass — `[` is excluded from ANNOTATED's own captures, so only the inner span
 *  matches at first. Looping lets the now-unwrapped outer pair resolve on the next pass instead
 *  of falling through to PLAIN, which would otherwise emit its literal, un-split "text|text". */
function resolveToFixedPoint(text: string, re: RegExp, group: string): string {
  let out = text;
  let prev: string;
  do {
    prev = out;
    out = out.replace(re, group);
  } while (out !== prev);
  return out;
}

/** What the screen shows: keep the shown (left) side of every annotation, drop the markers.
 *  Also strips any HTML tags the model accidentally emits — display text is always plain. */
export function forDisplay(text: string): string {
  let out = resolveToFixedPoint(text, ANNOTATED, '$1');
  out = resolveToFixedPoint(out, PLAIN, '$1');
  return out
    .replace(DANGLING, '')
    .replace(/<[^>]*>/g, '')
    .trimEnd();
}

/** What the voice says: keep the said (right) side of every annotation, drop the markers. */
export function forSpeech(text: string): string {
  let out = resolveToFixedPoint(text, ANNOTATED, '$2');
  out = resolveToFixedPoint(out, PLAIN, '$1');
  return out.replace(DANGLING, '').trimEnd();
}

/** forDisplay + link stripping, for PROSE fields (narration, block notes, tour lines) — never for
 *  block props, some of which (an image `src`, a link `href`) are legitimately URLs. Keeps the shown
 *  side of any [[shown|said]] span, then removes inline citations the reader doesn't need. */
export function proseForDisplay(text: string): string {
  return stripLinks(forDisplay(text));
}

/** forSpeech + link stripping, so the voice never reads a URL aloud. */
export function proseForSpeech(text: string): string {
  return stripLinks(forSpeech(text));
}

/** A money/number token, with the unit word the model tends to echo ("$200", "200 dollars", "5%"). */
const VALUE_TOKEN = String.raw`\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:dollars?|USD|cents?|percent|%))?`;
/** The same value stated twice in a row, separated only by space/comma/semicolon. The `i` flag makes
 *  the backreference case-insensitive too, so "200 Dollars 200 dollars" collapses as well. */
const REPEATED_VALUE = new RegExp(`(${VALUE_TOKEN})(\\s*[,;]?\\s+)\\1(?!\\w)`, 'gi');

/** Collapse an immediately-repeated number/currency value ("$200, $200" → "$200"). When a turn
 *  completes a filled-in blank, the model occasionally restates the value back-to-back; this is the
 *  deterministic floor that keeps that out of both the screen and the voice, whatever caused it.
 *  Scoped to value tokens (not arbitrary words), so it never eats a legitimate repeated word. */
export function collapseRepeatedValues(text: string): string {
  let out = text;
  let prev: string;
  do {
    prev = out;
    out = out.replace(REPEATED_VALUE, '$1'); // loop folds triples ("$5, $5, $5") down to one
  } while (out !== prev);
  return out;
}

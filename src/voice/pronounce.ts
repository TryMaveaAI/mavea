// pronounce.ts — the static pronunciation floor + the speech-side resolver.
//
// The model marks tricky spans inline as [[shown|said]] (see lib/spokenText); the validator
// derives a clean spoken twin from those. THIS module adds the always-on floor: the handful of
// common acronyms the model might leave un-annotated ("CUDA" → "kooda"), respelled AFTER the
// inline annotation is resolved. Genuine initialisms (API, GPU, URL, HTML) are left to be spelled
// out, which is correct. pronounceForSpeech() is the single transform applied at the speech
// chokepoint, so every spoken line is voiced right even when the model didn't annotate it.

import { collapseRepeatedValues, forSpeech } from '../lib/spokenText';

/* ---- static floor: common word-acronyms the model may not bother to annotate ---- */

/** Term (as written) → how a fluent speaker says it, as a plain lowercase respelling the
 *  synthesizer reads as a word. Small on purpose: the inline annotations are the real
 *  mechanism; this only backstops the handful of acronyms that are reliably mis-said. */
const STATIC_LEXICON: Readonly<Record<string, string>> = {
  // The product's own name is deliberately absent. It is written, never spoken: the accent trips
  // every synthesizer, and the respelling that fixes one engine breaks in the next — so sayable()
  // drops the name from spoken lines entirely rather than teaching each engine a spelling. A
  // respelling here would be unreachable (sayable runs first) and, worse, would speak the name
  // aloud for any caller that skipped it. See tests/voice-sayable-brand.test.ts.
  //
  // Native Japanese おまかせ (o-ma-ka-se). Keep common casing variants because this is an
  // ordinary loanword, unlike the deliberately case-sensitive technology acronyms below.
  Omakase: 'oh-mah-kah-seh',
  omakase: 'oh-mah-kah-seh',
  OMAKASE: 'oh-mah-kah-seh',
  CUDA: 'kooda',
  cuDNN: 'koo dee en en',
  JSON: 'jason',
  YAML: 'yammel',
  GUI: 'gooey',
  SaaS: 'sass',
  ASCII: 'askee',
  WYSIWYG: 'wizzywig',
  NASA: 'nassa',
  NASDAQ: 'nazdack',
  JPEG: 'jaypeg',
  OAuth: 'oh-auth',
  nginx: 'engine x',
  PyTorch: 'pie torch',
  Qwen: 'kwen',
  SQLite: 'sequel lite',
  MySQL: 'my sequel',
  PostgreSQL: 'postgres',
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest key first; alphanumeric boundaries (not \b) so "C++"-style terms could match and an
// optional trailing plural "s" is carried ("GUIs" → "gooeys"). Case-sensitive — terms are
// matched exactly as written.
const STATIC_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(${Object.keys(STATIC_LEXICON)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})(s)?(?![A-Za-z0-9])`,
  'g',
);

function applyStaticFloor(text: string): string {
  return text.replace(STATIC_PATTERN, (_m, term: string, plural?: string) => {
    const said = STATIC_LEXICON[term as keyof typeof STATIC_LEXICON];
    return plural ? `${said}${plural}` : said;
  });
}

/* ---- month-abbreviation floor: "Aug 2" must never be voiced as the word "Aug" ---- */

const MONTH_FULL: Readonly<Record<string, string>> = {
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  Jun: 'June',
  Jul: 'July',
  Aug: 'August',
  Sep: 'September',
  Sept: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
};

// Only when the abbreviation actually reads as a date — a following day/year number (optionally
// after a period or comma: "Aug 2", "Aug. 2026") — so a name like "Jan said…" or a random "Mar"
// token in prose is never rewritten. "May" isn't here (it's already the full word), and this runs
// AFTER inline annotations resolve, so a model-annotated span always wins over this floor.
const MONTH_PATTERN = new RegExp(
  `(?<![A-Za-z])(${Object.keys(MONTH_FULL).join('|')})\\.?(?=,?\\s+\\d)`,
  'g',
);

function expandMonthAbbrevs(text: string): string {
  return text.replace(MONTH_PATTERN, (_m, abbr: string) => MONTH_FULL[abbr]);
}

/**
 * Turn a line into what the voice should actually say: resolve [[shown|said]] annotations to
 * their said side, then respell any common acronym and expand any bare month abbreviation the
 * model left un-annotated. Pure — returns a new string. This is the single transform applied at
 * the speech chokepoint, so every spoken line (narration, tour line, tapped-card note) is voiced
 * correctly even when the model forgot to annotate.
 */
export function pronounceForSpeech(text: string): string {
  return expandMonthAbbrevs(applyStaticFloor(collapseRepeatedValues(forSpeech(text))));
}

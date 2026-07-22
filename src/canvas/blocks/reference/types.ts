// reference family block types — knowledge, language, and lookup primitives
// (structured fact sheets, news digests, dictionary cards, translations,
// pronunciation guides, glossaries). Prop shapes are realistic & sample-friendly —
// a data agent fills them later.
import type { BlockBase, AccentVar, HtmlString } from '../../../data/conversation';
// IconKey re-export from `conversation` is missing in the current scaffold (a shared file
// we must not edit), so import it from its canonical source — same type, identical to what
// `conversation` itself imports.
import type { IconKey } from '../../../types/mavea';

/* ── factsheet ── structured fact summary about a topic, person, place, thing ── */
// Use for: "tell me about X", "who is X", "facts about X"
export interface FactItem {
  label: string; // e.g. "Founded", "Population", "CEO"
  value: string; // the fact value
  note?: string; // optional clarification
}
export interface FactSheetProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** what this is a fact sheet about */
  subject: string;
  /** one-sentence description */
  tagline?: string;
  facts: FactItem[];
  /** optional short prose section */
  body?: HtmlString;
  footer?: HtmlString;
}

/* ── newsdigest ── a curated digest of news headlines / summaries ── */
// Use for: "news today", "what happened with X", "latest on Y"
// REQUIRES: asOf must always be shown — this is search-grounded real content
export interface NewsItem {
  headline: string;
  source?: string;
  summary?: string;
  /** "2 hours ago", "Dec 9" */
  time?: string;
  /** "Tech", "Politics", "Science" */
  category?: string;
}
export interface NewsDigestProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the topic being covered */
  topic?: string;
  /** REQUIRED: "as of Dec 9, 2024" — always show when real */
  asOf: string;
  items: NewsItem[];
  footer?: HtmlString;
}

/* ── dictionary ── word definition card ── */
export interface DictSense {
  /** part of speech: "noun", "verb", "adj" */
  pos: string;
  definition: string;
  example?: string;
  synonyms?: string[];
}
export interface DictionaryProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  word: string;
  /** "/ˌdɪkʃəˈnɛri/" */
  phonetic?: string;
  /** TTS hint (not rendered directly) */
  audio?: string;
  senses: DictSense[];
  etymology?: string;
  footer?: HtmlString;
}

/* ── translation ── source text + translation(s), with optional breakdown ── */
export interface TranslationPair {
  original: string;
  translated: string;
  /** grammar note, literal meaning, etc. */
  note?: string;
}
export interface TranslationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** "English" */
  fromLang: string;
  /** "Spanish" */
  toLang: string;
  /** the full source text */
  text: string;
  /** the full translated text */
  result: string;
  /** sentence-by-sentence breakdown (optional) */
  pairs?: TranslationPair[];
  footer?: HtmlString;
}

/* ── pronunciation ── IPA / phonetic guide ── */
export interface PronunciationProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  word: string;
  /** International Phonetic Alphabet, e.g. "/prəˌnʌnsiˈeɪʃən/" */
  ipa?: string;
  /** hyphenated: "pro·nun·ci·a·tion" */
  syllables?: string;
  /** phoneme tips, e.g. ["The 'c' is silent", "Stress on 4th syllable"] */
  tips?: string[];
  footer?: HtmlString;
}

/* ── gloss ── a glossary of terms with definitions ── */
export interface GlossEntry {
  term: string;
  definition: string;
  /** cross-reference to another term */
  see?: string;
}
export interface GlossProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** "Machine Learning", "Medical", "Legal" */
  domain?: string;
  entries: GlossEntry[];
  footer?: HtmlString;
}

/* ── scalefelt ── makes an abstract magnitude tangible via relatable equivalences ── */
// Use for: "how big/far/loud/old/heavy is X" — the raw figure, then comparisons that
// give it a feel ("as tall as ~12 double-decker buses", "the drive would take ~177 years").
export interface ScaleComparison {
  /** the relatable thing the magnitude is measured against, e.g. "double-decker buses" */
  to: string;
  /** how many of `to` — a number, or descriptive text ("a lifetime") when no count fits */
  howMany: number | string;
  /** optional clarifying aside, e.g. "stacked end to end" */
  note?: string;
}
export interface ScaleFeltProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the raw quantity, shown big, e.g. "330" or "13.8 billion" */
  value: string;
  /** the unit for the figure, e.g. "metres", "years", "decibels" */
  unit?: string;
  comparisons: ScaleComparison[];
  footer?: HtmlString;
}

/* ── hearit ── play a sound for each item: spoken word, musical note, or raw tone ── */
// Voice-first reference card. Each item is a tap-to-play row. For 'word' the value
// is text spoken via Web Speech; for 'note'/'tone' the value is a frequency in Hz
// (number or numeric string) or a note name (e.g. "A4", "C#5", "Bb3") mapped to Hz
// and sounded by a short one-shot WebAudio oscillator. Use for pronunciation drills,
// musical-interval ear-training, and tuning references.
export interface HearItItem {
  /** what the row is — the word, the note name, the label for the tone */
  label: string;
  /** how to sound it: speak the text, or play a pitch */
  kind: 'word' | 'note' | 'tone';
  /** for 'word' the text to speak; for 'note'/'tone' a frequency in Hz or a note name */
  value: string | number;
  /** optional secondary line, e.g. a hint or the resolved pitch */
  sub?: string;
}
export interface HearItProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  items: HearItItem[];
  footer?: HtmlString;
}

/* ── ipachart ── International Phonetic Alphabet reference (vowels or consonants) ── */
// Voice-first phonetics card. Renders either the IPA vowel quadrilateral (a trapezoid
// with vowels placed at their tongue height × backness) or the pulmonic consonant grid
// (place × manner). The built-in symbol layout means a model only has to name which
// symbols to emphasise and (optionally) a few example words — no coordinates required.
// Use for: "how do I pronounce this vowel", "IPA chart", "English vowel sounds".
export interface IpaExample {
  /** the IPA symbol the word demonstrates, e.g. "iː" */
  symbol: string;
  /** the example word that contains the sound, e.g. "beat" */
  word: string;
}
export interface IpaChartProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** which built-in chart to draw (defaults to 'vowels') */
  kind?: 'vowels' | 'consonants';
  /** IPA symbols to emphasise, e.g. ["iː", "ɪ", "æ"] */
  highlight?: string[];
  /** symbol → example-word pairs listed beneath the chart */
  examples?: IpaExample[];
  /** short note under the chart */
  caption?: string;
  footer?: HtmlString;
}

/* ── scriptstroke ── stroke-order writing guide for a foreign character ── */
// A "how to write this character" card: the glyph drawn large on a calligraphy grid
// (米字格 / 田字格 guide lines), numbered stroke order, romanization and meaning. When a
// stroke carries an SVG path it is drawn in order with a numbered badge; otherwise the
// glyph is shown big with an ordered list of stroke hints. Use for: "how to write 木",
// "stroke order of this kanji", "writing guide for this character".
export interface ScriptStrokeStep {
  /** an SVG path for this stroke in the 0..100 grid space (optional) */
  path?: string;
  /** 1-based stroke number — the order it is written */
  order: number;
  /** a short description of the stroke, e.g. "horizontal, left to right" */
  hint?: string;
}
export interface ScriptStrokeProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the character being taught, e.g. "木" */
  glyph: string;
  /** the strokes in writing order */
  strokes: ScriptStrokeStep[];
  /** which guide grid to draw behind the glyph (defaults to 'mi') */
  grid?: 'tian' | 'mi' | 'none';
  /** phonetic reading, e.g. "mù" (pinyin) or "き / モク" (kana) */
  romanization?: string;
  /** the meaning, e.g. "tree, wood" */
  meaning?: string;
  /** short note under the glyph */
  caption?: string;
  footer?: HtmlString;
}

/* ── phonicsword ── decode a word into its sound chunks ── */
// A phonics "sound it out" card: the target word split into the units it is read in —
// per-grapheme boxes (c·a·t), digraphs/blends shown as one highlighted unit (sh, str),
// silent letters greyed out — plus an optional row of rhyming words. The chunks ARE the
// decoding: the boxes are scaffolding but every letter shown comes from the props, so the
// joined chunk text must reconstruct the word. Use for: "how do I read 'ship'", "sound out
// this word", early-reading / phonics drills.
export interface PhonicsChunk {
  /** the letters in this chunk, e.g. "sh", "i", "p" — concatenated, the chunks spell `word` */
  text: string;
  /** how the chunk sounds, e.g. "/ʃ/", "/ɪ/" — shown small beneath the box */
  sound?: string;
  /** what kind of unit this is; drives its colour and the silent-letter greying */
  kind?: 'onset' | 'rime' | 'grapheme' | 'digraph' | 'blend' | 'silent';
}
export interface PhonicsWordProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the whole word being decoded, e.g. "ship" */
  word: string;
  /** the word split into the units it is read in, in left-to-right order */
  chunks: PhonicsChunk[];
  /** words that rhyme with it, e.g. ["chip", "trip", "flip"] */
  rhymes?: string[];
  /** short note under the word */
  caption?: string;
  footer?: HtmlString;
}

/* ── speciescard ── a nature field-ID card for an organism ── */
// A "what am I looking at" card for a plant or animal: a photo/illustration banner
// (a real `image.src` when given, else the from/to gradient like the media family),
// the common + scientific name, an ID field-marks band (size/colour/habitat/range/song/
// season as label→value chips), a "confusion species" look-alike strip, and an optional
// conservation status. The field marks ARE the identification — every chip comes from the
// props. Use for: "what bird is this", "identify this wildflower", a field-guide entry.
export interface SpeciesMark {
  /** the ID dimension, e.g. "Size", "Colour", "Habitat", "Range", "Song", "Season" */
  label: string;
  /** the field value, e.g. "23–28 cm", "rusty-orange breast, grey back" */
  value: string;
}
export interface SpeciesCardProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the everyday name, e.g. "American Robin" */
  commonName: string;
  /** the Latin binomial, e.g. "Turdus migratorius" — rendered in italics */
  scientificName?: string;
  /** the banner illustration: a real photo `src` if available, else a from→to gradient */
  image?: { from: AccentVar; to: AccentVar; src?: string };
  /** the ID field marks shown as label→value chips */
  marks: SpeciesMark[];
  /** species it's easily confused with — the "is it actually…?" strip */
  lookalikes?: string[];
  /** conservation status, e.g. "Least concern", "Endangered" */
  status?: string;
  /** short note under the names */
  caption?: string;
  footer?: HtmlString;
}

/* ── etymtree ── word-origin tree: roots flow in from the left, the word sits centre,
   descendants/cognates branch out to the right. Each node carries a language badge and
   optional gloss. Connectors are smooth bezier paths. Use for vocabulary tuition,
   historical linguistics, and etymology explanations. */
export interface EtymRoot {
  /** the ancestral form, e.g. "*ped-" */
  form: string;
  /** language of origin, e.g. "Proto-Indo-European", "Latin" */
  lang: string;
  /** optional gloss / meaning, e.g. "foot" */
  gloss?: string;
}

export interface EtymDesc {
  /** the derived form in the descendant language */
  form: string;
  /** the language, e.g. "French", "Spanish" */
  lang?: string;
  /** optional gloss */
  gloss?: string;
}

export interface EtymTreeProps {
  /** the word being explained, shown in the centre box */
  word: string;
  /** ancestral roots flowing in from the left */
  roots?: EtymRoot[];
  /** descendant words / cognates branching to the right */
  descendants?: EtymDesc[];
  /** a short note under the figure */
  note?: string;
  footer?: HtmlString;
}

/* ── hazardcard ── GHS chemical hazard / safety data summary ──
   A regulatory safety-data card: the signal word ("Danger"/"Warning") up top, the GHS
   pictograms that apply, then the hazard (H-code) and precautionary (P-code) statements
   in full. Use for: "is X dangerous", "safety data for X", "what are the hazards of X". */
export type GhsPictogram =
  | 'flammable'
  | 'corrosive'
  | 'toxic'
  | 'irritant'
  | 'oxidizer'
  | 'healthHazard'
  | 'environment'
  | 'explosive'
  | 'compressedGas';

export interface HazardStatement {
  /** the H- or P-code, e.g. "H225", "P210" */
  code: string;
  /** the statement text, e.g. "Highly flammable liquid and vapour" */
  text: string;
}

export interface HazardCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** CAS registry number, e.g. "67-64-1" */
  cas?: string;
  /** GHS signal word — the single most severe classification, always shown */
  signalWord: 'Danger' | 'Warning';
  /** which GHS pictograms apply, in the order they should appear */
  pictograms: GhsPictogram[];
  /** hazard (H-code) statements, e.g. { code: "H225", text: "Highly flammable liquid and vapour" } */
  hazards: HazardStatement[];
  /** precautionary (P-code) statements, e.g. { code: "P210", text: "Keep away from heat/sparks/open flames" } */
  precautions: HazardStatement[];
  footer?: HtmlString;
}

/* ── termbase ── multi-language term-consistency table for professional translators ──
   One row per source term, one column per target language, so a reviewer can scan
   straight down a language column and catch an inconsistent rendering at a glance.
   Each cell carries an approval `status` — preferred/deprecated/avoid — the exact
   distinction a translation-memory glossary review is for. Use for localization QA,
   terminology glossaries, "how do we say X consistently across languages". */
export interface TermTranslation {
  /** target language, e.g. "French", "de-DE", "Japanese" */
  lang: string;
  /** the approved (or flagged) rendering in that language */
  text: string;
  /** approval state for this specific rendering; omit for a plain, unflagged entry */
  status?: 'preferred' | 'deprecated' | 'avoid';
}
export interface TermEntry {
  /** the source term this row is about, e.g. "Cancel", "Delete Account" */
  term: string;
  translations: TermTranslation[];
}
export interface TermBaseProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  terms: TermEntry[];
  footer?: HtmlString;
}

/* ── sizecompare ── silhouette-based scale comparison ──
   Flat body silhouettes scaled to each subject's real length and lined up on a shared
   ground baseline — the classic "how big is a blue whale next to a bus" infographic.
   Distinct from ScaleFelt's proportional-BAR technique: here the magnitude reads
   through a recognisable shape's own footprint, not an abstract track. Use for
   "how big/long/tall is X compared to Y", size-showdown questions. */
export interface SizeSubject {
  /** what's being sized, e.g. "Blue whale", "School bus", "You" */
  label: string;
  /** real-world length/height in `unit`, as a number */
  length: number;
  /** which silhouette to draw; unrecognised or omitted falls back to a plain rounded shape */
  shape?: 'whale' | 'bus' | 'human' | 'building' | 'generic';
}
export interface SizeCompareProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** unit every `length` is measured in, e.g. "m", "ft" */
  unit?: string;
  subjects: SizeSubject[];
  footer?: HtmlString;
}

/* ── baseconversion ── number-system / radix conversion card ──
   The same value written out in several number bases side by side, digits grouped in
   fours from the right (a nibble/place-value rhythm) so long binary and hex strings
   stay readable. Use for "convert X to binary/hex", CS-fundamentals number-systems
   teaching. */
export interface BaseRow {
  /** the number system's name, e.g. "Binary", "Octal", "Decimal", "Hexadecimal" */
  label: string;
  /** the base as a number: 2, 8, 10, 16, … */
  radix: number;
  /** the value written in this base, digits only (no "0x"/"0b" prefix) */
  digits: string;
}
export interface BaseConversionProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the value being converted, shown as the headline figure, e.g. "210" */
  value: string;
  bases: BaseRow[];
  footer?: HtmlString;
}

/* ── historicalperson ── biography profile card ──
   A monogram medallion, name + era headline, birth/death as a lead stat pair, a
   compact strip of life-beats, and a short legacy paragraph. Use for "who was X",
   biography lookups, history-class figure profiles. */
export interface HistoricalFact {
  label: string;
  value: string;
}
export interface LifeEvent {
  /** a year or short date, shown verbatim — never parsed, so "384 BCE" or "c. 1500" work */
  year: string;
  label: string;
}
export interface HistoricalPersonProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  name: string;
  /** the period they're associated with, e.g. "Renaissance", "19th century" */
  era?: string;
  /** birth date/place, e.g. "April 15, 1452 — Vinci, Republic of Florence" */
  born?: string;
  /** death date/place, e.g. "May 2, 1519 — Amboise, France" */
  died?: string;
  /** one-line claim to fame */
  knownFor?: string;
  facts?: HistoricalFact[];
  lifeEvents?: LifeEvent[];
  /** short closing prose on lasting impact */
  legacy?: string;
  footer?: HtmlString;
}

/* ── onthisday ── "what happened on this date" fact card ──
   Reuses NewsDigest's headline + timestamp-chip rhythm, except the chip carries a
   bare year instead of a recency string, plus a compact Born/Died footer strip. Use
   for "what happened on this day", "on this date in history". */
export interface OnThisDayEvent {
  /** the year it happened, shown verbatim in the chip (e.g. 1969, "384 BCE") */
  year: string | number;
  label: string;
  /** "War", "Science", "Culture", … */
  category?: string;
}
export interface OnThisDayPerson {
  year: string | number;
  name: string;
}
export interface OnThisDayProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the calendar date being covered, e.g. "July 3" */
  date: string;
  events: OnThisDayEvent[];
  born?: OnThisDayPerson[];
  died?: OnThisDayPerson[];
  footer?: HtmlString;
}

/* ── countrycard ── single-country deep-dive ──
   A flag banner, a field-marks row (capital/population/area/currency), and a short
   fact list. Use for "tell me about X country", geography lookups. Distinct from
   worldgrid, which compares many countries at a compact glance. */
export interface CountryFact {
  label: string;
  value: string;
}
export interface CountryCardProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  name: string;
  /** the flag emoji, e.g. "🇯🇵" — rendered directly, no image fetch needed */
  flag?: string;
  capital?: string;
  /** pre-formatted, e.g. "125.7 million" */
  population?: string;
  /** pre-formatted, e.g. "377,975 km²" */
  area?: string;
  officialLanguages?: string[];
  currency?: string;
  facts?: CountryFact[];
  footer?: HtmlString;
}

/* ── worldgrid ── compact multi-country comparison grid ──
   A tile per country: flag glyph, name, and a couple of micro label/value rows.
   Distinct from countrycard's single-country deep-dive — this is the "at a glance
   across many" view. Use for "compare these countries", regional overviews. */
export interface WorldGridCountry {
  flag?: string;
  name: string;
  capital?: string;
  currency?: string;
  language?: string;
}
export interface WorldGridProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  countries: WorldGridCountry[];
  footer?: HtmlString;
}

/* ── warconflict ── historical conflict overview ──
   Two (or more) color-coded side columns, a compact key-battles strip, and outcome
   prose. Use for "tell me about this war/conflict", history-class overviews. */
export interface ConflictSide {
  name: string;
  leaders?: string[];
  /** tints this side's column; sides without one fall back to a default sequence */
  color?: AccentVar;
}
export interface KeyBattle {
  label: string;
  /** when/where it happened, e.g. "1863, Gettysburg, PA" */
  at?: string;
}
export interface WarConflictProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the conflict's date span, e.g. "1861–1865" */
  dates?: string;
  sides: ConflictSide[];
  keyBattles?: KeyBattle[];
  /** a short prose or figure summary of losses */
  casualties?: string;
  /** how it ended */
  outcome?: string;
  footer?: HtmlString;
}

/* ── posbreakdown ── color-coded parts-of-speech sentence breakdown ──
   The sentence as an inline-wrapping flow of word chips — each word underlined and
   tinted by its word class, with a tiny abbreviation (n., v., adj.) beneath.
   Punctuation rides unstyled beside its word so a line wrap never strands a mark.
   A legend lists only the classes present and click-toggles a spotlight on one.
   Use for grammar lessons, ESL teaching, foreign-language sentence study. */
export type PosClass =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'determiner'
  | 'interjection'
  | 'punctuation';
export interface PosToken {
  /** the word (or punctuation mark) exactly as it appears in the sentence */
  word: string;
  /** its word class — drives the underline tint and the abbreviation beneath */
  pos: PosClass;
  /** short grammatical gloss, e.g. "past tense", "subject" — footnoted below the flow */
  note?: string;
}
export interface PosBreakdownProps {
  title: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** the sentence, one token per word / punctuation mark, in reading order */
  tokens: PosToken[];
  /** the plain sentence — the fallback render when tokens are missing */
  sentence?: string;
  /** the sentence's meaning in another language, shown quietly beneath the flow */
  translation?: string;
  footer?: HtmlString;
}

export type ReferenceBlock =
  | (BlockBase & { type: 'factsheet'; props: FactSheetProps })
  | (BlockBase & { type: 'newsdigest'; props: NewsDigestProps })
  | (BlockBase & { type: 'dictionary'; props: DictionaryProps })
  | (BlockBase & { type: 'translation'; props: TranslationProps })
  | (BlockBase & { type: 'pronunciation'; props: PronunciationProps })
  | (BlockBase & { type: 'gloss'; props: GlossProps })
  | (BlockBase & { type: 'scalefelt'; props: ScaleFeltProps })
  | (BlockBase & { type: 'hearit'; props: HearItProps })
  | (BlockBase & { type: 'ipachart'; props: IpaChartProps })
  | (BlockBase & { type: 'scriptstroke'; props: ScriptStrokeProps })
  | (BlockBase & { type: 'phonicsword'; props: PhonicsWordProps })
  | (BlockBase & { type: 'speciescard'; props: SpeciesCardProps })
  | (BlockBase & { type: 'etymtree'; props: EtymTreeProps })
  | (BlockBase & { type: 'hazardcard'; props: HazardCardProps })
  | (BlockBase & { type: 'termbase'; props: TermBaseProps })
  | (BlockBase & { type: 'sizecompare'; props: SizeCompareProps })
  | (BlockBase & { type: 'baseconversion'; props: BaseConversionProps })
  | (BlockBase & { type: 'historicalperson'; props: HistoricalPersonProps })
  | (BlockBase & { type: 'onthisday'; props: OnThisDayProps })
  | (BlockBase & { type: 'countrycard'; props: CountryCardProps })
  | (BlockBase & { type: 'worldgrid'; props: WorldGridProps })
  | (BlockBase & { type: 'warconflict'; props: WarConflictProps })
  | (BlockBase & { type: 'posbreakdown'; props: PosBreakdownProps });

// Catalog entries for the `reference` family — the fact sheet the Live selector retrieves over
// and the prompt menu is built from. This module carries the DETAIL fields (blurb, requires,
// optional, item shapes, prop hints); the compact selection facts are generated from it into
// facts.generated.ts. It is loaded lazily, only for the families a turn actually reaches, which is
// what keeps per-turn cost proportional to the answer rather than to the library.
//
// After editing, run `pnpm gen:catalog` — a staleness test fails the build otherwise.
import { createMeta, type ComponentCatalog } from '../meta';

export const CATALOG_REFERENCE: ComponentCatalog = [
  createMeta('scalefelt', {
    family: 'reference',
    dataShapes: ['scalar', 'comparison', 'list'],
    requires: ['title', 'value', 'comparisons'],
    optional: ['icon', 'iconColor', 'unit', 'footer'],
    interactive: false,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'Makes an abstract magnitude tangible — the raw figure shown big, then relatable equivalences ("as tall as ~12 double-decker buses", "the drive would take ~177 years") with a proportional cue. For "how big/far/loud/old is X".',
    itemShapes: [{ prop: 'comparisons', text: 'to', textAliases: ['thing', 'item', 'label'] }],
    propHints: {
      value: 'the raw quantity as a string, e.g. "330" or "13.8 billion"',
      unit: 'unit for the figure, e.g. "metres", "years", "decibels"',
      'comparisons[].howMany':
        'a number for a proportional bar (e.g. 12, 177) or descriptive text when no count fits (e.g. "a lifetime")',
      'comparisons[].to': 'the relatable thing, e.g. "double-decker buses", "trips around Earth"',
    },
    intents: ['explain', 'quantify', 'reference'],
  }),
  createMeta('hearit', {
    family: 'reference',
    dataShapes: ['list', 'media'],
    requires: ['title', 'items'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: true,
    wowWeight: 0.74,
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A tap-to-play sound list — each row sounds a spoken word, a musical note, or a raw tone. For pronunciation, ear-training intervals, and tuning references.',
    itemShapes: [{ prop: 'items', text: 'label', textAliases: ['name', 'title', 'term'] }],
    propHints: {
      'items[].kind': "'word'|'note'|'tone'",
      'items[].value':
        'for \'word\' the text to speak; for \'note\'/\'tone\' a frequency in Hz (e.g. 440) or a note name (e.g. "A4", "C#5", "Bb3")',
    },
    intents: ['reference', 'explain'],
  }),
  // ── reference family ─────────────────────────────────────────────────────────
  createMeta('factsheet', {
    family: 'reference',
    dataShapes: ['text', 'list'],
    requires: ['title', 'subject', 'facts'],
    optional: ['icon', 'iconColor', 'tagline', 'body', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A structured fact sheet about a person, place, or thing — labeled key/value rows with an optional prose section.',
    itemShapes: [{ prop: 'facts', text: 'label', textAliases: ['key', 'name', 'field'] }],
    propHints: {
      'facts[].label': 'short field name, e.g. "Founded", "Population", "HQ"',
    },
  }),
  createMeta('newsdigest', {
    family: 'reference',
    dataShapes: ['list', 'text'],
    requires: ['title', 'asOf', 'items'],
    optional: ['icon', 'iconColor', 'topic', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A curated news digest — headlines, sources, timestamps, and summaries — always timestamped with "as of" for real data.',
    itemShapes: [{ prop: 'items', text: 'headline', textAliases: ['title', 'header'] }],
    propHints: {
      asOf: 'ISO date or human-readable, e.g. "June 9, 2026"',
      'items[].recency': '"X hours ago"|"X days ago"|date string',
    },
  }),
  createMeta('dictionary', {
    family: 'reference',
    dataShapes: ['text'],
    requires: ['title', 'word', 'senses'],
    optional: ['icon', 'iconColor', 'phonetic', 'etymology', 'footer'],
    interactive: false,
    wowWeight: 0.7,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A full dictionary card for a single word — phonetic, part-of-speech, numbered definitions with examples, synonyms, and etymology. Use whenever the ask is "define X", "what does X mean", or "etymology of X".',
    itemShapes: [{ prop: 'senses', text: 'definition', textAliases: ['meaning', 'explanation'] }],
  }),
  createMeta('translation', {
    family: 'reference',
    dataShapes: ['text', 'comparison'],
    requires: ['title', 'fromLang', 'toLang', 'text', 'result'],
    optional: ['icon', 'iconColor', 'pairs', 'footer'],
    interactive: false,
    wowWeight: 0.65,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Source text alongside its translation — language pair, full result, optional sentence-by-sentence breakdown with notes.',
    itemShapes: [{ prop: 'pairs', text: 'original', textAliases: ['source', 'text', 'from'] }],
  }),
  createMeta('pronunciation', {
    family: 'reference',
    dataShapes: ['text'],
    requires: ['title', 'word'],
    optional: ['icon', 'iconColor', 'ipa', 'syllables', 'tips', 'footer'],
    interactive: false,
    wowWeight: 0.55,
    tier: 'base',
    colDefault: 5,
    colMin: 3,
    coercer: 'generic',
    blurb:
      'A pronunciation guide — IPA, syllable breakdown, and phoneme tips to help someone say a word correctly.',
    stringItems: ['tips'],
  }),
  createMeta('gloss', {
    family: 'reference',
    dataShapes: ['list', 'text'],
    requires: ['title', 'entries'],
    optional: ['icon', 'iconColor', 'domain', 'footer'],
    interactive: false,
    wowWeight: 0.6,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A domain glossary — terms with definitions, cross-references, and an optional domain label.',
    itemShapes: [
      {
        prop: 'entries',
        text: 'definition',
        textAliases: ['meaning', 'explanation', 'desc'],
        requiredFields: ['term'],
      },
    ],
  }),
  createMeta('ipachart', {
    family: 'reference',
    dataShapes: ['structure', 'list', 'text'],
    requires: ['title'],
    optional: ['icon', 'iconColor', 'kind', 'highlight', 'examples', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'An IPA phonetics reference with a built-in symbol layout — the vowel quadrilateral (tongue height × backness) or the pulmonic consonant grid (place × manner) — with chosen symbols emphasised and a symbol→example-word legend. For "IPA chart", "English vowel sounds", "how this phoneme is articulated".',
    itemShapes: [
      {
        prop: 'examples',
        text: 'word',
        textAliases: ['example', 'sample'],
        requiredFields: ['symbol'],
      },
    ],
    propHints: {
      kind: "'vowels'|'consonants' — which built-in chart to draw (default 'vowels')",
      highlight:
        'array of IPA symbols to emphasise, e.g. ["iː","ɪ","æ"]; length marks and slashes are ignored when matching',
      'examples[].symbol': 'the IPA symbol the word demonstrates, e.g. "iː"',
      'examples[].word': 'an example word containing the sound, e.g. "beat"',
    },
    domains: ['language'],
    intents: ['reference', 'explain'],
    stringItems: ['highlight'],
  }),
  createMeta('scriptstroke', {
    family: 'reference',
    dataShapes: ['sequence', 'structure', 'text'],
    requires: ['title', 'glyph', 'strokes'],
    optional: ['icon', 'iconColor', 'grid', 'romanization', 'meaning', 'caption', 'footer'],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 5,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A foreign-character writing guide — the glyph on a calligraphy practice grid (米字格/田字格), numbered stroke order, romanization and meaning. When strokes carry SVG paths they draw in sequence with numbered start badges; otherwise the glyph is shown big with an ordered stroke-hint list. For "stroke order of X", "how to write this kanji/hanzi".',
    itemShapes: [{ prop: 'strokes', text: 'hint', textAliases: ['description', 'desc', 'step'] }],
    propHints: {
      glyph: 'the single character being taught, e.g. "木"',
      grid: "'tian'|'mi'|'none' — the guide grid (mi = eight lines, tian = centre cross; default 'mi')",
      'strokes[].order': '1-based stroke number — the order it is written',
      'strokes[].path':
        'optional SVG path string in a 0..100 grid space (e.g. "M20 35 H80"); the stroke is drawn and its number badge pinned to the path start',
      'strokes[].hint': 'a short description of the stroke, e.g. "horizontal, left to right"',
      romanization: 'phonetic reading, e.g. "mù" (pinyin) or "き / モク" (kana)',
      meaning: 'the character’s meaning, e.g. "tree, wood"',
    },
    domains: ['language'],
    intents: ['howto', 'reference'],
  }),
  createMeta('phonicsword', {
    family: 'reference',
    dataShapes: ['list', 'text'],
    requires: ['word', 'chunks'],
    optional: ['title', 'icon', 'iconColor', 'rhymes', 'caption', 'footer'],
    interactive: true,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 5,
    colMin: 3,
    coercer: 'generic',
    blurb:
      'A phonics word-decoding card — the word split into tap-to-hear sound chunks (per-grapheme boxes, digraphs/blends as one unit, silent letters greyed), with an optional rhyming-words row.',
    domains: ['language', 'education'],
    intents: ['explain', 'howto', 'reference'],
    itemShapes: [{ prop: 'chunks', text: 'text', textAliases: ['letters', 'grapheme', 'part'] }],
    propHints: {
      'chunks[].kind': "'onset'|'rime'|'grapheme'|'digraph'|'blend'|'silent'",
      'chunks[].text': 'the letters in this chunk — joined left-to-right, the chunks spell `word`',
      'chunks[].sound': "how the chunk sounds, e.g. '/ʃ/', '/ɪ/'",
    },
    stringItems: ['rhymes'],
  }),
  createMeta('speciescard', {
    family: 'reference',
    dataShapes: ['keyvalue', 'media', 'text'],
    requires: ['commonName', 'marks'],
    optional: [
      'title',
      'icon',
      'iconColor',
      'scientificName',
      'image',
      'lookalikes',
      'status',
      'caption',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.72,
    tier: 'frontier',
    colDefault: 6,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A nature field-ID card for a plant or animal — a photo/illustration banner, common + scientific name, an ID field-marks band (size · colour · habitat · range · song · season), a confusion-species strip, and conservation status. For "what bird/flower is this", a field-guide entry.',
    itemShapes: [{ prop: 'marks', text: 'label', textAliases: ['key', 'name', 'field'] }],
    propHints: {
      commonName: 'the everyday name, e.g. "American Robin"',
      scientificName: 'the Latin binomial, e.g. "Turdus migratorius" (shown italic)',
      'marks[].label': 'ID dimension, e.g. "Size", "Colour", "Habitat", "Range", "Song", "Season"',
      'marks[].value': 'the field value, e.g. "23–28 cm", "rusty-orange breast, grey back"',
      lookalikes: 'array of species it is easily confused with',
      status: 'conservation status, e.g. "Least concern", "Endangered"',
      image: 'banner gradient { from, to } with accent vars; add a real photo `src` when available',
    },
    intents: ['reference', 'explain'],
    domains: ['nature'],
    stringItems: ['lookalikes'],
  }),
  createMeta('etymtree', {
    family: 'reference',
    dataShapes: ['hierarchy', 'text'],
    requires: ['word', 'roots'],
    optional: ['descendants', 'note', 'footer'],
    wowWeight: 0.78,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'Word-origin tree: roots flow in from the left, the focus word sits centre, descendants/cognates branch out to the right. Each entry carries a language-of-origin badge and optional gloss. Use for vocabulary tuition, historical linguistics, GMAT/GRE word-roots prep.',
    propHints: {
      word: 'the focus word whose etymology is shown',
      'roots[].form': 'ancestral form, e.g. "*pṓds", "lūna"',
      'roots[].lang': 'language of origin, e.g. "Proto-Indo-European", "Latin", "Old French"',
      'roots[].gloss': 'short English meaning, e.g. "foot", "moon"',
      'descendants[].form': 'descendant or cognate form',
      'descendants[].lang': 'language of this descendant',
      'descendants[].gloss': 'optional gloss or usage note',
    },
    intents: ['explain', 'teach', 'reference'],
    domains: ['writing', 'education'],
  }),
  createMeta('hazardcard', {
    family: 'reference',
    dataShapes: ['keyvalue', 'list', 'text'],
    requires: ['title', 'signalWord', 'pictograms', 'hazards', 'precautions'],
    optional: ['icon', 'iconColor', 'cas', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'frontier',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A GHS chemical hazard / safety-data summary — signal word, hazard pictograms, and the full H-code (hazard) and P-code (precautionary) statement lists. For "is X dangerous", "safety data for X", SDS-style chemical hazard summaries.',
    itemShapes: [
      { prop: 'hazards', text: 'text', textAliases: ['statement', 'description', 'desc'] },
      { prop: 'precautions', text: 'text', textAliases: ['statement', 'description', 'desc'] },
    ],
    propHints: {
      cas: 'CAS registry number, e.g. "67-64-1"',
      signalWord: "'Danger' (most severe) or 'Warning' (less severe) — the single GHS signal word",
      pictograms:
        'GHS pictogram keys that apply: flammable, corrosive, toxic, irritant, oxidizer, healthHazard, environment, explosive, compressedGas',
      'hazards[].code': 'the H-code, e.g. "H225"',
      'hazards[].text': 'the hazard statement, e.g. "Highly flammable liquid and vapour"',
      'precautions[].code': 'the P-code, e.g. "P210"',
      'precautions[].text':
        'the precautionary statement, e.g. "Keep away from heat/sparks/open flames"',
    },
    intents: ['explain', 'reference'],
    domains: ['science', 'health', 'education'],
  }),
  // ── reference family — mega batch (termbase, sizecompare, baseconversion,
  //    historicalperson, onthisday, countrycard, worldgrid, warconflict) ────────
  createMeta('termbase', {
    family: 'reference',
    dataShapes: ['tabular', 'comparison', 'text'],
    requires: ['title', 'terms'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A multi-language term-consistency table for translators/localizers — one row per source term, one column per target language, cells flagged preferred/deprecated/avoid. Use for localization QA, terminology glossaries, "how do we say X consistently across languages".',
    itemShapes: [
      {
        prop: 'terms',
        text: 'term',
        textAliases: ['word', 'source', 'label'],
        children: { prop: 'translations', text: 'text', textAliases: ['translation', 'value'] },
      },
    ],
    propHints: {
      'terms[].translations[].lang': 'target language name or code, e.g. "French", "de-DE"',
      'terms[].translations[].status':
        "'preferred'|'deprecated'|'avoid' — omit for a plain, unflagged entry",
    },
    domains: ['writing', 'business'],
    intents: ['reference', 'explain', 'track'],
  }),
  createMeta('sizecompare', {
    family: 'reference',
    dataShapes: ['comparison', 'scalar'],
    requires: ['title', 'subjects'],
    optional: ['icon', 'iconColor', 'unit', 'footer'],
    interactive: false,
    wowWeight: 0.76,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A silhouette-based scale comparison — recognisable body/vehicle/building shapes drawn to real proportion on a shared ground baseline, honest across mixed orientations (a whale\'s length next to a building\'s height). For "how big/long/tall is X compared to Y", size-showdown questions.',
    itemShapes: [{ prop: 'subjects', text: 'label', textAliases: ['name', 'item'] }],
    propHints: {
      unit: 'the unit every length is measured in, e.g. "m", "ft"',
      'subjects[].length': 'real-world size as a plain number, in `unit`',
      'subjects[].shape': "'whale'|'bus'|'human'|'building'|'generic' — which silhouette to draw",
    },
    intents: ['explain', 'quantify', 'reference'],
  }),
  createMeta('baseconversion', {
    family: 'reference',
    dataShapes: ['comparison', 'scalar'],
    requires: ['title', 'value', 'bases'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.62,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A number-system / radix conversion card — one value written out in several bases side by side, digits grouped in fours from the right for readability. For "convert X to binary/hex", number-systems teaching.',
    itemShapes: [{ prop: 'bases', text: 'label', textAliases: ['name', 'system', 'base'] }],
    propHints: {
      value: 'the number being converted, shown as the headline figure, e.g. "210"',
      'bases[].label':
        'the number system\'s name, e.g. "Binary", "Octal", "Decimal", "Hexadecimal"',
      'bases[].radix': 'the base as a number: 2, 8, 10, 16, …',
      'bases[].digits':
        'the value written in this base, digits only (no "0x"/"0b" prefix), e.g. "11010010" or "D2"',
    },
    domains: ['code', 'education'],
    intents: ['explain', 'reference', 'quantify'],
  }),
  createMeta('historicalperson', {
    family: 'reference',
    dataShapes: ['text', 'keyvalue', 'sequence'],
    requires: ['title', 'name'],
    optional: [
      'icon',
      'iconColor',
      'era',
      'born',
      'died',
      'knownFor',
      'facts',
      'lifeEvents',
      'legacy',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.7,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A biography profile card — monogram medallion, name + era headline, birth/death dates, a compact life-events strip, and a short legacy paragraph. For "who was X", biography lookups, history-class figure profiles.',
    itemShapes: [
      { prop: 'facts', text: 'label', textAliases: ['key', 'name', 'field'] },
      { prop: 'lifeEvents', text: 'label', textAliases: ['event', 'title', 'desc'] },
    ],
    propHints: {
      era: 'the period they\'re associated with, e.g. "Renaissance", "19th century"',
      born: 'birth date/place, e.g. "April 15, 1452 — Vinci, Republic of Florence"',
      died: 'death date/place, e.g. "May 2, 1519 — Amboise, France"',
      'lifeEvents[].year':
        'a year or short date, shown verbatim — never parsed, so "384 BCE" or "c. 1500" work',
    },
    domains: ['education', 'writing'],
    intents: ['explain', 'reference'],
  }),
  createMeta('onthisday', {
    family: 'reference',
    dataShapes: ['sequence', 'list', 'text'],
    requires: ['title', 'date', 'events'],
    optional: ['icon', 'iconColor', 'born', 'died', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'frontier',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'A "what happened on this date" fact card — dated events with a bare-year chip, plus a compact Born/Died footer strip. For "what happened on this day", "on this date in history".',
    itemShapes: [
      { prop: 'events', text: 'label', textAliases: ['description', 'text', 'headline'] },
      { prop: 'born', text: 'name', textAliases: ['label', 'person'] },
      { prop: 'died', text: 'name', textAliases: ['label', 'person'] },
    ],
    propHints: {
      date: 'the calendar date being covered, e.g. "July 3"',
      'events[].year': 'the year it happened, shown verbatim (e.g. 1969, "384 BCE")',
      'events[].category': '"War"|"Science"|"Culture"|… — a short free-text label',
    },
    domains: ['education'],
    intents: ['reference', 'explain'],
  }),
  createMeta('countrycard', {
    family: 'reference',
    dataShapes: ['keyvalue', 'text'],
    requires: ['title', 'name'],
    optional: [
      'icon',
      'iconColor',
      'flag',
      'capital',
      'population',
      'area',
      'officialLanguages',
      'currency',
      'facts',
      'footer',
    ],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A single-country deep-dive — flag banner, a capital/population/area/currency field-marks row, official languages, and a short fact list. For "tell me about X country", geography lookups.',
    itemShapes: [{ prop: 'facts', text: 'label', textAliases: ['key', 'name', 'field'] }],
    propHints: {
      flag: 'the flag emoji for the country, e.g. "🇯🇵" — rendered directly, no image needed',
      population: 'pre-formatted, e.g. "125.7 million"',
      area: 'pre-formatted, e.g. "377,975 km²"',
    },
    domains: ['travel', 'education'],
    intents: ['reference', 'explain'],
    stringItems: ['officialLanguages'],
  }),
  createMeta('worldgrid', {
    family: 'reference',
    dataShapes: ['comparison', 'keyvalue'],
    requires: ['title', 'countries'],
    optional: ['icon', 'iconColor', 'footer'],
    interactive: false,
    wowWeight: 0.6,
    tier: 'base',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A compact multi-country comparison grid — one tile per country with a flag glyph and a couple of micro capital/currency/language rows. For "compare these countries", regional overviews. Distinct from countrycard\'s single-country deep-dive.',
    itemShapes: [{ prop: 'countries', text: 'name', textAliases: ['label', 'country'] }],
    propHints: {
      'countries[].flag': 'the flag emoji, e.g. "🇧🇷" — rendered directly, no image needed',
    },
    domains: ['travel', 'education'],
    intents: ['reference', 'compare', 'explain'],
  }),
  createMeta('warconflict', {
    family: 'reference',
    dataShapes: ['comparison', 'sequence', 'text'],
    requires: ['title', 'sides'],
    optional: ['icon', 'iconColor', 'dates', 'keyBattles', 'casualties', 'outcome', 'footer'],
    interactive: false,
    wowWeight: 0.68,
    tier: 'frontier',
    colDefault: 8,
    colMin: 6,
    coercer: 'generic',
    blurb:
      'A historical conflict overview — color-coded side columns with their leaders, a compact key-battles strip, and an outcome paragraph. For "tell me about this war/conflict", history-class overviews.',
    itemShapes: [
      { prop: 'sides', text: 'name', textAliases: ['label', 'faction', 'party'] },
      { prop: 'keyBattles', text: 'label', textAliases: ['name', 'battle'] },
    ],
    propHints: {
      dates: 'the conflict\'s date span, e.g. "1861–1865"',
      'sides[].color':
        "var(--presence)|var(--danger)|var(--warning)|var(--text-muted) — tints that side's column; omit to use the default sequence",
      'keyBattles[].at': 'when/where it happened, e.g. "1863, Gettysburg, PA"',
    },
    domains: ['education'],
    intents: ['explain', 'reference'],
  }),
  createMeta('posbreakdown', {
    family: 'reference',
    dataShapes: ['text', 'sequence'],
    requires: ['title', 'tokens'],
    optional: ['icon', 'iconColor', 'sentence', 'translation', 'footer'],
    interactive: true,
    wowWeight: 0.68,
    tier: 'base',
    colDefault: 6,
    colMin: 4,
    coercer: 'generic',
    blurb:
      'A color-coded parts-of-speech sentence breakdown — the sentence flows as word chips, each ' +
      'underlined and tinted by its word class with a tiny abbreviation (n., v., adj.) beneath, ' +
      'plus a tap-to-spotlight legend of only the classes present. For grammar lessons, ESL ' +
      'teaching, and foreign-language sentence study. Never for phrase-structure syntax trees — ' +
      'use parsetree. Never for word-internal morphology — use morphemebreakdown.',
    itemShapes: [{ prop: 'tokens', text: 'word', textAliases: ['text', 'token'] }],
    propHints: {
      'tokens[].word': 'the word (or punctuation mark) exactly as it appears in the sentence',
      'tokens[].pos':
        "'noun'|'verb'|'adjective'|'adverb'|'pronoun'|'preposition'|'conjunction'|'determiner'|'interjection'|'punctuation'",
      'tokens[].note':
        'short grammatical gloss, e.g. "past tense", "subject" — footnoted below the sentence',
      sentence: 'the plain sentence, used as a fallback when tokens are missing',
      translation: "the sentence's meaning in another language, shown quietly beneath the flow",
    },
    domains: ['education', 'language'],
    intents: ['explain', 'teach', 'reference'],
  }),
  createMeta('distinctioncard', {
    family: 'reference',
    dataShapes: ['comparison', 'text'],
    requires: ['title', 'terms', 'discriminator'],
    optional: ['icon', 'iconColor', 'discriminatorLabel', 'commonMistake', 'footer'],
    interactive: false,
    wowWeight: 0.66,
    tier: 'base',
    colDefault: 7,
    colMin: 5,
    coercer: 'generic',
    blurb:
      'The answer to "what\'s the difference between X and Y", "how is X different from Y", ' +
      '"is it X or Y", or "I keep confusing X and Y — which is which": two or three ' +
      'easily-confused terms such as affect/effect, weather/climate, HTTP/HTTPS, ' +
      'apartment/condo. Each term gets a panel with its gist and a concrete in-context example, ' +
      "and beneath them, as the card's anchor, the single discriminating rule that tells them " +
      'apart, plus the mistake people actually make. Pick comparematrix instead when the answer ' +
      'is many attributes across many options, venn for set membership and counts, and ' +
      'gloss/deflist when the terms are just defined independently with nothing separating them.',
    itemShapes: [
      {
        prop: 'terms',
        text: 'term',
        textAliases: ['name', 'label', 'word'],
        requiredFields: ['gist'],
      },
    ],
    propHints: {
      discriminator:
        "the ONE test that tells them apart, in a single sentence, e.g. \"If you can swap in 'influence', it's affect; if you can swap in 'result', it's effect.\"",
      discriminatorLabel: 'label above the rule; defaults to "The test"',
      'terms[].gist': 'one line on what this term actually is',
      'terms[].example':
        'a concrete usage showing it in context, e.g. "The rain affected the crops."',
      'terms[].tag': 'a short classifier beside the term, e.g. "verb", "encrypted", "long-run"',
      'terms[].color':
        'var(--presence)|var(--insight)|var(--warning)|var(--danger) — omit to use the default sequence',
      commonMistake: 'the mix-up people actually make, in one line',
    },
    // Deliberately domain-NEUTRAL (no `domains`). "What's the difference between X and Y" is a
    // SHAPE of question, not a subject: the confusable pair can be grammar, meteorology, housing,
    // networking, biology. `domains` is a HARD filter in rank.ts (domainFitsOrNeutral) and the
    // ask's own domains are keyword-detected, which collides with the shorthand phrasing — a bare
    // "X vs Y" gets no pin from the request rule in select/shapes.ts, and the `vs` itself reads as
    // the `decision` domain ("weather vs climate" → {nature, decision}, "apartment vs condo" →
    // {home, decision}). An {education, language} tag therefore dropped the commonest way people
    // type this ask, while the blocks it competes with (gloss, deflist, quiz, flashcard) carry no
    // domains and pass untouched. Tag this only if the card ever stops being subject-agnostic.
    intents: ['explain', 'teach', 'reference'],
  }),
];

// shapes.ts — classify a question into the DATA SHAPES it's asking about.
//
// Retrieval needs a query side: the catalog tags each component with the shapes it
// serves, and this turns the user's words into a weighted vector over the same closed
// set. It's a small, word-bounded keyword ruleset in the spirit of the intent router —
// fast, deterministic, zero-dep, and identical on every model. It is intentionally
// generous (a question can be about several shapes at once) and conservative (an
// unmatched ask returns {}, so the caller falls back to the safe default rather than a
// confident wrong guess).
import type { DataShape } from '../../canvas/blocks/catalog/meta';
import type { ChatMessage } from '../providers/types';

/** A weighted guess at what the answer's data will look like (0 = absent). */
export type ShapeVector = Partial<Record<DataShape, number>>;

interface Rule {
  shape: DataShape;
  weight: number;
  test: RegExp;
}

// "Map" is also a named fictional/computing object ("the Marauder's Map said…", "hash map").
// Treat it as geography only when the surrounding words actually ask for spatial information.
// Other location words remain independently sufficient below.
const GEO_MAP_CONTEXT =
  /\b(?:on (?:a|the) map|maps? (?:of|for|showing)\b|(?:show|give|draw|make|plot|view)\b[^.?!]{0,32}\bmaps?\b|map (?:out )?(?:the |my |our |a |an )?(?:route|trip|journey|locations?|places?|cities|countries|regions?|neighbou?rhood|area|stops?))\b/;

// First-match-wins is NOT used here — every matching rule contributes, so an ask can
// score several shapes. Patterns are word-bounded to avoid accidental substring hits.
const RULES: Rule[] = [
  {
    shape: 'composition',
    weight: 1,
    test: /\b(budget|allocat\w*|split|breakdown|where\s+(?:\w+\s+)?(?:my\s+|the\s+)?(?:money|time|spend\w*|budget)|(?:money|time|spend\w*)\s+goes?|portion|share|mix|composition|makeup|made up of|percent\w*|proportion|divid\w*)\b/,
  },
  {
    shape: 'series',
    weight: 1,
    test: /\b(trend\w*|over time|growth|history|historical|month\w*|week\w*|dai\w*|quarter\w*|year\w*|forecast|projection|trajectory|since|past \d+)\b/,
  },
  {
    // A decision among options — including the implicit kind. "best/top X", "should I buy",
    // "worth it", "recommend" all ask us to weigh choices, so they want a side-by-side compare
    // table, not just a one-winner leaderboard. (They also score `ranking` below, which co-fires
    // happily: the canvas can carry both a verdict and the comparison that justifies it.)
    shape: 'comparison',
    weight: 1,
    test: /\b(vs\.?|versus|compare\w*|comparison|better|which (?:one|should|is)|either|or should|pros and cons|trade-?offs?|options?|best|top \d+|worth it|should i (?:buy|get|pick|choose|use)|recommend\w*)\b/,
  },
  {
    shape: 'ranking',
    weight: 1,
    test: /\b(rank\w*|leaderboard|top \d+|best|worst|most|least|highest|lowest|fastest|biggest|smallest|standings)\b/,
  },
  {
    shape: 'status',
    weight: 1,
    test: /\b(progress|on track|readiness|ready|status|health\w*|complete\w*|how (?:far|close)|goal|target|score|rating|grade)\b/,
  },
  {
    shape: 'sequence',
    weight: 1,
    test: /\b(steps?|how (?:do|to)|process|guide|walk\s?through|plan|schedule|roadmap|sequence|order|first.*then|itinerary|timeline)\b/,
  },
  {
    shape: 'flow',
    weight: 0.8,
    // A state machine, a feedback loop, and a decision tree are all node-and-edge flows even when
    // the ask never says "flow": without them "explain this as a state machine" registered only as
    // a generic `sequence` and scored below prose blocks that merely mention steps.
    test: /\b(funnel|pipeline|workflow|conversion|stages?|flow|drop-?off|state\s?machine|feedback\s?loops?|decision\s?tree|control\s?flow)\b/,
  },
  {
    shape: 'geo',
    weight: 1,
    test: new RegExp(
      `${GEO_MAP_CONTEXT.source}|\\b(where is|near\\w*|location|route|directions?|cities|country|countries|region|travel|trip|drive)\\b`,
    ),
  },
  {
    shape: 'list',
    weight: 0.8,
    test: /\b(list|tips?|checklist|things to|ways to|ideas|reasons|items|bullet\w*)\b/,
  },
  {
    shape: 'distribution',
    weight: 1,
    test: /\b(distribution|spread|histogram|range|variance|outliers?|percentile|frequency|how (?:often|spread))\b/,
  },
  {
    shape: 'relationship',
    weight: 1,
    test: /\b(correlat\w*|relationship between|scatter|vs.*axis|impact of|affect\w*|driver\w*)\b/,
  },
  {
    // Chemical structures route to molecularstructure (SMILES → accurate geometry), not freehand.
    shape: 'structure',
    weight: 1,
    test: /\b(molecul\w*|chemical structure|molecular structure|skeletal (?:formula|structure)|lewis structure|smiles|functional group|benzene)\b/,
  },
  {
    shape: 'tabular',
    weight: 0.9,
    test: /\b(table|rows?|columns?|spreadsheet|records|dataset|grid of|matrix)\b/,
  },
  {
    shape: 'media',
    weight: 1,
    test: /\b(image\w*|photos?|gallery|pictures?|visual\w*|video|watch|before and after|screenshot)\b/,
  },
  {
    shape: 'text',
    weight: 0.8,
    test: /\b(quote\w*|testimonial\w*|said|opinions?|reviews?|feedback|explain|defin\w*|definition|what is|tell me about|meaning of|translate\w*|vocabulary)\b/,
  },
  {
    shape: 'code',
    weight: 1.1,
    test: /\b(code|coding|programming|software|function|algorithm\w*|recursi\w*|data structures?|linked lists?|binary (?:tree|search)|hash\s?(?:map|table)|big-?o|time complexity|syntax|compil\w*|debug\w*|refactor\w*|regex|sql|snippet|pseudo\s?code|api)\b/,
  },
  {
    shape: 'scalar',
    weight: 0.7,
    test: /\b(how (?:many|much)|number of|total|count|metric|stat\w*|kpi|figure)\b/,
  },
  {
    shape: 'keyvalue',
    weight: 0.7,
    test: /\b(stats|metrics|numbers|key figures|at a glance|summary of|overview)\b/,
  },
  {
    shape: 'selection',
    weight: 0.9,
    test: /\b(choose|pick|select|decide|configure|settings|sign\s?up|form|filter|adjust|set up)\b/,
  },
  {
    shape: 'hierarchy',
    weight: 0.9,
    test: /\b(hierarch\w*|tree|nested|org\s?chart|structure of|breakdown of .* into|parent|sub-?categor\w*)\b/,
  },
];

/** Component types the user EXPLICITLY asked to SEE — a format/medium request, not just a
 *  data shape. These must be GUARANTEED in the menu (not left to the weighted-random draw):
 *  "show me the paper" has to offer a pdfreader; "show photos" a gallery. The selector pins
 *  whichever of these the connected tier can actually coerce. */
const REQUEST_RULES: { test: RegExp; types: string[] }[] = [
  {
    test: /\b(pdf|white\s?paper|the paper|the document|the report|the contract|the article|the spec|the manual|the filing|the brief|full text|read (?:it|the\b))\b/,
    types: ['pdfreader', 'docview'],
  },
  { test: /\b(images?|photos?|pictures?|gallery|pics?|snapshots?)\b/, types: ['gallery'] },
  // A location ask gets the REAL map only: geomap renders real {lat,lng} on actual map tiles. The
  // stylized `map`/`markermap` blocks are deliberately excluded from Live (FAKE_DATA_TYPES) — they
  // place pins on an invented grid, which would present made-up geography as if it were real.
  // Proximity phrasing ("near the riverwalk", "walking distance", "what's nearby") is just as much
  // a geography ask as "where is" — without this, it fell through to `imagecallouts`, whose photo
  // depends on the model knowing a real allowlisted image URL for that exact place (it almost never
  // does), leaving a bare gradient where a real map would have rendered every time.
  {
    test: new RegExp(
      `${GEO_MAP_CONTEXT.source}|\\b(where is|located|directions?|near (?:the|downtown|campus)|walking distance|walkable|nearby|neighbou?rhood|what'?s around|close to (?:downtown|the))\\b`,
    ),
    types: ['geomap'],
  },
  // (video is intentionally NOT requestable yet: we have no reliable source for a real,
  // embeddable video URL — the model hallucinates them — so videoembed isn't offered until a
  // video-search backend lands. Better no video than a fake gradient player.)
  { test: /\b(code|snippet|implementation|source code|pseudo\s?code)\b/, types: ['codeblock'] },
  // Script-style exchange with named speakers — "dialogue", "conversation between X and Y",
  // "write a scene" — explicitly routes to dialogue, not chatthread (chat bubbles).
  {
    test: /\b(dialogue\w*|a scene\b|conversation between|exchange between|speakers?|write a (?:script|scene|transcript))\b/,
    types: ['dialogue'],
  },
  // Explicit "define/definition/etymology" routes to dictionary, not list+breakdown.
  {
    test: /\b(defin\w*|etymology\b|what does .{1,30} mean|look up\b|vocabulary\b|word for\b)\b/,
    types: ['dictionary'],
  },
  // "Variants/alternatives/rewrites/versions of" routes to variants, not 3x breakdown.
  {
    test: /\b(variant\w*|alternativ\w*|\d+ (?:version\w*|option\w*|draft\w*)|rewrit\w*|different (?:tone\w*|style\w*|version\w*))\b/,
    types: ['variants'],
  },
  // The imperative RE-FRAME — "make it firmer", "say this more gently", "a shorter version",
  // "explain this for an exec" — asks for the SAME content re-said at a different setting on one
  // axis, which is exactly what the switcher renders (one variant at a time, the named setting
  // leading). It deliberately shares no token with the `variants` rule above (which needs "rewrite",
  // "alternative", "different tone/style", or "N versions"), so "a shorter version" — which matched
  // nothing at all before — pins this and only this, and "rewrite this in a different tone" still
  // belongs to variants. ELI5 / "like I'm five" is deliberately NOT here: see analogymap below.
  {
    test: /\b(?:make|say|write|phrase|word|put) (?:it|this|that|the \w{2,14}) (?:more |a bit |a little |much |way )?(?:firm|soft|warm|blunt|gentl|harsh|kind|stern|polit|casual|formal|direct|punchi|short|long|terse|friendl)\w*\b|\b(?:firmer|softer|warmer|blunter|gentler|harsher|sterner|punchier|shorter|longer|friendlier) (?:version|tone|wording|take|draft|phrasing)\b|\bexplain (?:it|this|that) (?:for|to) (?:an? )?(?:exec|executive|engineer|beginner|expert|layperson)\b|\b(?:at|in) (?:different|two|three|several) (?:levels?|tones?|registers?|reading levels?)\b|\bfor (?:different|two|three|several) audiences\b/,
    types: ['variantswitch'],
  },
  // "Translate X into Y" — explicitly routes to translation, not compare/syntaxbreakdown.
  {
    test: /\b(translat\w+|in (?:french|spanish|japanese|german|chinese|portuguese|italian|korean|arabic|russian|hindi|dutch|swedish|polish|turkish|vietnamese|thai|hebrew|greek|latin)|from (?:english|spanish|french|japanese|german|chinese) (?:to|into))\b/,
    types: ['translation'],
  },
  // "Rank the top N / leaderboard" — pins bracketbar over the lookalike lollipop.
  {
    test: /\b(rank (?:the )?top \d+|top \d+ (?:ranked|ranking)|leaderboard\b|ranked list\b|best \d+ .{1,30} rank\w*)\b/,
    types: ['bracketbar'],
  },

  // ── Generic explicit-FORMAT requests: the user named the SHAPE they want the answer in
  //    ("make me a table", "draw a diagram", "as a timeline"). Anchored on an imperative verb
  //    or "as/in a <form>" so a topical mention ("the periodic table", "comfortable") doesn't
  //    trip them. A pin only ADDS the form to the menu (it never suppresses other fits), so mild
  //    over-pinning is harmless — the goal is that an explicitly-asked form is never missed.
  {
    // "make me a table", "as a table", "in tabular form", "spreadsheet" → a real data table.
    test: /\b(?:as|in|into) (?:a |an )?(?:data )?table\b|\b(?:make|build|draw|create|show|give|put|render|format)\b(?:[\w\s]{0,12})?\btable\b|\btabular\b|\bspreadsheet\b/,
    types: ['datatable'],
  },
  {
    // "draw a diagram", "flowchart", "diagram this", "as a state machine diagram" → the node-graph
    // (opt-in generative; the pin no-ops cleanly when generative is off, so nothing breaks and no
    // fake diagram is forced).
    test: /\b(?:draw|make|show|give|create|build)\b(?:[\w\s]{0,12})?\b(?:flow\s?chart|flow\s?diagram|diagram)\b|\bdiagram (?:this|it|of|the)\b|\bflow\s?chart\b|\bas an? [\w\s]{0,20}?diagram\b|\bstate\s?machine\b/,
    types: ['diagramflow'],
  },
  {
    // "give me a timeline", "as a timeline", "timeline of …" → the timeline block.
    test: /\b(?:as|make|draw|show|give|build|on)\b(?:[\w\s]{0,12})?\btime\s?line\b|\btime\s?line of\b/,
    types: ['timeline'],
  },
  {
    // "make a checklist", "checklist for …" → a checkable list.
    test: /\bcheck\s?list\b/,
    types: ['checklist'],
  },
  {
    // "step by step", "numbered steps", "walk me through the steps" → an ordered how-to.
    test: /\bstep[-\s]?by[-\s]?step\b|\b(?:numbered|ordered) steps\b|\bwalk me through (?:the )?steps\b/,
    types: ['howtosteps', 'checklist'],
  },
  {
    // "compare X and Y", "X vs Y", "difference between", "side by side" → the comparison table.
    test: /\bcompare\b|\bcomparison\b|\b\w+ (?:vs\.?|versus) \w+\b|\bdifference between\b|\bside[-\s]?by[-\s]?side\b/,
    types: ['compare'],
  },
  {
    // Two (or three) confusable TERMS — "affect vs effect", "weather and climate" — want the swap
    // test that separates them, not a feature table. The discriminator is that both sides are BARE
    // single words: a product/plan comparison names multi-word things ("a roth ira and a traditional
    // 401k", "the iphone 15 pro and the pixel 9"), which keeps that traffic on `compare` above and on
    // the comparematrix specialist. The confusion phrasings ("I mix them up", "commonly confused
    // with", "tell them apart", "which is which", "are they the same thing", "when to use X vs Y")
    // are unambiguous and pin on their own. A bare "difference between X and Y" pins BOTH this and
    // compare — deliberate, since a pin only ADDS to the menu: the model then reaches for the card
    // when the two things are words and for the table when they're products.
    test: /\bdifferences? between (?:an? |the )?\w+ and (?:an? |the )?\w+\b|\bhow (?:is|are|does|do) (?:an? |the )?\w+ (?:and (?:an? |the )?\w+ )?differ\w*\b|\bconfus\w+ (?:with|between|for)\b|\b(?:commonly|easily|often) confused\b|\bmix\w* (?:them|these two|those two|the two) up\b|\b(?:them|these two|those two|the two) (?:mixed|confused)\b|\btell\b[^.?!]{0,30}\bapart\b|\bwhich (?:one )?is which\b|\bare\b[^.?!]{1,40}\bthe same thing\b|\bwhen (?:to|do i|should i) use\b[^.?!]{1,30}\b(?:vs\.?|versus|instead of)\b/,
    types: ['distinctioncard'],
  },
  {
    // "quiz me", "make a quiz", "test me on", "practice questions" → an interactive quiz.
    test: /\bquiz\b|\btest me on\b|\bpractice questions\b/,
    types: ['quiz'],
  },
  {
    // A graded RUN of questions — "quiz me on chapter 7", "a mock exam", "10 practice questions",
    // "20-question quiz", "exam prep". This OVERLAPS the `quiz` rule directly above on "quiz me" /
    // "test me on", which is intended: both are offered and the model takes the session when it has
    // more than one question to ask and the single card for a one-off check. A bare number of
    // questions only counts behind a request verb ("give me 10 questions") or a study qualifier
    // ("10 practice questions"), so "I have 3 questions about the lease" is never a study session,
    // and "write a test for this function" stays a code ask.
    test: /\b(?:quiz|test|grill|drill) me\b|\btest my knowledge\b|\b(?:mock|practice|sample) (?:exam|test)\b|\b\d+[-\s]question\b|\b\d+ (?:practice|review|exam|multiple[-\s]choice|short[-\s]answer) questions?\b|\b(?:ask|give|write|make|generate) me \d+ questions\b|\bexam prep\b/,
    types: ['quizsession'],
  },
  {
    // "flashcards for …" → two-sided recall cards.
    test: /\bflash\s?cards?\b/,
    types: ['flashcard'],
  },
  {
    // "stacked bar chart", "stacked columns", "100% stacked" — the user named the CHART form. Nothing
    // else in this file matches the word "stacked" (the closest, datatable, needs the literal
    // "table"), and shape scoring alone hands a composition ask to a pie/waffle/marimekko, none of
    // which show a total split by category ACROSS a series. "Stacked AREA" is deliberately excluded —
    // that one belongs to the stream/area family, not to bars.
    test: /\b(?:100\s?%\s?)?stacked\s+(?:bar|column)s?(?:\s+(?:chart|graph))?\b|\bstacked\s+(?:chart|graph)\b|\b100\s?%\s?stacked\b/,
    types: ['stackedbars'],
  },
  {
    // The user asked for PROSE they'll read or send: an essay, a cover letter, a personal statement,
    // a toast, "a few paragraphs", "write it out in full". Anchored on a write-verb or a named piece
    // so a topical mention ("the essay section of the SAT") doesn't trip it, and deliberately avoiding
    // the FIRST rule's document vocabulary ("the paper", "the article", "the document") — those name
    // a document that already EXISTS and belongs to the reader, not one to write. "N drafts" is left
    // to `variants`: several short takes to compare, not one long piece to read.
    test: /\b(?:write|draft|compose|give me|make me) (?:me )?(?:an? |the )?(?:\w+[- ]){0,2}(?:essays?|articles?|blog posts?|op-?eds?)\b|\b(?:essays?|blog posts?) (?:about|on|arguing)\b|\b(?:cover letter|personal statement|statement of purpose|college essay)\b|\bin prose\b|\blong[-\s]?form\b|\b(?:wedding|best man'?s?|maid of honou?r|retirement|graduation|farewell) (?:toast|speech)\b|\b(?:few|couple(?: of)?|several|\d+) paragraphs\b|\bwrite (?:it|this) out in full\b/,
    types: ['longread'],
  },
  {
    // Divergent idea generation — "brainstorm names", "ideas for dinner", "what should I call this",
    // "what could I do about X" — a spread across angles with nothing ranked. Plural
    // "ideas/suggestions" only, so a singular topical mention ("the idea for the movie") stays quiet;
    // and a leading count only counts behind a request verb ("give me 10 ideas"), so "rank the top 5
    // ideas by cost" remains a ranking. "N options" is deliberately left to `variants` — options are
    // alternatives to one thing, ideas are a spread of different things.
    test: /\bbrainstorm\w*\b|\b(?:ideas|suggestions) (?:for|on|about)\b|\b(?:some|any|other|more|fresh|a few) (?:ideas|suggestions|names)\b|\b(?:give|list|need|want) (?:me |us )?\d+ (?:ideas|suggestions|names)\b|\bgive me ideas\b|\bideas on how\b|\bwhat (?:should|could) (?:i|we) (?:call|name) (?:it|this|my|our|the)\b|\bname (?:ideas|suggestions)\b|\bwhat could (?:i|we) do about\b|\bpossible (?:approaches|angles|directions)\b|\bcome up with (?:some |a few |\d+ )?(?:ideas|names|concepts|angles|titles)\b/,
    types: ['ideaboard'],
  },
  {
    // Coaching phrased as what TO do and what NOT to — "dos and don'ts", "what not to say",
    // "etiquette", "common mistakes", "things to avoid". Without a pin these fall to proscons, which
    // sets the advice under PROS/CONS headers with a for/against tally and implies a decision the
    // user never posed. The "what should I do" family is admitted only with a situational anchor
    // (when/if/at/during), so a bare "what should I do with my old laptop" isn't hijacked, and no
    // existing rule uses "etiquette", "mistake", "avoid" or "not to say".
    test: /\bdo(?:'|’)?s and don(?:'|’)?ts\b|\bwhat not to (?:say|do|wear|bring|ask|write|post)\b|\bwhat (?:should|do) i (?:say|do)\b[^.?!]{0,4}\b(?:when|if|at|during)\b|\bwhat (?:should|do) i avoid\b|\b(?:screw|mess|blow|botch) (?:this|it|that) up\b|\betiquette\b|\b(?:common|rookie|beginner|classic|typical) mistakes?\b|\bthings to avoid\b/,
    types: ['dosdonts'],
  },
  {
    // "give me an analogy for X", "is there a metaphor for …", "explain Kubernetes like a restaurant
    // kitchen" — and ELI5, which is the same ask in slang. ELI5 lands HERE rather than on
    // variantswitch on purpose: it's a one-shot request to SIMPLIFY, not a request for several
    // framings to switch between, and its level half is already handled (simpleLevel.ts forces the
    // 'simple' explain level for "eli5" / "like I'm five"), so the pin only has to supply the missing
    // FORM. Matches analog(y|ies) only — never "analogous" or "analogue", so a colour-wheel or
    // signals ask is untouched — and "metaphor" only in the "metaphor FOR x" framing, so "identify
    // the metaphors in this poem" stays with the devicemark specialist. The explain-like clause is
    // held to one sentence and an INDEFINITE article ("like a …"), so "explain it like the doc says"
    // doesn't trip it.
    test: /\banalog(?:y|ies) for\b|\bmetaphors? for\b|\b(?:an?|another|any|the) (?:\w+ ){0,2}analog(?:y|ies)\b|\bby analogy\b|\beli ?5\b|\blike i(?:'|’)?m (?:five|5)\b|\bfor a (?:five|5)[-\s]?year[-\s]?old\b|\b(?:explain|describe)\b[^.?!]{0,40}\blike\s+an?\b/,
    types: ['analogymap'],
  },

  // ── Domain-specific components: concrete enough that data-shape scoring alone
  //    would never reliably surface them; explicit keyword routing guarantees the right pick.

  // Recipe — cooking queries that clearly want a structured recipe card
  {
    test: /\b(recipe\b|how to (?:make|cook|bake) |step\w*-?by\w*-?step .{0,20}(?:recipe|cook)|(?:dinner|lunch|breakfast|dessert|cookie|pasta|chicken|beef|vegan|gluten.free) recipe\b)\b/,
    types: ['recipecard'],
  },
  // Workout / training plan — wants sets, reps, sessions
  {
    test: /\b(workout plan|training plan|exercise plan|gym (?:program|plan|routine)|fitness (?:plan|program|routine)|sets? and reps?|push.?pull.?legs?|strength (?:program|plan)|build muscle (?:plan|program)|weekly (?:workout|training|gym) (?:plan|program|schedule))\b/,
    types: ['workoutplan'],
  },
  // Macros / nutrition breakdown
  {
    test: /\b(macro(?:nutrient)?s?\b|(?:calorie|nutrition(?:al)?) (?:breakdown|facts?|info|content)|grams? of (?:protein|carbs?|fat)|protein.*carb\w*.*fat|caloric breakdown)\b/,
    types: ['macrobreakdown'],
  },
  // Medication schedule — "when to take" / dosing timing. Catches natural phrasings ("when should
  // I take my meds", "what time do I take …") as well as the formal "medication schedule".
  {
    test: /\b(medication (?:schedule|reminder|timing)|dosing schedule|pill (?:schedule|reminder)|when (?:to|should i|do i) take .{0,30}(?:pill\w*|drug|medication|meds?|tablet\w*|dose\w*)|what time .{0,20}(?:take|dose) .{0,20}(?:pill\w*|medication|meds?)|drug dosage (?:schedule|timing))\b/,
    types: ['medicationschedule'],
  },
  // Guitar / instrument chord diagram
  {
    test: /\b(chord diagram|guitar chord\b|(?:how to (?:play|finger)|fingering for) .{0,20}chord|barre chord|power chord|open chord|chord shape\w*)\b/,
    types: ['chorddiagram'],
  },
  // Child / baby developmental milestones
  {
    test: /\b((?:baby|child|toddler|infant) (?:milestone\w*|developmental? milestone\w*)|developmental? milestone\w*|\d+[- ]month[- ]old milestone\w*|\d+[- ]year[- ]old milestone\w*|when (?:should|do) (?:babies|kids|toddlers|infants)\b)\b/,
    types: ['developmentmilestone'],
  },
  // Argument map — claim + evidence/objection structure
  {
    test: /\b(argument map\b|arguments? (?:for and against\b|supporting and opposing)|philosophical argument\b|claim(?:s?) (?:and|with) (?:evidence|support\w*|objection\w*)|debate the (?:claim|motion|topic)\b|case for and against\b)\b/,
    types: ['argumentmap'],
  },
  // Sports pitch / tactical formation
  {
    test: /\b((?:soccer|football|basketball|baseball|tennis) (?:formation\b|lineup\b|position\w*|play diagram|tactic\w*)|4-3-3\b|4-4-2\b|3-5-2\b|4-2-3-1\b|3-4-3\b|defensive (?:shift\b|formation\b)|starting (?:eleven\b|xi\b|lineup\b))\b/,
    types: ['sportspitch'],
  },
  // Floor plan / room layout
  {
    test: /\b(floor\s?plan\b|room layout\b|apartment layout\b|(?:house|home|office) (?:layout\b|floor plan)|room arrangement\b|furniture layout\b)\b/,
    types: ['floorplan'],
  },
  // Clinical health event timeline
  {
    test: /\b(medical (?:history|timeline|chronolog\w*)|clinical (?:history|course|timeline)|patient (?:history|chronolog\w*)|diagnosis timeline\b|treatment (?:history|timeline)|symptom (?:progression|history|chronolog\w*))\b/,
    types: ['clinicaltimeline'],
  },
  // Research / study summary — scientific findings
  {
    test: /\b(research (?:finding\w*|result\w*|summary|paper summary)|what (?:does|did) (?:the research|studies|the study|the science) (?:say|show|find|reveal)\b|scientific (?:consensus|evidence|finding\w*)|meta-?analysis\b|randomized (?:controlled )?trial\b|clinical (?:evidence|finding\w*|trial\w*))\b/,
    types: ['researchsummary'],
  },
  // Travel / daily / hourly itinerary — time-ordered schedule with locations and durations;
  // "agenda" beats the generic sequence draw which would otherwise pick a flashier component.
  {
    test: /\b(hourly itinerary|hour.?by.?hour|itinerary (?:for|of)\b|trip itinerary|travel itinerary|daily itinerary|day.?by.?day (?:plan|schedule|itinerary)|morning (?:to|through) (?:evening|night)|full day (?:plan|schedule|itinerary)|schedule (?:for|of) (?:my |a |the )?(?:trip|day|visit))\b/,
    types: ['agenda'],
  },
];

/** Block types the question explicitly calls for (deduped). The selector intersects this with
 *  what the tier can offer and pins the survivors, so an explicit ask always gets the right
 *  component even when the random draw wouldn't have picked it. */
export function detectRequested(userText: string): string[] {
  const text = userText.toLowerCase();
  const out: string[] = [];
  for (const r of REQUEST_RULES) if (r.test.test(text)) out.push(...r.types);
  return [...new Set(out)];
}

/** Human label for an explicitly-requested form, used to tell the model which shape to LEAD
 *  with. Falls back to "a <type>" for any requestable type without a friendlier name. */
const REQUESTED_FORM_LABEL: Record<string, string> = {
  datatable: 'a data table',
  diagramflow: 'a flow diagram',
  timeline: 'a timeline',
  codeblock: 'a code block',
  geomap: 'a map',
  gallery: 'an image gallery',
  pdfreader: 'the document',
  docview: 'the document',
  checklist: 'a checklist',
  howtosteps: 'a step-by-step',
  compare: 'a side-by-side comparison',
  quiz: 'a quiz',
  flashcard: 'flashcards',
  dictionary: 'a definition',
  recipecard: 'a recipe',
  dialogue: 'a scripted dialogue',
  variants: 'variations',
  translation: 'a translation',
  bracketbar: 'a ranking',
  stackedbars: 'a stacked bar chart',
  distinctioncard: 'a distinction between the terms',
  longread: 'a long-form written piece',
  ideaboard: 'a board of ideas',
  dosdonts: "a do's-and-don'ts list",
  variantswitch: 'the same content at several settings',
  quizsession: 'a graded quiz run',
  analogymap: 'an analogy',
};

export function requestedFormLabel(type: string): string {
  return REQUESTED_FORM_LABEL[type] ?? `a ${type}`;
}

/** The per-turn FORMAT REQUEST directive for the system prompt: when the user explicitly named
 *  the form(s) they want, tell the model to LEAD with that exact shape. `types` should already be
 *  intersected with what the tier can actually produce (so we never ask for a form it can't make).
 *  Shared by generateLive and the eval harness so the eval measures the SAME prompt. '' when none. */
export function formRequestDirective(types: readonly string[]): string {
  if (!types.length) return '';
  const labels = [...new Set(types.map(requestedFormLabel))].join(', ');
  return `FORMAT REQUEST — the user explicitly asked for their answer in a specific FORM: ${labels}. Make that the LEAD block (position 0 or 1), built fully and completely; the rest of the canvas supports it. Never answer in a different shape than the one they named.`;
}

/** The most recent user turn carries the topic of a terse follow-up ("now the trend"),
 *  so we fold it in at a lower weight than the current question. */
function priorUserText(history?: ChatMessage[]): string {
  if (!history) return '';
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}

/**
 * Classify `userText` (plus a faint echo of the last question) into a weighted shape
 * vector. Returns {} when nothing matches — the signal for the caller to use the safe
 * default set rather than over-fitting a vague ask.
 */
export function detectShapes(userText: string, history?: ChatMessage[]): ShapeVector {
  const text = userText.toLowerCase();
  const prior = priorUserText(history).toLowerCase();
  const vector: ShapeVector = {};
  for (const rule of RULES) {
    let weight = 0;
    if (rule.test.test(text)) weight += rule.weight;
    if (prior && rule.test.test(prior)) weight += rule.weight * 0.4;
    if (weight > 0) vector[rule.shape] = (vector[rule.shape] ?? 0) + weight;
  }
  return vector;
}

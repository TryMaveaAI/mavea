// specialists.ts — pin the SPECIALIST over the generic when the content clearly calls for it.
//
// Many data shapes carry both a generic block (timeline, diagram, scatter, compare, matrix) and
// one or more purpose-built specialists (chronologicaltimeline, statemachine, plot, riskmatrix,
// confusionmatrix). Because they SHARE a data shape, shape scoring alone can't separate them, so
// the weighted draw — and then the model — tend to default to the familiar generic. That is the
// audited "wrong specialist" failure: a generic diagram for a state machine, a numeric matrix for
// a qualitative risk grid, a scatter for a function plot.
//
// These rules read the CONTENT signal for a specialist and pin it: guaranteed into the menu and
// named in a short prompt nudge — without claiming the user asked for a particular FORM (that's
// REQUEST_RULES in shapes.ts). A pin only ADDS the specialist; it never suppresses the generic, so
// a mild over-trigger is harmless. Word-bounded and conservative in the same spirit as the rest of
// the brain: fast, deterministic, zero-dep, identical on every model, never throws.

/** One disambiguation rule: when `test` matches, prefer `type` over the generic `over`. */
interface SpecialistRule {
  test: RegExp;
  /** The specialist block to pin. */
  type: string;
  /** The generic it should be preferred over — surfaced in the prompt nudge so the model
   *  understands the choice, not just the instruction. */
  over: string;
}

const RULES: SpecialistRule[] = [
  // A finite-state description wants the real state machine (states + labelled transitions), not a
  // freeform node graph.
  {
    test: /\b(state machine|finite[- ]state|\bfsm\b|state diagram|state transitions?|states? and transitions?)\b/,
    type: 'statemachine',
    over: 'diagram',
  },
  // An ordered interaction between participants (who calls whom, in what order) is a sequence
  // diagram, not a generic diagram.
  {
    test: /\b(sequence diagram|interaction diagram|message sequence|request[- ]response (?:flow|cycle)|handshake (?:between|sequence)|who calls whom)\b/,
    type: 'sequencediagram',
    over: 'diagram',
  },
  // Entities + relationships / a database schema wants the ER diagram, not a generic diagram.
  {
    test: /\b(er[- ]?diagram|entity[- ]relationship|database schema|data model\b|tables? and (?:their )?(?:keys|relationships?))\b/,
    type: 'erdiagram',
    over: 'diagram',
  },
  // Qualitative probability×impact is the risk matrix (categorical cells), not the numeric heat
  // matrix (matrixgrid).
  {
    test: /\b(risk matrix|probability[- ](?:and[- ]|x[- ]|by[- ])?impact|likelihood[- ](?:and[- ]|x[- ]|vs[- ])?impact|impact[- ](?:and[- ])?likelihood|risk (?:heat ?map|grid))\b/,
    type: 'riskmatrix',
    over: 'matrixgrid',
  },
  // A classifier's predicted-vs-actual grid is the confusion matrix specifically.
  {
    test: /\b(confusion matrix|true positives?|false positives?|precision and recall grid)\b/,
    type: 'confusionmatrix',
    over: 'matrix',
  },
  // Two-axis positioning ("magic quadrant", 2×2, priority/Eisenhower) wants the quadrant, not a
  // side-by-side compare.
  {
    test: /\b(magic quadrant|2\s?[x×]\s?2(?: matrix| grid)?|four[- ]quadrant|positioning (?:map|matrix)|priority matrix|eisenhower (?:matrix|box))\b/,
    type: 'quadrant',
    over: 'compare',
  },
  // Graphing a FUNCTION (y = f(x), a curve) wants the math plot, not a correlation scatter.
  {
    test: /\b(?:plot|graph|sketch) (?:the )?(?:function|equation|curve|y\s*=|f\(x\))|\bgraph of (?:y|f|the function)\b|\b(?:sine|cosine|tangent) (?:curve|wave|graph)\b|\bparabola\b/,
    type: 'plot',
    over: 'scatter',
  },
  // The elements wants the periodic table, not a generic data table.
  { test: /\bperiodic table\b/, type: 'periodictable', over: 'datatable' },
  // A DATED historical chronology (years / eras / wars) wants the richer chronological timeline.
  // Requires a real date/era cue so "timeline of the onboarding steps" stays on the base timeline.
  {
    test: /\b(?:timeline|chronology|history) of\b.{0,48}\b(?:\d{3,4}s?|\d{1,2}(?:th|st|nd|rd) century|\bbce?\b|\bad\b|war|empire|dynasty|revolution|civili[sz]ation)\b/,
    type: 'chronologicaltimeline',
    over: 'timeline',
  },
  // A qualitative side-by-side of several subjects across attributes wants the comparison grid
  // (text / verdict / rating cells), not the base compare card or numeric bars.
  {
    test: /\bcompare and contrast\b|\bcomparison (?:table|grid|matrix|chart)\b|\b(?:differences?|distinctions?) between\b|\bhow do\b.{0,40}\bdiffer\b|\b[\w-]+ vs\.? [\w-]+ vs\.? [\w-]+\b/,
    type: 'comparematrix',
    over: 'compare',
  },
  // BFS/DFS step-through on a graph wants graphtrace (interactive states), not the generic node-
  // link diagram or datastructure block.
  {
    test: /\b(?:bfs|dfs|breadth[- ]first|depth[- ]first)\b.{0,60}\b(?:graph|node|vertex|vertices)\b|\btrace\b.{0,40}\b(?:bfs|dfs|breadth[- ]first|depth[- ]first)\b|\b(?:bfs|dfs) (?:step|traversal|from)\b/,
    type: 'graphtrace',
    over: 'datastructure',
  },
  // DP memoization table (2-D grid filling in) wants dptable, not algorithmtrace (1-D array).
  {
    test: /\b(?:dp|dynamic[- ]programming|memoiz[ae]tion|memoization)\s+table\b|\b(?:fill|filling)[- ](?:in )?(?:the )?(?:dp|dynamic[- ]programming)\b|\b(?:lcs|edit[- ]distance|knapsack|coin[- ]change)\b.{0,60}\btable\b/,
    type: 'dptable',
    over: 'algorithmtrace',
  },
  // Hash table with collision resolution (chaining, probing) wants hashtable, not datastructure.
  {
    test: /\bhash\s+(?:table|map)\b.{0,60}\b(?:collision|chaining|bucket|separate[- ]chaining|linear[- ]probing)\b|\bseparate[- ]chaining\b|\bhash function\b.{0,50}\bbucket\b/,
    type: 'hashtable',
    over: 'datastructure',
  },
  // Prefix tree / trie wants the trie block, not the generic tree diagram.
  {
    test: /\b(?:prefix[- ]tree|trie\b|autocompletion? (?:using|with|via) (?:a )?trie|insert.{0,30}\btrie\b|search.{0,30}\btrie\b)/,
    type: 'trie',
    over: 'datastructure',
  },
  // Binary tree with traversal steps (inorder, preorder, BST ops) wants binarytree, not
  // the generic data structure block.
  {
    test: /\b(?:inorder|preorder|postorder|level[- ]order)\s+traversal\b|\btrace\b.{0,40}\b(?:binary[- ]tree|bst)\b|\bwalk[- ]?(?:me[- ])?through\b.{0,50}\b(?:binary[- ]tree|bst)\b|\bbst\s+(?:insert|search|delete)\b/,
    type: 'binarytree',
    over: 'datastructure',
  },
  // Animated sorting visualizer (bars + steps) wants sortingviz, not algorithmtrace (generic
  // cell array).
  {
    test: /\b(?:bubble|merge|quick|insertion|selection|heap)\s+sort\b|\bsort(?:ing)?\s+algorithm\b.{0,50}\b(?:step|animate|visual|trace)\b|\bvisuali[sz]e\b.{0,40}\bsort\b|\banimated?\b.{0,30}\bsort\b/,
    type: 'sortingviz',
    over: 'algorithmtrace',
  },
  // Toulmin argument model wants toulmin over argumentmap (support/objection collapses the structure).
  {
    test: /\b(?:toulmin\b|grounds?\s+and\s+warrant|warrant\s+and\s+(?:grounds?|backing)|claim[\s,]+grounds?[\s,]+warrant)\b/i,
    type: 'toulmin',
    over: 'argumentmap',
  },
  // Character/relationship web wants castmap (typed edges) over generic network/diagram.
  {
    test: /\b(?:character\s+(?:map|web|network|relationships?)|relationship\s+(?:map|web|diagram)\b.{0,50}\bcharacter|who(?:'s| is)\s+(?:who|friends?|rivals?)|cast\s+of\s+characters?|factions?\s+and\s+alliances?|allies?\s+and\s+rivals?)\b/i,
    type: 'castmap',
    over: 'network',
  },
  // Named narrative framework (Freytag, 3-act, Hero's Journey, STC) wants storyarc over beatsheet.
  {
    test: /\b(?:freytag|three[- ]act\s+structure|hero(?:'s)?\s+journey|save\s+the\s+cat|plot\s+structure\b|story\s+arc\b|narrative\s+arc\b|story\s+structure\b)\b/i,
    type: 'storyarc',
    over: 'beatsheet',
  },
  // Rhetorical/literary device annotation wants devicemark over plain annotated doc.
  {
    test: /\b(?:rhetorical\s+devices?|literary\s+devices?|figures?\s+of\s+speech|identify\s+the\s+(?:devices?|techniques?|metaphors?)|highlight\s+the\s+(?:metaphors?|similes?|alliteration)|mark\s+the\s+(?:devices?|techniques?))\b/i,
    type: 'devicemark',
    over: 'annotateddoc',
  },
  // Word etymology tree wants etymtree over dictionary (flat etymology string).
  {
    test: /\b(?:etymology\b|word\s+origin\b|roots?\s+of\s+the\s+word|where\s+does\s+(?:the\s+word\s+)?[a-z]+\s+come\s+from|latin\s+(?:and\s+greek\s+)?roots?\s+of|word\s+history)\b/i,
    type: 'etymtree',
    over: 'dictionary',
  },
];

/** Specialists the content calls for — each paired with the generic it should beat. Deduped by
 *  specialist type. The selector pins whichever survive the tier/coercion/domain filter. */
export function detectSpecialists(userText: string): { type: string; over: string }[] {
  const text = userText.toLowerCase();
  const out: { type: string; over: string }[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    if (r.test.test(text) && !seen.has(r.type)) {
      seen.add(r.type);
      out.push({ type: r.type, over: r.over });
    }
  }
  return out;
}

/** The per-turn nudge for the system prompt: name the specialist(s) the content calls for and the
 *  generic each should beat, so the model reaches for the purpose-built block. `pairs` should be
 *  pre-filtered to specialists the tier can actually produce. '' when none. */
export function specialistDirective(pairs: readonly { type: string; over: string }[]): string {
  if (!pairs.length) return '';
  const phrases = pairs.map((p) => `${p.type} (not ${p.over})`);
  return `BEST-FIT COMPONENT — the content maps to a purpose-built block: prefer ${phrases.join(
    ', ',
  )}. The specialist renders this exact structure correctly where the generic only approximates it.`;
}

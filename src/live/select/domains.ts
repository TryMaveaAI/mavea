// domains.ts — the credibility / sanity gate for component selection.
//
// "Makes no sense" picks — an image before/after slider, or a sports pitch, chosen for a
// linear-algebra or medical question — are a SELECTION failure, not a component bug. This module
// infers the broad real-world domain(s) of a question so rank.ts can drop any candidate whose own
// `domains` facet is clearly disjoint from it, BEFORE the model is ever offered it. It is the
// blast-radius limit on how wrong a pick can be: a medical ask may vary across {symptom, lab panel,
// body map, dosing} but can never reach {sports pitch, P&L waterfall}.
//
// Two deliberate fail-safes keep the gate from ever starving the canvas:
//   • domain-NEUTRAL blocks (no `domains` — insight, list, chart, table, callout, compare, timeline…)
//     ALWAYS pass, so a fitting general block is never removed;
//   • an UNCLASSIFIABLE question (nothing matched) fails OPEN — we gate only when we are confident of
//     the question's domain, so a vague ask keeps its full, varied menu.
// The base floor is merged in separately, so the gate can never empty the canvas.

export type BlockDomain =
  | 'math'
  | 'science'
  | 'health'
  | 'fitness'
  | 'money'
  | 'business'
  | 'sports'
  | 'cooking'
  | 'travel'
  | 'tech'
  | 'code'
  | 'music'
  | 'art'
  | 'photo'
  | 'design'
  | 'home'
  | 'legal'
  | 'education'
  | 'data'
  | 'nature'
  | 'history'
  | 'language'
  | 'productivity'
  | 'media'
  | 'relationship'
  | 'news'
  | 'parenting'
  | 'writing'
  | 'decision'
  | 'shopping'
  | 'reference'
  | 'lifestyle';

// Word-bounded keyword rules. A question can match several domains (e.g. "meal plan macros" →
// cooking + health); a tagged block need only overlap ONE to survive. Keywords are kept specific:
// a miss merely fails open (no gating), whereas a false-positive could gate a legitimate block, so
// precision is favored over recall.
const DOMAIN_RULES: ReadonlyArray<{ d: BlockDomain; re: RegExp }> = [
  {
    d: 'math',
    re: /\b(eigen\w*|matrix|matrices|vector|scalar|linear algebra|calculus|derivative|integral|theorem|polynomial|trigonometr\w*|algebra|geometry|equation|probabilit\w*|statistic\w*|logarithm|factorial)\b/i,
  },
  {
    d: 'science',
    re: /\b(physic\w*|chemistr\w*|chemical|molecul\w*|atoms?|reaction|biolog\w*|dna|genes?|enzyme|quantum|thermodynamic\w*|electron|photosynthesis|periodic table|velocity|acceleration|momentum|voltage|circuit)\b/i,
  },
  {
    d: 'health',
    re: /\b(symptom\w*|disease|diagnos\w*|medicine|medication|doctor|clinical|injur\w*|surgery|treatment|dosage|prescription|anatomy|therap\w*|illness|fever|rash|nausea|migraine)\b/i,
  },
  {
    d: 'fitness',
    re: /\b(workout|exercise|gym|reps?|sets?|lift(ing|s)?|cardio|run(ning)?|marathon|muscles?|strength|hypertrophy|stretch\w*|weight loss)\b/i,
  },
  {
    d: 'money',
    re: /\b(budget\w*|salary|income|invest\w*|savings?|debt|loans?|mortgage|tax(es)?|expenses?|spending|paycheck|retirement|portfolio|afford|finances?)\b/i,
  },
  {
    d: 'business',
    re: /\b(revenue|profit|margins?|\bkpi\b|churn|pipeline|startup|funnel|\broi\b|b2b|saas|stakeholders?|quarterly|forecast|go-to-market)\b/i,
  },
  {
    d: 'sports',
    re: /\b(soccer|football|basketball|baseball|tennis|hockey|golf|\bnba\b|\bnfl\b|\bmlb\b|playoffs?|tournament|standings|quarterback|inning|free throw|offside)\b/i,
  },
  {
    d: 'cooking',
    re: /\b(recipe\w*|cook\w*|bak(e|ing)|ingredient\w*|meals?|dinner|lunch|breakfast|dish(es)?|cuisine|saute|simmer|roast|grill|kitchen)\b/i,
  },
  {
    d: 'travel',
    re: /\b(trips?|travel\w*|flights?|itinerar\w*|hotels?|vacation|destinations?|tourist|visa|sightsee\w*|layover|airport)\b/i,
  },
  {
    d: 'tech',
    re: /\b(wi-?fi|router|laptop|smartphone|software|devices?|install\w*|settings|browser|bluetooth|operating system|hard drive)\b/i,
  },
  {
    d: 'code',
    re: /\b(code|functions?|api|algorithm\w*|debug\w*|compile\w*|syntax|typescript|javascript|python|repository|regex|database|query)\b/i,
  },
  {
    d: 'music',
    re: /\b(chord\w*|melody|guitar|piano|instruments?|key signature|tempo|octave|musical scale|fret\w*|sheet music)\b/i,
  },
  {
    d: 'art',
    re: /\b(painting|drawing|sketch\w*|sculpture|artists?|palette|illustration|portrait)\b/i,
  },
  {
    d: 'home',
    re: /\b(apartment|rent(al|ing)?|lease|renovat\w*|furniture|plumb\w*|repair|toilet|sink|drain|garden\w*|appliances?|tenant|landlord)\b/i,
  },
  {
    d: 'legal',
    re: /\b(legal|laws?|contracts?|clause|lawsuit|attorney|lawyer|liabilit\w*|statute|compliance|terms of service)\b/i,
  },
  {
    d: 'education',
    re: /\b(stud(y|ying)|exams?|quiz\w*|homework|college|lecture|curriculum|flashcards?|syllabus|coursework)\b/i,
  },
  {
    d: 'nature',
    re: /\b(animals?|plants?|trees?|weather|climate|ocean|mountains?|rivers?|ecosystem|species|dinosaur\w*|planets?|wildlife|geolog\w*)\b/i,
  },
  {
    d: 'history',
    re: /\b(histor\w*|ancient|centur\w*|\bwar\b|empires?|civilization|dynast\w*|revolution|medieval)\b/i,
  },
  {
    d: 'language',
    re: /\b(translat\w*|pronounc\w*|pronunciation|grammar|vocabular\w*|conjugat\w*|spanish|french|japanese|mandarin|verb tense)\b/i,
  },
  // Domains below were declared on BlockDomain but had no detection rule, so any block tagged with
  // one of them could never be domain-matched (it would be gated OUT of a question that matched a
  // DIFFERENT domain). Adding a rule is permission-only — an extra question domain can never gate a
  // block, only let a fitting one survive — so these widen reach without risking a false gate.
  {
    d: 'data',
    re: /\b(datasets?|data ?(science|scientist|analy\w*|pipeline|engineering|warehouse|lake|model(ing|ling)?)|\betl\b|\bsql\b|bigquery|tableau|power ?bi|spreadsheets?|\bcsv\b|pivot tables?|dataframe\w*|pandas)\b/i,
  },
  {
    d: 'design',
    re: /\b(design system|\bux\b|\bui\b|user (experience|interface)|wireframe\w*|figma|prototyp\w*|mockups?|usability|visual hierarchy|component library|brand(ing| guidelines?)|typograph\w*|type ?scale)\b/i,
  },
  {
    d: 'photo',
    re: /\b(photograph\w*|photos?|camera|aperture|shutter speed|\biso\b|exposure|\blens(es)?\b|\bf-?stops?\b|depth of field|lightroom|bokeh)\b/i,
  },
  {
    d: 'media',
    re: /\b(videos?|films?|movies?|footage|podcasts?|youtube|streaming|cinematograph\w*|shot ?lists?|storyboard\w*|b-?roll|screenplay\w*)\b/i,
  },
  {
    d: 'productivity',
    re: /\b(productivit\w*|to-?do\w*|task ?lists?|workflows?|habits?|routines?|time ?management|\bgtd\b|pomodoro|prioriti[sz]\w*|backlog|getting things done)\b/i,
  },
  {
    d: 'relationship',
    re: /\b(relationships?|partner\w*|spouse|husband|wife|boyfriend|girlfriend|marriage|married|dating|breakups?|broke up|divorce\w*|friendships?|in-?laws?|coworkers?|my (boss|friend|mom|dad|family))\b/i,
  },
  {
    d: 'news',
    re: /\b(news|headlines?|current events|breaking|press release|journalis\w*|newspapers?|world events|latest (on|news)|what'?s happening)\b/i,
  },
  {
    d: 'parenting',
    re: /\b(parent\w*|toddler\w*|infants?|newborns?|\bbaby\b|babies|nursery|diaper\w*|tantrum\w*|potty training|bedtime|my (kid|child|son|daughter|baby)|developmental milestones?)\b/i,
  },
  {
    d: 'writing',
    re: /\b(write|writing|rewrite|essays?|paragraphs?|\bdrafts?\b|cover letters?|poems?|poetry|short stor(y|ies)|novels?|screenplay\w*|proofread|prose|narrative|copywrit\w*)\b/i,
  },
  {
    d: 'decision',
    re: /\b(decide|decisions?|choose|choosing|which (one|option|should)|pros and cons|trade-?offs?|should i (buy|get|choose|pick|go)|\bvs\.?\b|versus|compare (these|the|my|two|options))\b/i,
  },
  {
    d: 'shopping',
    re: /\b(buy|buying|purchas\w*|shopping|gifts?|deals?|discount\w*|coupons?|product reviews?|wishlists?|add to cart)\b/i,
  },
  {
    d: 'reference',
    re: /\b(define|definition of|meaning of|look ?up|dictionary|thesaurus|encyclopedia|glossary|translat\w*|spell(ing)? of|synonyms?|antonyms?)\b/i,
  },
  // Hobbyist collecting — added so `collectiontracker` (catalog.data.ts), whose only domain tag is
  // 'lifestyle', can ever be domain-matched; without this rule it could survive the gate only by
  // fail-open (an unclassifiable question), so a genuine collecting ask that also tripped an
  // unrelated domain (e.g. "baseball card collection" → sports) would wrongly exclude it.
  {
    d: 'lifestyle',
    re: /\b(collectibles?|my collection|stamp collection|coin collection|card collection|vinyl collection|collecting (?:stamps|coins|cards|vinyl|memorabilia)|hobby collection|memorabilia)\b/i,
  },
];

function textFor(text: string, history?: ReadonlyArray<{ content?: unknown }>): string {
  const recent = (history ?? [])
    .slice(-2)
    .map((m) => (typeof m?.content === 'string' ? m.content : ''))
    .join(' ');
  return (text + ' ' + recent).toLowerCase();
}

/** The broad real-world domain(s) a question is about. Empty when nothing matched (→ fail open). */
export function detectDomains(
  text: string,
  history?: ReadonlyArray<{ content?: unknown }>,
): Set<BlockDomain> {
  const hay = textFor(text || '', history);
  const found = new Set<BlockDomain>();
  for (const { d, re } of DOMAIN_RULES) if (re.test(hay)) found.add(d);
  return found;
}

/**
 * Whether a candidate block may be offered for a question of the given domains.
 *  • neutral block (no domains) → always yes
 *  • question domain unknown → yes (fail open; never starve a vague ask)
 *  • otherwise → yes only if the block shares at least one domain with the question
 */
export function domainFitsOrNeutral(
  blockDomains: readonly string[] | undefined,
  questionDomains: ReadonlySet<string>,
): boolean {
  if (!blockDomains || blockDomains.length === 0) return true;
  if (questionDomains.size === 0) return true;
  for (const d of blockDomains) if (questionDomains.has(d)) return true;
  return false;
}

// Gate fallback tags for domain-SPECIFIC blocks that don't yet carry `domains` in their catalog
// meta. A block's own `meta.domains` always wins; this table keeps the high-risk specialised visuals
// (absurd cross-domain — a periodic table for a budget, a sports pitch for shoulder pain) honest
// without editing every catalog entry. Domain-NEUTRAL blocks are deliberately absent (they fit
// anywhere). Expand as new specialised blocks land.
const BLOCK_DOMAINS: Record<string, BlockDomain[]> = {
  circuitdiagram: ['science', 'tech'],
  molecularstructure: ['science', 'health'],
  periodictable: ['science'],
  reactionmechanism: ['science'],
  bodymap: ['health', 'fitness'],
  labpanel: ['health'],
  medicationschedule: ['health'],
  musicstaff: ['music'],
  chorddiagram: ['music'],
  sportspitch: ['sports'],
};

/** The domains governing a block for the gate: its own meta tags win, else the fallback table. */
export function blockDomainsOf(meta: {
  type: string;
  domains?: readonly string[];
}): readonly string[] | undefined {
  return meta.domains ?? BLOCK_DOMAINS[meta.type];
}

// Acute-crisis signals — self-harm, suicide, abuse-in-immediate-danger. When present the selector
// LEADS with `lifeline` and suppresses the reflective surfaces (a gentle reframe is the wrong, even
// harmful, response to "I don't want to be here"). Deliberately high-precision: a miss just falls
// back to normal selection, so over-matching is the only real risk — and is avoided.
const CRISIS_RE =
  /\b(kill (myself|him|her|them)|killing myself|end (my|his|her|their) life|ending my life|take my (own )?life|don'?t want to (be here|live|wake up|exist)|want(ing)? to die|wanna die|suicid\w*|self.?harm|harm myself|hurt(ing)? myself|cut(ting)? myself|no reason to (live|go on)|better off dead|overdos\w*)\b/i;

/** Whether a turn shows acute-crisis signals (self-harm / suicide / immediate danger). */
export function isCrisis(text: string, history?: ReadonlyArray<{ content?: unknown }>): boolean {
  return CRISIS_RE.test(textFor(text || '', history));
}

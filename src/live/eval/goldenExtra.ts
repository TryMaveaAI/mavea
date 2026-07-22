// goldenExtra.ts — extra eval cases for the domains the base golden set under-covers.
//
// golden.ts is deliberately money/health/business heavy (that's where the
// composition-vs-trend block-selection test is sharpest). But the weakest real answers
// show up elsewhere — science, math, history, geography, how-to, plain explainers — so
// this set stretches coverage there. It is ADDITIVE: it imports the GoldenCase contract
// from golden.ts and extends it with an optional `reference`, the ground-truth the LLM
// judge checks `accuracy` against. Used by tests/live-eval-judge.test.ts alongside GOLDEN.
//
// The domain field reuses golden.ts's fixed union (no 'science'/'history' member), so
// explainer-style asks map to 'learn' and procedures to 'howto'. References are kept to
// durable, non-perishable facts (theorems, dates, capitals, constants) so the set never
// goes stale.
import type { GoldenCase } from './golden';
import type { JudgeLessonContext } from './judge';

/** A golden case plus an optional ground-truth reference for the judge's accuracy score.
 *  Omit `reference` for an opinion / recommendation with no single right answer — the
 *  judge then grades plausibility instead of matching facts. `lesson` is for a COURSE-LESSON
 *  case specifically: it rides straight through to judgeAnswer so progression (this lesson's
 *  objectives, whether a recap was expected) gets judged alongside single-answer quality. No
 *  case in this file sets it yet — course-lesson golden cases are future work — but the plumbing
 *  is here so adding one is a data change, not a code change. */
export interface JudgeCase extends GoldenCase {
  reference?: string;
  lesson?: JudgeLessonContext;
}

export const GOLDEN_EXTRA: JudgeCase[] = [
  /* ---- science / explainers: a process or finding, never a time series ---- */
  {
    id: 'photosynthesis',
    ask: 'Explain how photosynthesis works.',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'breakdown', 'timeline'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 14,
    reference:
      'Plants convert light energy, water (H2O), and carbon dioxide (CO2) into glucose (C6H12O6) and oxygen (O2). Light-dependent reactions occur in the thylakoid membranes; the Calvin cycle (light-independent) fixes carbon in the stroma. Chlorophyll absorbs mostly red and blue light. Net: 6 CO2 + 6 H2O + light → C6H12O6 + 6 O2.',
  },
  {
    id: 'how-rainbow-forms',
    ask: 'Why do rainbows form?',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'timeline'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'Sunlight enters a raindrop, refracts, reflects off the back, and refracts again on exit. Dispersion separates the colors because each wavelength bends by a slightly different amount. The primary rainbow appears at about 42 degrees from the antisolar point; red is on the outer edge, violet on the inner.',
  },
  {
    id: 'how-vaccines-work',
    ask: 'How do vaccines work?',
    domain: 'health',
    expectBlock: ['insight', 'list', 'timeline'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'A vaccine exposes the immune system to a harmless piece or weakened/inactivated form of a pathogen (or mRNA coding for an antigen). B cells make antibodies and memory B and T cells form, so a later real infection is recognized and cleared faster. Some vaccines need boosters; high coverage gives herd immunity.',
  },

  /* ---- math: a known fact, so a `strong` confidence is honest (estimateOnly false) ---- */
  {
    id: 'pythagorean-theorem',
    ask: 'Explain the Pythagorean theorem.',
    domain: 'learn',
    expectBlock: ['insight', 'list'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 10,
    reference:
      'For a right triangle with legs a and b and hypotenuse c, a^2 + b^2 = c^2. Example: 3-4-5 (9 + 16 = 25). Used to find a side length or test for a right angle.',
  },
  {
    id: 'what-is-prime',
    ask: 'What is a prime number?',
    domain: 'learn',
    expectBlock: ['insight', 'list'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 10,
    reference:
      'A natural number greater than 1 with no positive divisors other than 1 and itself. First primes: 2, 3, 5, 7, 11, 13. 2 is the only even prime. 1 is not prime. There are infinitely many (Euclid).',
  },

  /* ---- history: ordered events → timeline, never a chart ---- */
  {
    id: 'ww1-causes',
    ask: 'What caused World War I?',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'timeline', 'breakdown'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'Long-term causes (often summarized as MAIN): militarism, alliances, imperialism, nationalism. The spark was the assassination of Archduke Franz Ferdinand in Sarajevo on 28 June 1914 by Gavrilo Princip; the alliance system (Triple Entente vs Central Powers) pulled the powers into war by August 1914.',
  },
  {
    id: 'moon-landings-timeline',
    ask: 'Give me a timeline of the Apollo moon landings.',
    domain: 'learn',
    expectBlock: ['timeline'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 10,
    reference:
      'Apollo 11 (July 1969) was the first crewed Moon landing — Armstrong and Aldrin. Six landings succeeded: Apollo 11, 12, 14, 15, 16, 17. Apollo 13 (1970) aborted after an oxygen-tank explosion. Apollo 17 (December 1972) was the last; twelve people have walked on the Moon.',
  },
  {
    id: 'fall-of-rome',
    ask: 'Why did the Roman Empire fall?',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'timeline', 'breakdown'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'The Western Roman Empire fell in 476 CE when Odoacer deposed Romulus Augustulus. Contributing factors: economic strain and overtaxation, military overreach, reliance on mercenaries, political instability, the split into Western and Eastern empires, and pressure/invasions from Germanic peoples (Goths, Vandals). The Eastern (Byzantine) Empire continued until 1453.',
  },

  /* ---- geography: overview (kpi/breakdown) and ranking (bars/breakdown), not a trend ---- */
  {
    id: 'japan-overview',
    ask: 'Tell me about Japan.',
    domain: 'learn',
    expectBlock: ['insight', 'kpi', 'breakdown', 'list'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 14,
    reference:
      'Japan is an island nation in East Asia; capital Tokyo; population roughly 124 million; currency the yen; language Japanese. Four main islands: Honshu, Hokkaido, Kyushu, Shikoku. Highest point Mount Fuji (3,776 m). Major economy known for automobiles and electronics.',
  },
  {
    id: 'largest-countries',
    ask: 'What are the largest countries by area?',
    domain: 'learn',
    expectBlock: ['breakdown', 'bars', 'kpi'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 10,
    reference:
      'By land/total area: 1) Russia (~17.1M km²), 2) Canada (~9.98M), 3) United States (~9.83M), 4) China (~9.6M), 5) Brazil (~8.5M), 6) Australia (~7.7M).',
  },
  {
    id: 'planets-distance',
    ask: 'How far are the planets from the Sun?',
    domain: 'learn',
    expectBlock: ['breakdown', 'bars', 'kpi'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 12,
    reference:
      'Average distance in AU (1 AU ≈ 150M km): Mercury 0.39, Venus 0.72, Earth 1.0, Mars 1.52, Jupiter 5.2, Saturn 9.5, Uranus 19.2, Neptune 30.1.',
  },

  /* ---- how-to / recipes: every ingredient + ordered steps → list / timeline ---- */
  {
    id: 'pancakes-recipe',
    ask: 'How do I make pancakes from scratch?',
    domain: 'howto',
    expectBlock: ['list', 'timeline', 'breakdown'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 12,
    reference:
      'Basic batter: ~1 cup flour, 1 tbsp sugar, 2 tsp baking powder, 1/2 tsp salt, 1 cup milk, 1 egg, 2 tbsp melted butter. Mix dry, whisk in wet, do not overmix (lumps are fine). Cook on a medium griddle; flip when bubbles form and edges set (~2 min/side).',
  },
  {
    id: 'tie-a-tie',
    ask: 'How do I tie a tie?',
    domain: 'howto',
    expectBlock: ['list', 'timeline'],
    estimateOnly: false,
    minBlocks: 2,
    maxBlocks: 10,
    reference:
      'Four-in-hand: drape with the wide end on your right, longer; cross wide over narrow; wrap behind, then across the front; bring up through the neck loop; feed down through the front knot; tighten and slide up to the collar.',
  },

  /* ---- non-finance comparisons: still the `compare` shape, no real-data ground truth ---- */
  {
    id: 'cats-vs-dogs',
    ask: 'Cats vs dogs — which is a better pet for me?',
    domain: 'decision',
    expectBlock: ['compare'],
    estimateOnly: true,
    minBlocks: 2,
    maxBlocks: 8,
  },
  {
    id: 'iphone-vs-android',
    ask: 'iPhone or Android — which should I get?',
    domain: 'decision',
    expectBlock: ['compare'],
    estimateOnly: true,
    minBlocks: 2,
    maxBlocks: 8,
  },

  /* ---- process explainers: a key finding first, then the parts ---- */
  {
    id: 'how-stock-market-works',
    ask: 'How does the stock market work?',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'breakdown', 'timeline'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'Companies sell shares (ownership) to raise money, first via an IPO (primary market), then traded between investors on exchanges (secondary market). Prices move with supply and demand driven by earnings, news, and sentiment. Indices like the S&P 500 track baskets of stocks; brokers and market makers facilitate trades.',
  },
  {
    id: 'water-cycle',
    ask: 'Explain the water cycle.',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'timeline'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 3,
    maxBlocks: 12,
    reference:
      'Evaporation (and transpiration from plants) lifts water vapor; condensation forms clouds; precipitation falls as rain/snow; collection/runoff returns water to rivers, lakes, oceans, and groundwater, then it repeats. Driven by solar energy and gravity.',
  },

  /* ---- explicit FORM requests: the answer must LEAD with the named shape (tests intentFit
   *      and that the per-turn FORMAT REQUEST pin is honored), never a different visualization. */
  {
    id: 'fmt-table-elements',
    ask: 'Make me a table of the first 10 elements with their symbol and atomic number.',
    domain: 'learn',
    expectBlock: ['datatable'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 1,
    maxBlocks: 6,
    reference: 'H (1), He (2), Li (3), Be (4), B (5), C (6), N (7), O (8), F (9), Ne (10).',
  },
  {
    id: 'fmt-code-fizzbuzz',
    ask: 'Show me the code for FizzBuzz in Python.',
    domain: 'learn',
    expectBlock: ['codeblock'],
    forbidBlock: ['chart', 'breakdown'],
    estimateOnly: false,
    minBlocks: 1,
    maxBlocks: 6,
    reference:
      'Loop the numbers 1..n: print "FizzBuzz" when divisible by 15, "Fizz" when divisible by 3, "Buzz" when divisible by 5, otherwise the number itself.',
  },
  {
    id: 'fmt-timeline-ww2',
    ask: 'Give me a timeline of the major events of World War II.',
    domain: 'learn',
    expectBlock: ['timeline'],
    forbidBlock: ['chart', 'donut'],
    estimateOnly: false,
    minBlocks: 1,
    maxBlocks: 12,
    reference:
      '1939 Germany invades Poland; 1941 Operation Barbarossa and Pearl Harbor; 1942 Midway/Stalingrad turning points; 1944 D-Day (June 6); 1945 VE Day (May 8) and VJ Day (Aug, after Hiroshima/Nagasaki).',
  },
  {
    id: 'fmt-checklist-launch',
    ask: 'Give me a checklist for launching a website.',
    domain: 'howto',
    expectBlock: ['checklist', 'howtosteps', 'list'],
    forbidBlock: ['chart'],
    estimateOnly: true,
    minBlocks: 1,
    maxBlocks: 8,
  },
  {
    id: 'fmt-quiz-fractions',
    ask: 'Quiz me on adding fractions.',
    domain: 'learn',
    expectBlock: ['quiz'],
    estimateOnly: true,
    minBlocks: 1,
    maxBlocks: 6,
  },
  {
    id: 'fmt-budget-as-table',
    ask: 'My monthly take-home is $4,000 — show me a budget for it as a table.',
    domain: 'money',
    expectBlock: ['datatable'],
    forbidBlock: ['chart'],
    estimateOnly: true,
    minBlocks: 1,
    maxBlocks: 6,
  },

  /* ---- explicit BREVITY: the user asked for a SHORT answer, so the canvas must stay tight
   *      (a handful of blocks at most) instead of expanding into a full dashboard. */
  {
    id: 'brief-photosynthesis',
    ask: 'In one line, what is photosynthesis?',
    domain: 'learn',
    expectBlock: ['insight', 'list'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    minBlocks: 1,
    maxBlocks: 3,
    reference: 'Plants convert light energy, water, and carbon dioxide into glucose and oxygen.',
  },
  {
    id: 'brief-tldr-inflation',
    ask: 'tl;dr — what causes inflation?',
    domain: 'business',
    expectBlock: ['insight', 'list', 'breakdown'],
    estimateOnly: false,
    minBlocks: 1,
    maxBlocks: 3,
    reference:
      'Too much money chasing too few goods: demand-pull (excess demand), cost-push (rising input/wage costs), and growth in the money supply; expectations can entrench it.',
  },

  /* ---- explicit DEPTH-up: a deep dive should go wide AND deep, many complementary blocks. */
  {
    id: 'deep-dive-blackholes',
    ask: 'Give me a deep dive on how black holes form.',
    domain: 'learn',
    expectBlock: ['insight', 'list', 'timeline', 'breakdown'],
    forbidBlock: ['chart'],
    estimateOnly: false,
    // A deep dive must be clearly more than a brief (>3 blocks), but completeness — not a fixed
    // floor — drives the count: a thorough answer in 5 well-filled blocks must not be forced to pad
    // to 6. The judge's `intentFit` carries whether the DEPTH was genuinely honored.
    minBlocks: 4,
    maxBlocks: 14,
    reference:
      'A massive star (>~20 solar masses) exhausts its fuel; fusion can no longer counter gravity, so the core collapses past electron- and neutron-degeneracy pressure into a singularity bounded by an event horizon at the Schwarzschild radius. Stellar-mass black holes form in core-collapse supernovae; supermassive ones sit at galactic centers.',
  },
];

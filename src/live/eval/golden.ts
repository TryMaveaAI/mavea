// golden.ts — the ground-truth eval set for Live mode accuracy.
//
// Each case is a real user ask plus the INVARIANTS a correct visual answer must
// satisfy. We deliberately do NOT pin an exact JSON answer (there are many good
// ones); we assert the things that distinguish a correct answer from a wrong one:
//   - which block type(s) fit the data shape (and which would be WRONG),
//   - that estimates are labeled honestly (no real data source → at least one
//     `inferred`/`partial` confidence; never an unsourced `strong`),
//   - that the answer has a sane number of varied blocks.
//
// This file is pure data (no I/O), imported by both the scorer's unit tests and
// the live runner. Add cases freely — coverage is the point.

/** A single graded eval case. */
export interface GoldenCase {
  id: string;
  /** The user's spoken/typed question. */
  ask: string;
  /** Loose domain label, for grouping the scorecard. */
  domain: 'money' | 'health' | 'travel' | 'decision' | 'howto' | 'business' | 'learn';
  /**
   * Acceptable PRIMARY block types — the answer passes block-selection if it
   * contains at least one of these. (A budget can be `breakdown` or `donut`.)
   */
  expectBlock: string[];
  /**
   * Block types that would be WRONG for this data shape. The classic Mavéa error
   * is `chart` (a time series) used for a category split. Presence of any of
   * these fails block-selection even if an expected type is also present.
   */
  forbidBlock?: string[];
  /**
   * True when there is NO real data source, so any numbers are illustrative.
   * The answer must then label its estimate honestly (see scorer.honest):
   * at least one insight with conf in {inferred, partial}, and NO unsourced
   * conf:'strong'. Almost every Live turn today is estimate-only → default true.
   */
  estimateOnly?: boolean;
  /** Min/max blocks expected (defaults 2..5, matching the system prompt). */
  minBlocks?: number;
  maxBlocks?: number;
}

export const GOLDEN: GoldenCase[] = [
  /* ---- money: composition vs trend is the sharpest block-selection test ---- */
  {
    id: 'budget-5k',
    ask: 'How should I budget a $5,000 monthly income?',
    domain: 'money',
    expectBlock: ['breakdown', 'donut'], // parts of a whole
    forbidBlock: ['chart'], // NOT a time series
    estimateOnly: true,
  },
  {
    id: 'spending-trend',
    ask: 'Has my spending gone up over the last six months?',
    domain: 'money',
    expectBlock: ['chart'], // value over time
    estimateOnly: true,
  },
  {
    id: 'where-money-goes',
    ask: 'Where does my money actually go each month?',
    domain: 'money',
    expectBlock: ['breakdown', 'donut'],
    forbidBlock: ['chart'],
    estimateOnly: true,
  },
  {
    id: 'savings-goal',
    ask: "I want to save $8,000 this year and I'm at $6,200 — how am I doing?",
    domain: 'money',
    expectBlock: ['ring', 'gauge'], // progress toward a goal
    estimateOnly: true,
  },
  {
    id: 'pay-off-card-or-save',
    ask: 'Should I pay off my credit card or put the money in savings?',
    domain: 'decision',
    expectBlock: ['compare'], // weighing two options
    estimateOnly: true,
  },

  /* ---- decisions: compare is the expected shape ---- */
  {
    id: 'train-vs-fly',
    ask: 'Should I take the train or fly to Boston?',
    domain: 'travel',
    expectBlock: ['compare'],
    estimateOnly: true,
  },
  {
    id: 'two-apartments',
    ask: 'Help me choose between two apartments: one closer to work, one cheaper.',
    domain: 'decision',
    expectBlock: ['compare'],
    estimateOnly: true,
  },
  {
    id: 'job-offers',
    ask: 'I have two job offers — one pays more, one has better hours. Which?',
    domain: 'decision',
    expectBlock: ['compare'],
    estimateOnly: true,
  },

  /* ---- travel / planning: ordered steps → timeline ---- */
  {
    id: 'tokyo-itinerary',
    ask: 'Plan me three days in Tokyo.',
    domain: 'travel',
    expectBlock: ['timeline', 'list'], // a day-by-day list is as valid as a timeline
    estimateOnly: true,
  },
  {
    id: 'move-checklist',
    ask: 'What do I need to do to move apartments next month?',
    domain: 'howto',
    expectBlock: ['timeline', 'list', 'checklist'],
    estimateOnly: true,
  },

  /* ---- how-to / tips: a set of items → list ---- */
  {
    id: 'sleep-better',
    ask: 'How can I sleep better?',
    domain: 'health',
    expectBlock: ['list'],
    estimateOnly: true,
  },
  {
    id: 'pack-for-cold',
    ask: 'What should I pack for a cold-weather trip?',
    domain: 'howto',
    expectBlock: ['list'],
    estimateOnly: true,
  },

  /* ---- health: a metric over time vs a single finding ---- */
  {
    id: 'weight-trend',
    ask: 'I weighed myself weekly for two months — is the trend down?',
    domain: 'health',
    expectBlock: ['chart'],
    estimateOnly: true,
  },
  {
    id: 'why-tired',
    ask: 'Why am I so tired in the afternoons?',
    domain: 'health',
    expectBlock: ['insight', 'list'],
    estimateOnly: true,
  },

  /* ---- business: headline numbers → kpi; pipeline/funnel shapes ---- */
  {
    id: 'quarter-snapshot',
    ask: 'Give me a snapshot of this quarter: revenue, churn, and new customers.',
    domain: 'business',
    expectBlock: ['kpi'], // 2–4 headline numbers
    estimateOnly: true,
  },
  {
    id: 'revenue-by-quarter',
    ask: 'How has revenue changed across the last four quarters?',
    domain: 'business',
    expectBlock: ['chart'], // over time
    estimateOnly: true,
  },
  {
    id: 'revenue-by-segment',
    ask: 'How is our revenue split across enterprise, mid-market, and SMB?',
    domain: 'business',
    expectBlock: ['breakdown', 'donut'], // composition, NOT a trend
    forbidBlock: ['chart'],
    estimateOnly: true,
  },
  {
    id: 'runway',
    ask: 'How much runway do we have left?',
    domain: 'business',
    expectBlock: ['insight', 'kpi', 'ring', 'gauge'],
    estimateOnly: true,
  },

  /* ---- learn / explain: key finding first ---- */
  {
    id: 'explain-compound-interest',
    ask: 'Explain compound interest simply.',
    domain: 'learn',
    expectBlock: ['insight', 'list'],
    estimateOnly: true,
  },
  {
    id: 'explain-50-30-20',
    ask: 'What is the 50/30/20 budgeting rule?',
    domain: 'learn',
    expectBlock: ['breakdown', 'insight', 'list'],
    estimateOnly: true,
  },

  /* ---- teaching arc: a learning ask should land the shaped HOOK → MECHANISM → WORKED
   *  EXAMPLE → VARIANTS/COSTS/PITFALLS → CHECK lesson (see generateLive's teachingArcDirective),
   *  not just a longer list — so these expect the teaching-kit specialists the selector pins
   *  (see rank.ts's TEACHING_KIT) and the higher block floor screen.ts sets for a teaching ask
   *  (TEACH_MIN_BLOCKS). Objectively-factual technical topics, not personal estimates. */
  {
    id: 'teach-linear-algebra',
    ask: 'Teach me linear algebra.',
    domain: 'learn',
    expectBlock: ['teachdiagram', 'workedexample', 'quiz'],
    estimateOnly: false,
    minBlocks: 11,
    maxBlocks: 22,
  },
  {
    id: 'teach-transformer',
    ask: 'Teach me how a transformer works.',
    domain: 'learn',
    expectBlock: ['teachdiagram', 'workedexample', 'quiz'],
    estimateOnly: false,
    minBlocks: 11,
    maxBlocks: 22,
  },
  {
    id: 'crash-course-tcp',
    ask: 'Give me a crash course on TCP.',
    domain: 'learn',
    expectBlock: ['teachdiagram', 'workedexample', 'quiz'],
    estimateOnly: false,
    minBlocks: 11,
    maxBlocks: 22,
  },

  /* ---- ambiguous / short asks: should still produce something valid ---- */
  {
    id: 'how-am-i-doing-money',
    ask: 'How am I doing with money this month?',
    domain: 'money',
    expectBlock: ['insight', 'kpi', 'breakdown', 'chart'], // many shapes valid
    estimateOnly: true,
  },
  {
    id: 'plan-my-week',
    ask: 'Help me plan my week.',
    domain: 'howto',
    expectBlock: ['timeline', 'list', 'checklist'],
    estimateOnly: true,
  },
  {
    id: 'should-i-buy-house',
    ask: 'Should I buy a house now or keep renting?',
    domain: 'decision',
    expectBlock: ['compare', 'insight'],
    estimateOnly: true,
  },
  {
    id: 'fitness-progress',
    ask: "I've run 18 of my 30 planned miles this month — how am I tracking?",
    domain: 'health',
    expectBlock: ['ring', 'gauge'],
    estimateOnly: true,
  },
  {
    id: 'meal-tonight',
    ask: 'What should I cook tonight with chicken and rice?',
    domain: 'howto',
    expectBlock: ['timeline', 'list'],
    estimateOnly: true,
  },
];

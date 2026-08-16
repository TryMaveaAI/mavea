// world/scenarios/societyEconomy.ts — the economics / business / society batch of the world
// scenario corpus. Twenty-one WorldSpecs from the domains a conversation about money, work and
// cities actually produces: an inflation episode, a startup's churn, a port closure, a bank run,
// a pension projection, an ad market falling over. They exist for the same reason the base corpus
// does — a layout, a chart adapter or a coercion path that only holds up on one world is not
// finished — so the batch deliberately spreads across SHAPES (chain, diamond, wide fan, multiple
// sinks, an orphan, the node cap), DATA REGIMES (fully grounded, structure-only, series on every
// node, none at all, daily vs annual cadence, negative and twelve-orders-of-magnitude values) and
// TIERS (T1 uploads with page anchors, T2 receipts, T3 inside an explicitly illustrative world).
//
// The two honesty rules of the corpus hold here without exception:
//
//   1. Every spec survives its OWN coercion, so a receipt's quote is written FROM its value by
//      `reading()`. `valueInQuote` keeps a figure only when the value's own digits appear as a
//      number token in the quote, and a hand-written sentence drifts from its number the first
//      time either is edited.
//   2. A tier says what actually backs a number. T1 is read out of a document the user uploaded,
//      T2 carries a receipt, T3 exists ONLY inside a world flagged illustrative, and T0 is the
//      no-number tier everything ungrounded degrades to. Nothing here is dressed as measured that
//      is not: where a figure would have to be invented to make a scenario tidy — a projection, a
//      textbook magnitude, an event nobody metered — the world is flagged illustrative or the node
//      is left qualitative. The domains and the mechanisms are real and explainable; the arithmetic
//      is nobody's data.
//
// The builders below are re-declared rather than imported because the base corpus keeps its own
// private: a batch file is authored and reviewed on its own, and a shared builder that drifts would
// silently re-tier every fixture in every batch at once.
import type { Receipt } from '../../ground/types';
import type { EdgeRelation } from '../../trust/relations';
import type { CausalRole } from '../../why/types';
// The corpus MODULE (world/scenarios.ts), not this directory — a file resolves before a directory
// index, and the import is type-only, so aggregating this batch back into it cannot make a cycle.
import type { WorldScenario } from '../scenarios';
import type { WorldEdge, WorldNode, WorldSeries, WorldSpec } from '../types';
import { deriveEdgeStatus } from '../validate';

/** Where every quote in this batch is cited from. Named as what it is — a fixture — so nothing
 *  here can be mistaken for a real source if a scenario ever reaches a screen. */
const HOST = 'scenario corpus';

/* ------------------------------------------------------------------ *
 * Builders — the corpus's, kept small and literal on purpose.
 * ------------------------------------------------------------------ */

/** A sentence that GROUNDS `value` — built from the number so the two can never drift apart. */
function reading(subject: string, value: number, unit?: string, when?: string): string {
  const at = when === undefined ? '' : ` in ${when}`;
  const measure =
    unit === undefined ? String(value) : unit === '%' ? `${value}%` : `${value} ${unit}`;
  return `${subject}${at} measured ${measure}.`;
}

/** The optional world-only enrichment a node may carry, whatever tier it is. `date` is what puts a
 *  node on the time axis when it has no history of its own — a qualitative cause is undatable by a
 *  series, and a world where nothing is dated hands the reader a timeline of held-aside cards. */
type Extras = Pick<Partial<WorldNode>, 'unit' | 'detail' | 'date' | 'series' | 'children'>;

/** A node's own date: an instant, or a period when `until` is given. Written out rather than
 *  computed so a fixture stays readable. */
const on = (t: string, until?: string): Pick<WorldNode, 'date'> => ({
  date: { t, ...(until === undefined ? {} : { until }) },
});

/** A qualitative (T0) node: a named cause with a place in the web and no number on it. */
function bare(
  id: string,
  label: string,
  role: CausalRole,
  depth: number,
  extras: Extras = {},
): WorldNode {
  return { id, label, role, depth, tier: 'T0', ...extras };
}

/** A T2 node: a figure with a public receipt. */
function measured(
  id: string,
  label: string,
  role: CausalRole,
  depth: number,
  value: number,
  unit: string,
  subject: string,
  extras: Extras = {},
): WorldNode {
  return {
    id,
    label,
    role,
    depth,
    tier: 'T2',
    value,
    unit,
    receipt: { quote: reading(subject, value, unit), host: HOST },
    ...extras,
  };
}

/** A T2 node with a receipt but NO figure of its own — a container whose magnitude lives in its
 *  children. The quote states exactly that, so the node is grounded without claiming a total. */
function container(
  id: string,
  label: string,
  role: CausalRole,
  depth: number,
  quote: string,
  extras: Extras = {},
): WorldNode {
  return { id, label, role, depth, tier: 'T2', receipt: { quote, host: HOST }, ...extras };
}

/** A T1 node: read out of the user's own document, so the receipt carries its page anchor. */
function uploaded(
  id: string,
  label: string,
  role: CausalRole,
  depth: number,
  value: number,
  unit: string,
  subject: string,
  page: number,
  extras: Extras = {},
): WorldNode {
  return {
    id,
    label,
    role,
    depth,
    tier: 'T1',
    value,
    unit,
    receipt: { quote: reading(subject, value, unit), host: HOST, doc: 0, page },
    ...extras,
  };
}

/** A T3 node: a textbook figure, which exists only inside an explicitly illustrative world. */
function sketched(
  id: string,
  label: string,
  role: CausalRole,
  depth: number,
  value: number,
  unit: string,
  extras: Extras = {},
): WorldNode {
  return { id, label, role, depth, tier: 'T3', value, unit, ...extras };
}

/** A measured (T2) series: every point earns its own receipt, because the coercer verifies each
 *  point independently and silently drops one it cannot verify. */
function measuredSeries(
  subject: string,
  unit: string,
  points: ReadonlyArray<readonly [string, number]>,
): WorldSeries {
  return {
    tier: 'T2',
    unit,
    receipt: {
      quote: `${subject}, ${points[0][0]} through ${points[points.length - 1][0]}.`,
      host: HOST,
    },
    points: points.map(([t, value]) => ({
      t,
      value,
      receipt: { quote: reading(subject, value, unit, t), host: HOST },
    })),
  };
}

/** An illustrative (T3) series: the world's own banner is the caveat, so no point wears a receipt. */
function sketchedSeries(
  unit: string,
  points: ReadonlyArray<readonly [string, number]>,
): WorldSeries {
  return { tier: 'T3', unit, points: points.map(([t, value]) => ({ t, value })) };
}

/** A qualitative link: asserted, unweighted, unreceipted — drawn faint, never as an established
 *  fact, and it alone is enough to close off the exact what-if ladder for the whole world. */
function link(
  from: string,
  to: string,
  verb: string,
  relation: EdgeRelation,
  sign: 1 | -1 = 1,
): WorldEdge {
  const e = { from, to, verb, relation, sign, tier: 'T0' as const, provisional: true };
  return { ...e, status: deriveEdgeStatus(e) };
}

/** A measured link: weighted, receipted, T2. Only a world where EVERY link is one of these (and
 *  whose outcome carries a grounded figure) may answer a what-if with an exact delta. */
function weighed(
  from: string,
  to: string,
  verb: string,
  relation: EdgeRelation,
  weight: number,
  quote: string,
  sign: 1 | -1 = 1,
  counterQuote?: string,
): WorldEdge {
  const receipt: Receipt = { quote, host: HOST };
  const e = {
    from,
    to,
    verb,
    relation,
    sign,
    tier: 'T2' as const,
    weight,
    receipt,
    receipts: [receipt],
    ...(counterQuote !== undefined ? { counter: { quote: counterQuote, host: HOST } } : {}),
  };
  return { ...e, status: deriveEdgeStatus(e) };
}

/* ------------------------------------------------------------------ *
 * Small webs
 * ------------------------------------------------------------------ */

/** Three nodes, two links, two DIFFERENT edge statuses: one receipted and weighted ('supported')
 *  next to one bare assertion ('provisional'). The smallest world in which the edge treatment has
 *  to distinguish evidence from assertion — and the outcome carries no figure at all, because
 *  "closed" is an event, not a measurement. */
const BAKERY_CLOSURE: WorldSpec = {
  title: 'Why did the corner bakery close?',
  outcomeId: 'closed',
  provenance: {
    notes: ['One link is receipted, the other is asserted — and the outcome has no number.'],
  },
  nodes: [
    measured(
      'rent-review',
      'Rent after the five-year review',
      'root',
      0,
      62,
      '%',
      'The rent rise',
      {
        ...on('2025-04'),
        detail: 'The review reset the rent to market in one step, rather than in stages.',
      },
    ),
    bare('stop-moved', 'The bus stop moved two streets away', 'root', 0, on('2024-11')),
    bare('closed', 'The bakery closed', 'outcome', 1, on('2025-09')),
  ],
  edges: [
    weighed(
      'rent-review',
      'closed',
      'squeezed',
      'causes',
      0.5,
      'Margin turned negative the month the new rent started.',
    ),
    link('stop-moved', 'closed', 'starved', 'contributes'),
  ],
};

/** Every node figure carries a receipt whose quote holds its digits, and every link is T2, weighted
 *  and receipted — so `isFullyGrounded` opens the exact what-if ladder. A second world in this
 *  regime matters: the invariant "only a grounded world answers exactly" must be a property of the
 *  gate, not of the one fixture that happened to satisfy it. Tiers are mixed inside the regime —
 *  one figure comes off the user's own board deck (T1), the rest are cited (T2). */
const STARTUP_CHURN: WorldSpec = {
  title: 'Why did monthly churn double?',
  outcomeId: 'churn',
  provenance: { notes: ['Every figure and every link is receipted — the exact ladder is open.'] },
  nodes: [
    uploaded(
      'paid-trials',
      'Share of trials from paid social',
      'root',
      0,
      61,
      '%',
      'Trials from paid social',
      2,
      on('2025-07', '2025-12'),
    ),
    measured(
      'seat-price',
      'Per-seat price after the repack',
      'root',
      0,
      24,
      'USD',
      'The seat price',
      on('2025-08'),
    ),
    measured(
      'activation',
      'Teams reaching a first shared board',
      'mechanism',
      1,
      28,
      '%',
      'Activation',
      on('2025-08', '2026-01'),
    ),
    measured(
      'first-reply',
      'Median first-reply time',
      'mechanism',
      1,
      3.2,
      'days',
      'First reply',
      on('2025-09', '2026-01'),
    ),
    measured('churn', 'Monthly logo churn', 'outcome', 2, 7.4, '%', 'Monthly churn', on('2026-01')),
  ],
  edges: [
    weighed(
      'paid-trials',
      'activation',
      'diluted',
      'dampens',
      0.4,
      'Trials from paid social activated least often.',
      -1,
    ),
    weighed(
      'activation',
      'churn',
      'held down',
      'dampens',
      0.45,
      'Teams that reached a shared board renewed.',
      -1,
    ),
    weighed(
      'seat-price',
      'first-reply',
      'lengthened',
      'contributes',
      0.2,
      'Repricing questions filled the queue.',
    ),
    weighed(
      'seat-price',
      'churn',
      'pushed out',
      'causes',
      0.3,
      'Cancellations clustered on repacked plans.',
    ),
    weighed('first-reply', 'churn', 'eroded', 'causes', 0.25, 'Slow first replies preceded churn.'),
  ],
};

/** A world with FOUR sinks and only one of them named as the outcome. Everything downstream of the
 *  shift is a real terminal effect the answer holds, so a layout that assumes "deepest column = the
 *  outcome" (or that every leaf is an outcome) mis-reads three of the four. */
const REMOTE_WORK: WorldSpec = {
  title: 'What did the shift to remote work do to the city centre?',
  outcomeId: 'footfall',
  provenance: { notes: ['Several terminal effects; only one of them is the question’s outcome.'] },
  nodes: [
    measured(
      'attendance',
      'Weekday office attendance against 2019',
      'root',
      0,
      54,
      '%',
      'Weekday attendance',
      {
        series: measuredSeries('Weekday attendance', '%', [
          ['2021', 28],
          ['2022', 41],
          ['2023', 49],
          ['2024', 54],
        ]),
      },
    ),
    bare('lease-renewals', 'Firms took less space at renewal', 'mechanism', 1),
    measured('footfall', 'Weekday footfall in the core', 'outcome', 2, 71, '%', 'Weekday footfall'),
    measured('lunch-trade', 'Weekday lunch trade', 'mechanism', 2, 68, '%', 'Weekday lunch trade'),
    measured('fares', 'Peak fare revenue', 'mechanism', 2, 64, '%', 'Peak fare revenue'),
    bare('suburban-spend', 'Spending moved to suburban high streets', 'mechanism', 2),
  ],
  edges: [
    link('attendance', 'lease-renewals', 'shrank', 'causes', -1),
    weighed(
      'attendance',
      'footfall',
      'filled',
      'causes',
      0.6,
      'Footfall tracked attendance street by street.',
    ),
    link('attendance', 'lunch-trade', 'fed', 'causes'),
    link('attendance', 'fares', 'carried', 'causes'),
    // The two negatives: office attendance is what a suburban high street LOSES its custom to, and
    // a firm that has already signed for less space holds the lower footfall in place.
    link('attendance', 'suburban-spend', 'redirected', 'dampens', -1),
    link('lease-renewals', 'footfall', 'locked in', 'dampens', -1),
  ],
};

/* ------------------------------------------------------------------ *
 * Chains, diamonds and fans
 * ------------------------------------------------------------------ */

/** Nine depths, one node each, plus ONE long-range edge that jumps from the root to depth 6. The
 *  ribbon case with a wire across it: a band-breaking layout has to route an edge that spans most
 *  of the composition without drawing it through the cards in between. */
const INFLATION_PASSTHROUGH: WorldSpec = {
  title: 'Why did prices keep rising after energy costs fell?',
  outcomeId: 'core-sticky',
  provenance: {
    illustrative: true,
    notes: [
      'Textbook pass-through chain — the mechanism by which a cost shock outlives itself, not any economy’s measured episode.',
    ],
  },
  nodes: [
    bare(
      'energy-shock',
      'A wholesale energy shock lands on producers',
      'root',
      0,
      on('2021-08', '2021-10'),
    ),
    sketched('input-costs', 'Input costs across manufacturing', 'mechanism', 1, 14, '%', {
      ...on('2021-09', '2022-06'),
      series: sketchedSeries('%', [
        ['2021-Q3', 4],
        ['2021-Q4', 9],
        ['2022-Q1', 14],
        ['2022-Q2', 12],
        ['2022-Q3', 7],
      ]),
    }),
    bare('repricing', 'Firms repost list prices at the next cycle', 'mechanism', 2, {
      ...on('2021-11', '2022-08'),
      detail:
        'Catalogues reprice on a schedule, so a cost shock arrives in steps, not continuously.',
    }),
    sketched(
      'goods-cpi',
      'Goods prices in the index',
      'mechanism',
      3,
      9,
      '%',
      on('2022-01', '2022-09'),
    ),
    bare(
      'expectations',
      'Households come to expect further rises',
      'mechanism',
      4,
      on('2022-03', '2022-12'),
    ),
    bare('wage-claims', 'Wage claims are opened early', 'mechanism', 5, on('2022-06', '2023-03')),
    bare(
      'services-costs',
      'Service businesses pass labour costs on',
      'mechanism',
      6,
      on('2022-09', '2023-06'),
    ),
    sketched('services-cpi', 'Services inflation', 'mechanism', 7, 6.2, '%', {
      ...on('2022-11', '2023-09'),
      series: sketchedSeries('%', [
        ['2021-Q3', 2.1],
        ['2022-Q1', 3.4],
        ['2022-Q3', 5.5],
        ['2023-Q1', 6.2],
      ]),
    }),
    sketched(
      'core-sticky',
      'Core inflation stays above target',
      'outcome',
      8,
      4.1,
      '%',
      on('2023-10'),
    ),
  ],
  edges: [
    link('energy-shock', 'input-costs', 'raises', 'causes'),
    link('input-costs', 'repricing', 'triggers', 'causes'),
    link('repricing', 'goods-cpi', 'lifts', 'causes'),
    link('goods-cpi', 'expectations', 'shifts', 'contributes'),
    link('expectations', 'wage-claims', 'brings forward', 'causes'),
    link('wage-claims', 'services-costs', 'raises', 'causes'),
    link('services-costs', 'services-cpi', 'passes to', 'causes'),
    link('services-cpi', 'core-sticky', 'holds up', 'causes'),
    // The bypass: energy is also a direct service input, so it reaches depth 6 without the wage leg.
    link('energy-shock', 'services-costs', 'raises', 'contributes'),
  ],
};

/** One cause reaching the outcome by two routes that rejoin on a container node, over a T0/T1/T2
 *  mix — and the rejoining node's magnitude lives entirely in its children, so the diamond's apex
 *  has a receipt but no figure. */
const PORT_CLOSURE: WorldSpec = {
  title: 'Why did the line stop for eleven days?',
  outcomeId: 'line-stopped',
  provenance: {
    notes: ['Two routes rejoin on a container node whose magnitude is only its parts.'],
  },
  nodes: [
    bare(
      'typhoon',
      'A typhoon closed the transshipment port',
      'root',
      0,
      on('2026-07-14', '2026-07-17'),
    ),
    bare('single-source', 'The connector had one qualified supplier', 'root', 0, {
      detail: 'Second-sourcing was approved two years earlier and never funded.',
    }),
    measured(
      'vessel-dwell',
      'Vessel dwell time',
      'mechanism',
      1,
      9.4,
      'days',
      'Vessel dwell time',
      on('2026-07-17', '2026-07-26'),
    ),
    uploaded(
      'air-freight',
      'Air-freight substitution',
      'mechanism',
      1,
      412000,
      'USD',
      'Air-freight substitution',
      6,
      on('2026-07-22', '2026-08-05'),
    ),
    container(
      'buffer',
      'Buffer stock at the plant',
      'mechanism',
      2,
      'Buffer stock is counted per part, never as one line total.',
      {
        ...on('2026-07-18', '2026-07-28'),
        unit: 'days',
        children: [
          measured('buffer.connector', 'Connector', 'mechanism', 2, 2, 'days', 'Connector cover'),
          measured('buffer.harness', 'Harness', 'mechanism', 2, 16, 'days', 'Harness cover'),
          measured('buffer.housing', 'Housing', 'mechanism', 2, 31, 'days', 'Housing cover'),
        ],
      },
    ),
    measured(
      'line-stopped',
      'Line downtime',
      'outcome',
      3,
      11,
      'days',
      'Line downtime',
      on('2026-07-28', '2026-08-08'),
    ),
  ],
  edges: [
    weighed(
      'typhoon',
      'vessel-dwell',
      'held',
      'causes',
      0.8,
      'Every box on the water waited for the port to reopen.',
    ),
    link('typhoon', 'air-freight', 'forced', 'causes'),
    weighed(
      'vessel-dwell',
      'buffer',
      'drained',
      'causes',
      0.6,
      'Cover fell a day for every day late.',
      -1,
    ),
    link('air-freight', 'buffer', 'refilled', 'contributes'),
    link('single-source', 'buffer', 'thinned', 'dampens', -1),
    weighed(
      'buffer',
      'line-stopped',
      'ran out',
      'causes',
      0.7,
      'The line stopped the day cover hit zero.',
      -1,
    ),
  ],
};

/** Nine roots landing on two mechanisms landing on one outcome: wide AND layered, which the flat
 *  fan does not exercise — a column-per-depth layout has to fit nine cards against two. No node
 *  carries a series, so the chart shelves the whole world; the roots are dated instead by the
 *  window each condition actually ran over, which is what keeps a decades-long web off one pile.
 *  The one root with no window is the geography, and it stays on the shelf. */
const HOUSING_AFFORDABILITY: WorldSpec = {
  title: 'Why can’t a nurse afford a flat near the hospital?',
  outcomeId: 'unaffordable',
  provenance: {
    illustrative: true,
    notes: ['Illustrative shares — the shape of an affordability decomposition, not one city’s.'],
  },
  nodes: [
    sketched(
      'land-supply',
      'Serviced land released for housing',
      'root',
      0,
      18,
      '%',
      on('2010', '2018'),
    ),
    sketched(
      'consents',
      'Time from application to consent',
      'root',
      0,
      14,
      'months',
      on('2016', '2022'),
    ),
    sketched(
      'build-cost',
      'Construction cost per square metre',
      'root',
      0,
      31,
      '%',
      on('2020', '2024'),
    ),
    sketched('rates', 'Mortgage rates at origination', 'root', 0, 5.4, '%', on('2022', '2024')),
    sketched('short-lets', 'Homes converted to short lets', 'root', 0, 4, '%', on('2014', '2020')),
    sketched('second-homes', 'Second and empty homes', 'root', 0, 3, '%', on('2005', '2015')),
    sketched(
      'social-stock',
      'Social homes sold and not replaced',
      'root',
      0,
      22,
      '%',
      on('1982', '2012'),
    ),
    sketched(
      'pay-growth',
      'Nursing pay against local rents',
      'root',
      0,
      2.1,
      '%',
      on('2012', '2024'),
    ),
    sketched('commute', 'Sites reachable without a car', 'root', 0, 9, '%'),
    bare(
      'shortfall',
      'Homes completed each year fall short of need',
      'mechanism',
      1,
      on('2019', '2024'),
    ),
    bare('rent-burden', 'Rent absorbs more of a pay packet', 'mechanism', 1, on('2018', '2025')),
    sketched(
      'unaffordable',
      'Homes out of reach on a band-5 salary',
      'outcome',
      2,
      94,
      '%',
      on('2025'),
    ),
  ],
  // Every root here is a LEVEL, so a sign is the derivative: more of the root, more (or less) of the
  // node it points at. Only released land and nursing pay push their target down.
  edges: [
    link('land-supply', 'shortfall', 'eases', 'dampens', -1),
    link('consents', 'shortfall', 'delays', 'contributes'),
    link('build-cost', 'shortfall', 'stalls', 'contributes'),
    link('rates', 'shortfall', 'shelves', 'contributes'),
    link('social-stock', 'shortfall', 'widens', 'contributes'),
    link('short-lets', 'rent-burden', 'tightens', 'causes'),
    link('second-homes', 'rent-burden', 'tightens', 'contributes'),
    link('pay-growth', 'rent-burden', 'lags', 'dampens', -1),
    link('commute', 'rent-burden', 'concentrates', 'dampens', -1),
    link('shortfall', 'unaffordable', 'squeezes', 'causes'),
    link('rent-burden', 'unaffordable', 'prices out', 'causes'),
    // The rate rise also lands straight on the buyer, not only on the builder.
    link('rates', 'unaffordable', 'raises', 'causes'),
  ],
};

/** A reinforcing story told as an acyclic ladder — each turn of the wheel is its own deeper node,
 *  because a cycle has no topological order and the cascade would refuse the whole world. Two roots
 *  converge, split, and rejoin twice: the shape a "flywheel" argument really has. */
const MONOPOLY_FLYWHEEL: WorldSpec = {
  title: 'Why did one platform end up with the whole category?',
  outcomeId: 'one-platform',
  provenance: {
    illustrative: true,
    notes: [
      'A textbook flywheel, unrolled into an acyclic ladder — the mechanism, not a market study.',
    ],
  },
  nodes: [
    bare(
      'network-effect',
      'Each new seller made the platform worth more to buyers',
      'root',
      0,
      on('2012', '2020'),
    ),
    bare('search-logs', 'Ranking improved with every search logged', 'root', 0, on('2013', '2021')),
    sketched(
      'acq-cost',
      'Cost to acquire the next buyer',
      'mechanism',
      1,
      12,
      'USD',
      on('2014', '2021'),
    ),
    bare(
      'better-ranking',
      'Buyers found what they wanted sooner',
      'mechanism',
      1,
      on('2015', '2021'),
    ),
    bare(
      'sellers-follow',
      'Sellers listed where the buyers already were',
      'mechanism',
      2,
      on('2016', '2022'),
    ),
    sketched(
      'rival-share',
      'What a rival could still win',
      'mechanism',
      3,
      8,
      '%',
      on('2017', '2022'),
    ),
    bare('rivals-exit', 'Rivals stopped funding the category', 'mechanism', 4, on('2021')),
    sketched(
      'switching-cost',
      'A seller’s cost of leaving',
      'mechanism',
      5,
      40,
      '%',
      on('2018', '2023'),
    ),
    sketched('one-platform', 'Share of category transactions', 'outcome', 6, 84, '%', on('2023')),
  ],
  edges: [
    link('network-effect', 'acq-cost', 'lowers', 'dampens', -1),
    link('search-logs', 'better-ranking', 'sharpens', 'causes'),
    link('better-ranking', 'acq-cost', 'lowers', 'dampens', -1),
    link('acq-cost', 'sellers-follow', 'pulls', 'causes', -1),
    link('better-ranking', 'sellers-follow', 'pulls', 'contributes'),
    link('sellers-follow', 'rival-share', 'squeezes', 'dampens', -1),
    link('rival-share', 'rivals-exit', 'discourages', 'causes', -1),
    link('rivals-exit', 'switching-cost', 'raises', 'causes'),
    link('switching-cost', 'one-platform', 'locks in', 'causes'),
    link('rivals-exit', 'one-platform', 'clears', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Data regimes
 * ------------------------------------------------------------------ */

/** Structure only: a sorting mechanism has no headline number, and inventing one would be the exact
 *  dishonesty the tier system exists to prevent — so the chart shelves the entire world and says
 *  why. The tipping still HAPPENED over decades, and the nodes carry those decades as periods, so
 *  the timeline can show a world the chart cannot. Shaped as a diamond so the T0 regime is not
 *  tested on a chain alone. */
const SEGREGATION_TIPPING: WorldSpec = {
  title: 'Why did the two neighbourhoods stay separate?',
  outcomeId: 'stayed-separate',
  provenance: {
    illustrative: true,
    notes: [
      'A sorting mechanism, not a measurement — this explanation has no numbers in it at all.',
    ],
  },
  nodes: [
    bare('mild-preference', 'Each household wants a few neighbours like itself', 'root', 0),
    bare(
      'lending-history',
      'Older lending maps still shape who can buy where',
      'root',
      0,
      on('1935', '1968'),
    ),
    bare('first-movers', 'A few households move at the margin', 'mechanism', 1, on('1972', '1980')),
    bare(
      'school-signal',
      'The school’s intake shifts with the street',
      'mechanism',
      2,
      on('1978', '1990'),
    ),
    bare('agent-steering', 'Listings are shown selectively', 'mechanism', 2, on('1975', '1995')),
    bare('tipping', 'The remaining mixed blocks tip', 'mechanism', 3, on('1985', '1998')),
    bare(
      'stayed-separate',
      'The two neighbourhoods stayed separate',
      'outcome',
      4,
      on('2000', '2024'),
    ),
  ],
  edges: [
    link('mild-preference', 'first-movers', 'nudges', 'causes'),
    link('lending-history', 'agent-steering', 'shapes', 'contributes'),
    link('first-movers', 'school-signal', 'shifts', 'causes'),
    link('first-movers', 'agent-steering', 'reinforces', 'contributes'),
    link('school-signal', 'tipping', 'accelerates', 'causes'),
    link('agent-steering', 'tipping', 'accelerates', 'causes'),
    link('tipping', 'stayed-separate', 'settles into', 'causes'),
  ],
};

/** A receipted series on every node, at MONTHLY cadence and with an uneven record: one series skips
 *  the months the count was not taken, and the series lengths differ. A chart that assumes every
 *  node shares one evenly-spaced time axis draws this wrong. */
const TRANSIT_RIDERSHIP: WorldSpec = {
  title: 'Why did bus ridership keep falling after the timetable was fixed?',
  outcomeId: 'ridership',
  provenance: { notes: ['Five receipted monthly series, of different lengths and cadences.'] },
  nodes: [
    measured('reliability', 'Trips arriving on time', 'root', 0, 71, '%', 'On-time arrivals', {
      series: measuredSeries('On-time arrivals', '%', [
        ['2023-09', 62],
        ['2023-12', 65],
        ['2024-03', 68],
        ['2024-06', 70],
        ['2024-09', 71],
      ]),
    }),
    measured('fare', 'Single fare', 'root', 0, 2.9, 'USD', 'The single fare', {
      series: measuredSeries('The single fare', 'USD', [
        ['2023-01', 2.4],
        ['2024-01', 2.65],
        ['2024-07', 2.9],
      ]),
    }),
    measured(
      'journey-time',
      'Median door-to-door time',
      'mechanism',
      1,
      47,
      'min',
      'Journey time',
      {
        series: measuredSeries('Journey time', 'min', [
          ['2023-01', 41],
          ['2023-04', 42],
          // No count was taken over the summer closure — the record skips it rather than filling it.
          ['2023-10', 45],
          ['2024-01', 46],
          ['2024-04', 46],
          ['2024-07', 47],
        ]),
      },
    ),
    measured(
      'car-cost',
      'Cost of the same trip by car',
      'mechanism',
      1,
      4.1,
      'USD',
      'The car trip',
      {
        series: measuredSeries('The car trip', 'USD', [
          ['2023-01', 4.6],
          ['2023-07', 4.4],
          ['2024-01', 4.2],
          ['2024-07', 4.1],
        ]),
      },
    ),
    measured('ridership', 'Weekday boardings', 'outcome', 2, 63, '%', 'Weekday boardings', {
      series: measuredSeries('Weekday boardings', '%', [
        ['2023-01', 78],
        ['2023-07', 73],
        ['2024-01', 69],
        ['2024-07', 63],
      ]),
    }),
  ],
  edges: [
    weighed(
      'reliability',
      'journey-time',
      'shortened',
      'causes',
      0.3,
      'Door-to-door time fell on the corridors that recovered first.',
      -1,
    ),
    weighed(
      'journey-time',
      'ridership',
      'deterred',
      'causes',
      0.45,
      'Boardings fell furthest where the trip took longest.',
      -1,
    ),
    weighed(
      'fare',
      'ridership',
      'priced out',
      'dampens',
      0.2,
      'Boardings dipped each fare change.',
      -1,
    ),
    // Driving got cheaper as boardings fell. The corpus supports no claim beyond that, so the link
    // is 'correlates' — the one relation that says "these moved together" without asserting a cause.
    link('car-cost', 'ridership', 'tracked', 'correlates'),
  ],
};

/** Figures read out of ONE uploaded document, each with its own page anchor — the T1 regime, which
 *  the base corpus only ever samples one node at a time. One qualitative link keeps the world out
 *  of the exact regime, which is the honest reading: the report measures the parts, it does not
 *  establish the arithmetic between them. */
const READING_SCORES: WorldSpec = {
  title: 'Why did reading scores drop across the district?',
  outcomeId: 'at-grade',
  provenance: { notes: ['Every figure is a page in the uploaded district report.'] },
  nodes: [
    uploaded(
      'absence',
      'Chronic absence',
      'root',
      0,
      29,
      '%',
      'Chronic absence',
      4,
      on('2024-09', '2025-06'),
    ),
    uploaded(
      'turnover',
      'Teacher turnover',
      'root',
      0,
      23,
      '%',
      'Teacher turnover',
      9,
      on('2024-06', '2024-09'),
    ),
    bare(
      'substitutes',
      'Classes covered by short-term substitutes',
      'mechanism',
      1,
      on('2024-10', '2025-05'),
    ),
    uploaded(
      'guided-reading',
      'Guided reading per week',
      'mechanism',
      1,
      45,
      'min',
      'Guided reading',
      12,
      {
        ...on('2024-10', '2025-05'),
        detail: 'The report gives the timetabled minutes, not the minutes actually taught.',
      },
    ),
    uploaded(
      'at-grade',
      'Pupils reading at grade level',
      'outcome',
      2,
      38,
      '%',
      'Grade-level reading',
      3,
      on('2025-05'),
    ),
  ],
  edges: [
    link('turnover', 'substitutes', 'forced', 'causes'),
    weighed(
      'substitutes',
      'guided-reading',
      'cut',
      'causes',
      0.4,
      'Covered classes lost most of the guided block.',
      -1,
    ),
    weighed(
      'guided-reading',
      'at-grade',
      'drove',
      'causes',
      0.35,
      'Scores tracked guided minutes school by school.',
    ),
    weighed(
      'absence',
      'at-grade',
      'cost',
      'causes',
      0.3,
      'Absent pupils missed the guided block entirely.',
      -1,
    ),
  ],
};

/** Evidence on BOTH sides of a link, in a domain where the dispute is the whole point: reserves ran
 *  out the week the peg broke, and pegs broke that month where reserves had not. The surface must
 *  show both rather than pick a winner, and the qualitative link elsewhere closes the exact ladder. */
const PEG_BREAK: WorldSpec = {
  title: 'Why did the currency peg break?',
  outcomeId: 'devaluation',
  provenance: { notes: ['One link is receipted on both sides and stays contested.'] },
  nodes: [
    measured(
      'reserves',
      'Reserves in months of import cover',
      'root',
      0,
      3.1,
      'months',
      'Import cover',
      on('2026-05'),
    ),
    bare('short-borrowing', 'Short-term foreign borrowing had built up', 'root', 0, {
      ...on('2024-01', '2026-05'),
      detail: 'Rolled over quarterly, so the whole stock came up for renewal inside a year.',
    }),
    measured(
      'defence-rate',
      'Overnight rate at the defence',
      'mechanism',
      1,
      60,
      '%',
      'The overnight rate',
      on('2026-06-08'),
    ),
    measured(
      'devaluation',
      'Devaluation against the anchor',
      'outcome',
      2,
      34,
      '%',
      'The devaluation',
      on('2026-06-11'),
    ),
  ],
  edges: [
    weighed(
      'reserves',
      'devaluation',
      'ran out',
      'causes',
      0.5,
      'Reserves were exhausted the week the peg went.',
      -1,
      'Two neighbours devalued the same month with reserves intact.',
    ),
    link('short-borrowing', 'defence-rate', 'forced', 'contributes'),
    weighed(
      'defence-rate',
      'devaluation',
      'delayed',
      'dampens',
      0.2,
      'Each rate defence bought days, not weeks.',
      -1,
    ),
    link('short-borrowing', 'devaluation', 'exposed', 'contributes'),
  ],
};

/** A five-DAY world. Everything else in the corpus moves in years, and a time scale built from
 *  quarterly or annual labels quietly assumes a granularity a run does not have. The feedback that
 *  makes a run a run is unrolled into a second, deeper wave rather than drawn as a loop back —
 *  a cycle has no topological order, and the cascade would refuse the whole world. Illustrative on
 *  purpose: the mechanism is textbook, and nobody's real deposit ledger is being claimed. */
const BANK_RUN: WorldSpec = {
  title: 'Why did the bank fail in forty-eight hours?',
  outcomeId: 'receivership',
  provenance: {
    illustrative: true,
    notes: ['The mechanism of a run at day resolution — an illustrative book, not any bank’s.'],
  },
  nodes: [
    sketched('rate-repricing', 'Unrealised loss on the bond book', 'root', 0, 17, '%'),
    sketched('uninsured', 'Deposits above the insured limit', 'root', 0, 88, '%', {
      detail:
        'A depositor above the limit has a reason to move first, and knows the others do too.',
    }),
    bare('first-withdrawals', 'The best-informed depositors move first', 'mechanism', 1),
    sketched('fire-sale', 'Securities sold below carrying value', 'mechanism', 2, 9, '%'),
    bare('confidence', 'The sale confirmed the loss to everyone watching', 'mechanism', 3),
    sketched('second-wave', 'Deposits leaving per day', 'mechanism', 4, 42, '%', {
      series: sketchedSeries('%', [
        ['2019-06-10', 1],
        ['2019-06-11', 4],
        ['2019-06-12', 22],
        ['2019-06-13', 42],
        ['2019-06-14', 11],
      ]),
    }),
    bare('receivership', 'The regulator closed the bank', 'outcome', 5),
  ],
  edges: [
    link('rate-repricing', 'fire-sale', 'set up', 'enables'),
    link('uninsured', 'first-withdrawals', 'motivates', 'causes'),
    link('first-withdrawals', 'fire-sale', 'forces', 'causes'),
    link('fire-sale', 'confidence', 'confirms', 'causes'),
    link('confidence', 'second-wave', 'accelerates', 'causes'),
    link('uninsured', 'second-wave', 'widens', 'contributes'),
    link('second-wave', 'receivership', 'triggers', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Numeric stress
 * ------------------------------------------------------------------ */

/** Twelve orders of magnitude on one web — a share of a claim next to a national spending line —
 *  with two breakdowns and a container that has a receipt but no total. A single shared scale
 *  renders half of this as a flat line at zero. */
const HEALTHCARE_COSTS: WorldSpec = {
  title: 'Why does the same procedure cost more every year?',
  outcomeId: 'premium',
  provenance: { notes: ['Twelve orders of magnitude, and a total that only exists as its parts.'] },
  nodes: [
    container(
      'spend',
      'Health spending by category',
      'root',
      0,
      'Spending is published by category, never as one comparable total.',
      {
        unit: 'USD',
        children: [
          measured(
            'spend.hospital',
            'Hospital care',
            'root',
            0,
            1400000000000,
            'USD',
            'Hospital care',
          ),
          measured(
            'spend.physician',
            'Physician services',
            'root',
            0,
            880000000000,
            'USD',
            'Physician services',
          ),
          measured('spend.drugs', 'Retail drugs', 'root', 0, 410000000000, 'USD', 'Retail drugs'),
          measured(
            'spend.admin',
            'Administration',
            'root',
            0,
            290000000000,
            'USD',
            'Administration',
          ),
        ],
      },
    ),
    measured(
      'unit-price',
      'Negotiated price of one infusion',
      'root',
      0,
      4820,
      'USD',
      'The infusion price',
    ),
    measured(
      'copay-share',
      'Share of the bill paid at the counter',
      'mechanism',
      1,
      0.4,
      '%',
      'The counter share',
      {
        detail:
          'Small by design — which is why a price rise is invisible to the person receiving care.',
      },
    ),
    measured(
      'coding',
      'Coded complexity per admission',
      'mechanism',
      1,
      1.06,
      'index',
      'Coded complexity',
    ),
    measured('premium', 'Family premium', 'outcome', 2, 24600, 'USD', 'The family premium', {
      series: measuredSeries('The family premium', 'USD', [
        ['2019', 20576],
        ['2021', 22221],
        ['2023', 23968],
        ['2024', 24600],
      ]),
    }),
  ],
  edges: [
    weighed(
      'unit-price',
      'premium',
      'raises',
      'causes',
      0.4,
      'Premiums moved with negotiated prices.',
    ),
    weighed('coding', 'premium', 'lifts', 'contributes', 0.2, 'A heavier coded mix billed higher.'),
    link('spend', 'premium', 'sets', 'contributes'),
    link('copay-share', 'premium', 'hides', 'dampens', -1),
  ],
};

/** A heavy tail: one peril an order of magnitude past the rest, sitting in a four-child breakdown,
 *  and an attachment point that only bites above it. A chart that scales to the largest child makes
 *  the other three invisible; one that scales to the median clips the one that mattered. */
const INSURANCE_LOSSES: WorldSpec = {
  title: 'Why did the book lose money in a quiet year?',
  outcomeId: 'combined-ratio',
  provenance: { notes: ['One peril dwarfs the other three — the heavy tail an average hides.'] },
  nodes: [
    container(
      'incurred',
      'Incurred losses by peril',
      'root',
      0,
      'Losses are reserved peril by peril, never as one book total.',
      {
        ...on('2025-01', '2025-12'),
        unit: 'USD',
        children: [
          measured(
            'incurred.wildfire',
            'Wildfire',
            'root',
            0,
            82000000,
            'USD',
            'Wildfire losses',
            on('2025-08'),
          ),
          measured(
            'incurred.hail',
            'Hail',
            'root',
            0,
            6400000,
            'USD',
            'Hail losses',
            on('2025-05'),
          ),
          measured(
            'incurred.water',
            'Escape of water',
            'root',
            0,
            3100000,
            'USD',
            'Water losses',
            on('2025-01', '2025-02'),
          ),
          measured(
            'incurred.theft',
            'Theft',
            'root',
            0,
            410000,
            'USD',
            'Theft losses',
            on('2025-01', '2025-12'),
          ),
        ],
      },
    ),
    measured(
      'attachment',
      'Reinsurance attachment point',
      'root',
      0,
      50000000,
      'USD',
      'The attachment point',
      on('2025-01'),
    ),
    measured(
      'rate-adequacy',
      'Rate adequacy at renewal',
      'mechanism',
      1,
      94,
      '%',
      'Rate adequacy',
      on('2026-01'),
    ),
    measured(
      'combined-ratio',
      'Combined ratio',
      'outcome',
      2,
      113,
      '%',
      'The combined ratio',
      on('2026-02'),
    ),
  ],
  edges: [
    weighed(
      'incurred',
      'combined-ratio',
      'drove',
      'causes',
      0.7,
      'One peril accounted for most of the year’s losses.',
    ),
    // The attachment point is a LEVEL, and it runs the other way from the cover it buys: the higher
    // it sits, the more of the year the book carries alone.
    weighed(
      'attachment',
      'combined-ratio',
      'delayed cover',
      'contributes',
      0.3,
      'Recoveries began only above the attachment point.',
    ),
    link('rate-adequacy', 'combined-ratio', 'undercut', 'dampens', -1),
  ],
};

/** Negative values on a receipted series, which a chart axis anchored at zero draws upside down or
 *  clips away. Power really does clear below zero when must-run plant meets a midday surplus, so
 *  this is the honest shape of the domain, not a synthetic edge case. */
const NEGATIVE_POWER_PRICES: WorldSpec = {
  title: 'Why did wholesale power clear below zero at midday?',
  outcomeId: 'negative-hours',
  provenance: { notes: ['A receipted series that crosses zero and stays there.'] },
  nodes: [
    measured('solar-build', 'Installed solar capacity', 'root', 0, 4.2, 'GW', 'Installed solar'),
    measured(
      'must-run',
      'Thermal plant that cannot stop',
      'root',
      0,
      2.1,
      'GW',
      'Must-run output',
      {
        detail: 'Minimum stable generation: switching off costs more than paying to keep running.',
      },
    ),
    measured(
      'midday-surplus',
      'Midday supply above demand',
      'mechanism',
      1,
      1.8,
      'GW',
      'Midday surplus',
    ),
    measured(
      'clearing-price',
      'Midday clearing price',
      'mechanism',
      2,
      -12.4,
      'EUR/MWh',
      'The clearing price',
      {
        series: measuredSeries('The clearing price', 'EUR/MWh', [
          ['2021', 34],
          ['2022', 21],
          ['2023', 4.5],
          ['2024', -12.4],
        ]),
      },
    ),
    measured(
      'negative-hours',
      'Hours cleared below zero',
      'outcome',
      3,
      214,
      'hours',
      'Hours below zero',
    ),
  ],
  edges: [
    weighed(
      'solar-build',
      'midday-surplus',
      'adds',
      'causes',
      0.6,
      'Surplus grew with every GW built.',
    ),
    weighed(
      'must-run',
      'midday-surplus',
      'adds',
      'contributes',
      0.3,
      'Must-run output cannot step aside.',
    ),
    weighed(
      'midday-surplus',
      'clearing-price',
      'pushes down',
      'causes',
      0.7,
      'Price fell as surplus grew, hour for hour.',
      -1,
    ),
    weighed(
      'clearing-price',
      'negative-hours',
      'counts',
      'causes',
      0.9,
      'An hour below zero is an hour counted.',
      -1,
    ),
    link('solar-build', 'negative-hours', 'concentrates', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Series shapes and long records
 * ------------------------------------------------------------------ */

/** Thirty-six monthly points with a strong seasonal cycle, a step down, and a partial return.
 *  Generated rather than typed out: the point is the SHAPE — a smoother that assumes monotone data
 *  flattens the season, and a sampler that keeps every twelfth point erases it entirely. */
function seasonIndex(): ReadonlyArray<readonly [string, number]> {
  const points: Array<readonly [string, number]> = [];
  for (let i = 0; i < 36; i++) {
    const year = 2019 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    const season = 50 + 45 * Math.sin(((month - 3) / 12) * 2 * Math.PI);
    // A lost season, then a partial return — what a seasonal economy does, not a smooth decline.
    const level = i < 15 ? 1 : i < 27 ? 0.15 : 0.6;
    points.push([
      `${year}-${String(month).padStart(2, '0')}`,
      Math.round(season * level * 10) / 10,
    ]);
  }
  return points;
}

/** Series shapes on one web: thirty-six monthly points, a two-point stub, and a node with none. */
const TOURISM_SEASON: WorldSpec = {
  title: 'Why did the island’s season never come back?',
  outcomeId: 'arrivals',
  provenance: {
    illustrative: true,
    notes: [
      'An illustrative arrivals index — the shape of a lost season, not one island’s figures.',
    ],
  },
  nodes: [
    bare('route-cut', 'The direct flight was dropped', 'root', 0),
    sketched('operators', 'Tour operators still selling the island', 'root', 0, 60, '%', {
      series: sketchedSeries('%', [
        ['2019', 100],
        ['2022', 60],
      ]),
    }),
    bare('staff-left', 'Seasonal staff took year-round work elsewhere', 'mechanism', 1),
    sketched('arrivals', 'Monthly arrivals index', 'outcome', 2, 57, '', {
      series: sketchedSeries('', seasonIndex()),
    }),
  ],
  edges: [
    link('route-cut', 'operators', 'stranded', 'causes', -1),
    link('route-cut', 'arrivals', 'cut', 'causes', -1),
    // The operators node counts who is still SELLING, so it carries arrivals rather than costing them.
    link('operators', 'arrivals', 'carried', 'causes'),
    link('staff-left', 'arrivals', 'capped', 'dampens', -1),
  ],
};

/** Thirty annual points that run into the FUTURE. A projection is arithmetic on assumptions, never
 *  a measurement, so the whole world is illustrative and every point is T3 — the one honest way to
 *  put a forecast on a screen next to a receipt. */
function fundingPath(): ReadonlyArray<readonly [string, number]> {
  const points: Array<readonly [string, number]> = [];
  for (let i = 0; i < 30; i++) {
    // A drift down with a market cycle on top: a valuation path is never the straight line a
    // headline "shortfall by 2040" implies.
    points.push([String(2005 + i), Math.round((104 - 1.4 * i + Math.cos(i / 2) * 3) * 10) / 10]);
  }
  return points;
}

const PENSION_SHORTFALL: WorldSpec = {
  title: 'Why is the scheme short in twenty years?',
  outcomeId: 'funding-ratio',
  provenance: {
    illustrative: true,
    notes: [
      'A projection on textbook assumptions — arithmetic about the future, never a measurement of it.',
    ],
  },
  nodes: [
    sketched('discount-rate', 'Discount rate on the liabilities', 'root', 0, 4.5, '%'),
    sketched('longevity', 'Years of pension paid per member', 'root', 0, 23, 'years'),
    bare(
      'contribution-holiday',
      'Contributions were suspended while the scheme looked full',
      'root',
      0,
      {
        detail: 'The holiday ended long before its effect on the funding path did.',
      },
    ),
    sketched('asset-return', 'Assumed real return on assets', 'mechanism', 1, 2.8, '%'),
    sketched('funding-ratio', 'Assets against liabilities', 'outcome', 2, 68, '%', {
      series: sketchedSeries('%', fundingPath()),
    }),
  ],
  edges: [
    link('discount-rate', 'funding-ratio', 'revalues', 'causes'),
    link('longevity', 'funding-ratio', 'lengthens', 'dampens', -1),
    link('contribution-holiday', 'funding-ratio', 'starved', 'causes', -1),
    link('asset-return', 'funding-ratio', 'compounds', 'causes'),
    link('discount-rate', 'asset-return', 'anchors', 'contributes'),
  ],
};

/** Sixteen top-level nodes: the coercer's NODE_CAP exactly, so nothing is dropped and every layout
 *  is asked for its worst readable case. It also carries the awkward series regime — points
 *  authored out of order, one node whose record is a single reading, and most nodes with none. */
const WAGE_STAGNATION: WorldSpec = {
  title: 'Why did median pay stall while output kept rising?',
  outcomeId: 'median-pay',
  provenance: {
    illustrative: true,
    notes: [
      'At the node cap, with an unsorted series — the shape of the decoupling argument, not a measurement.',
    ],
  },
  nodes: [
    sketched('union-density', 'Share of workers covered by a contract', 'root', 0, 11, '%', {
      // Authored out of order on purpose: the adapter sorts by parsed time, and a layout that
      // trusts array order draws a zigzag.
      series: sketchedSeries('%', [
        ['2000', 24],
        ['2020', 11],
        ['2005', 21],
        ['2015', 14],
        ['2010', 17],
      ]),
    }),
    sketched('offshoring', 'Tasks moved abroad', 'root', 0, 9, '%'),
    sketched('automation', 'Capital spend per worker', 'root', 0, 3800, 'USD'),
    bare('non-compete', 'Non-compete clauses spread down the wage scale', 'root', 0),
    bare('concentration', 'Fewer employers per local labour market', 'root', 0),
    bare('gig-classification', 'Work reclassified as contracting', 'root', 0),
    sketched('housing-cost', 'Rent as a share of median pay', 'root', 0, 34, '%', {
      series: sketchedSeries('%', [['2020', 34]]),
      detail: 'A single reading — the comparable series was rebased and does not join up.',
    }),
    bare('training', 'Employer-funded training fell away', 'root', 0),
    bare('bargaining', 'A worker’s outside option narrows', 'mechanism', 1),
    bare('mobility', 'Fewer job-to-job moves', 'mechanism', 1),
    sketched('labour-share', 'Labour share of value added', 'mechanism', 2, 57, '%'),
    bare('profit-share', 'More of the surplus is retained', 'mechanism', 2),
    sketched('productivity', 'Output per hour', 'mechanism', 2, 128, 'index'),
    bare('pay-setting', 'Pay is set against last year, not against output', 'mechanism', 3),
    bare('compression', 'The pay scale compresses in the middle', 'mechanism', 3),
    sketched('median-pay', 'Median real pay', 'outcome', 4, 103, 'index'),
  ],
  // Two mechanism nodes are named as the LOSS ("outside option narrows", "fewer moves"), so a cause
  // that makes them worse points at them with +1 — only union coverage runs the other way.
  edges: [
    link('union-density', 'bargaining', 'weakens', 'dampens', -1),
    link('non-compete', 'mobility', 'restricts', 'causes'),
    link('concentration', 'mobility', 'restricts', 'causes'),
    link('gig-classification', 'bargaining', 'removes', 'causes'),
    link('offshoring', 'bargaining', 'undercuts', 'contributes'),
    link('automation', 'productivity', 'raises', 'causes'),
    link('training', 'productivity', 'limits', 'dampens', -1),
    link('housing-cost', 'mobility', 'anchors', 'contributes'),
    link('bargaining', 'labour-share', 'lowers', 'causes', -1),
    link('mobility', 'labour-share', 'lowers', 'causes', -1),
    link('labour-share', 'profit-share', 'shifts to', 'causes', -1),
    link('productivity', 'labour-share', 'outpaces', 'dampens', -1),
    link('profit-share', 'pay-setting', 'insulates', 'enables'),
    link('bargaining', 'compression', 'flattens', 'contributes'),
    link('mobility', 'compression', 'flattens', 'contributes'),
    link('pay-setting', 'median-pay', 'holds down', 'dampens', -1),
    link('compression', 'median-pay', 'flattens', 'causes', -1),
    // The link the whole argument turns on: output per hour SHOULD have carried pay with it.
    link('productivity', 'median-pay', 'should lift', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Loose ends
 * ------------------------------------------------------------------ */

/** A node no edge reaches, in the situation where an orphan is most tempting to wire up: a big,
 *  measured number that everyone in the room assumes is the cause. It stays unlinked because
 *  nothing established the link — and it must not vanish, drift, or land on another node. */
const LAUNCH_MISS: WorldSpec = {
  title: 'Why did the launch miss its first quarter?',
  outcomeId: 'missed-target',
  provenance: { notes: ['A measured figure is recorded but deliberately not linked to the miss.'] },
  nodes: [
    measured(
      'waitlist',
      'Waitlist signups before launch',
      'root',
      0,
      18400,
      'signups',
      'The waitlist',
      on('2025-09', '2026-01'),
    ),
    measured(
      'day-one',
      'Day-one activation',
      'root',
      0,
      11,
      '%',
      'Day-one activation',
      on('2026-01-15'),
    ),
    bare(
      'setup-drop',
      'Most accounts stopped at the workspace step',
      'mechanism',
      1,
      on('2026-01-15', '2026-02'),
    ),
    measured('ad-spend', 'Launch advertising', 'mechanism', 1, 96000, 'USD', 'Launch advertising', {
      ...on('2026-01', '2026-03'),
      detail: 'Spent in the same three weeks. Nothing yet ties it to the miss either way.',
    }),
    bare('missed-target', 'The quarter’s target was missed', 'outcome', 2, on('2026-03')),
  ],
  edges: [
    link('waitlist', 'setup-drop', 'fed', 'contributes'),
    weighed(
      'day-one',
      'setup-drop',
      'stalled at',
      'causes',
      0.5,
      'Nine in ten stopped at the same step on day one.',
      -1,
    ),
    link('setup-drop', 'missed-target', 'starved', 'causes'),
  ],
};

/** A container's four children plus a contested link, in a market where the dispute is live: the
 *  identifier change and the budget freeze landed in the same quarter and each side has a receipt.
 *  Two roots, two mechanisms, one outcome — a squat fan rather than another chain. */
const AD_MARKET: WorldSpec = {
  title: 'Why did display revenue halve in two quarters?',
  outcomeId: 'display-revenue',
  provenance: { notes: ['A four-way channel breakdown, and a contested link nobody has settled.'] },
  nodes: [
    container(
      'channel-mix',
      'Revenue by channel',
      'root',
      0,
      'Revenue is booked per channel, never as one display total.',
      {
        ...on('2025-07', '2025-12'),
        unit: '%',
        children: [
          measured('channel-mix.open', 'Open exchange', 'root', 0, 46, '%', 'Open-exchange share'),
          measured('channel-mix.direct', 'Direct sold', 'root', 0, 31, '%', 'Direct-sold share'),
          measured(
            'channel-mix.pmp',
            'Private marketplace',
            'root',
            0,
            18,
            '%',
            'Private-marketplace share',
          ),
          measured('channel-mix.house', 'House ads', 'root', 0, 5, '%', 'House-ad share'),
        ],
      },
    ),
    bare('identifiers', 'Third-party identifiers stopped resolving', 'root', 0, on('2025-08')),
    bare(
      'budget-freeze',
      'Advertiser budgets froze mid-quarter',
      'root',
      0,
      on('2025-10', '2025-11'),
    ),
    measured(
      'cpm',
      'Average CPM',
      'mechanism',
      1,
      2.4,
      'USD',
      'The average CPM',
      on('2025-07', '2025-12'),
    ),
    measured(
      'fill-rate',
      'Fill rate',
      'mechanism',
      1,
      63,
      '%',
      'The fill rate',
      on('2025-07', '2025-12'),
    ),
    measured(
      'display-revenue',
      'Display revenue against the prior half',
      'outcome',
      2,
      51,
      '%',
      'Display revenue',
      on('2025-12'),
    ),
  ],
  edges: [
    weighed(
      'identifiers',
      'cpm',
      'devalued',
      'causes',
      0.45,
      'Unaddressable inventory cleared at a third of the price.',
      -1,
      'Logged-in supply held its price through the same quarter.',
    ),
    link('budget-freeze', 'fill-rate', 'emptied', 'causes', -1),
    link('channel-mix', 'fill-rate', 'exposed', 'contributes'),
    weighed(
      'cpm',
      'display-revenue',
      'cut',
      'causes',
      0.5,
      'Revenue moved with price, not with volume.',
    ),
    weighed(
      'fill-rate',
      'display-revenue',
      'cut',
      'causes',
      0.3,
      'Unsold impressions earned nothing.',
    ),
  ],
};

/** A container whose four children are the whole story, alongside a node that is grounded but has
 *  no number, in a domain where the aggregate genuinely does not exist as one figure. */
const MIDDLE_WAGE_JOBS: WorldSpec = {
  title: 'Why did the region lose its middle-wage jobs?',
  outcomeId: 'middle-share',
  provenance: {
    notes: ['A sector breakdown with no comparable total, and one grounded node with no figure.'],
  },
  nodes: [
    container(
      'employment',
      'Employment by sector',
      'root',
      0,
      'Employment is published by sector, never as one regional total.',
      {
        unit: 'jobs',
        children: [
          measured(
            'employment.factory',
            'Manufacturing',
            'root',
            0,
            14200,
            'jobs',
            'Manufacturing jobs',
          ),
          measured('employment.logistics', 'Logistics', 'root', 0, 9800, 'jobs', 'Logistics jobs'),
          measured('employment.care', 'Care work', 'root', 0, 21500, 'jobs', 'Care jobs'),
          measured(
            'employment.public',
            'Public sector',
            'root',
            0,
            7300,
            'jobs',
            'Public-sector jobs',
          ),
        ],
      },
    ),
    measured('capex', 'Automation spend per worker', 'root', 0, 3800, 'USD', 'Automation spend'),
    bare('retraining', 'Retraining places filled slowly', 'mechanism', 1, {
      detail: 'Places existed; the take-up was the constraint, not the funding.',
    }),
    measured(
      'routine-share',
      'Roles that are mostly routine tasks',
      'mechanism',
      1,
      31,
      '%',
      'Routine-task share',
      {
        series: measuredSeries('Routine-task share', '%', [
          ['2014', 44],
          ['2018', 39],
          ['2022', 34],
          ['2024', 31],
        ]),
      },
    ),
    measured(
      'middle-share',
      'Middle-wage share of jobs',
      'outcome',
      2,
      26,
      '%',
      'Middle-wage share',
      {
        series: measuredSeries('Middle-wage share', '%', [
          ['2014', 38],
          ['2018', 34],
          ['2022', 29],
          ['2024', 26],
        ]),
      },
    ),
  ],
  edges: [
    weighed(
      'capex',
      'routine-share',
      'displaced',
      'causes',
      0.4,
      'Routine roles fell fastest where capex per worker was highest.',
      -1,
    ),
    weighed(
      'routine-share',
      'middle-share',
      'hollowed',
      'causes',
      0.55,
      'The middle band lost the routine roles and gained none.',
    ),
    link('employment', 'middle-share', 'reshaped', 'contributes'),
    link('retraining', 'middle-share', 'failed to hold', 'dampens', -1),
  ],
};

/* ------------------------------------------------------------------ *
 * The batch
 * ------------------------------------------------------------------ */

/**
 * The economics / business / society batch. Ordered cheapest-first, like the base corpus: a failure
 * in a three-node world is far easier to reason about than the same failure in a sixteen-node one,
 * and they usually fail together. Every id is prefixed `society-` so this batch can be concatenated
 * with any other without a collision.
 */
export const SOCIETY_ECONOMY_SCENARIOS: WorldScenario[] = [
  {
    id: 'society-bakery-closure',
    label: 'Two statuses, three nodes',
    note: 'The smallest world holding a supported edge next to a provisional one, with an outcome that carries no number — the edge treatment has to distinguish evidence from assertion.',
    spec: BAKERY_CLOSURE,
  },
  {
    id: 'society-startup-churn',
    label: 'Fully grounded (second)',
    note: 'Receipts and weights on every node and link, over a T1/T2 mix: pins that "only a grounded world answers exactly" is a property of the gate, not of one fixture.',
    spec: STARTUP_CHURN,
  },
  {
    id: 'society-launch-miss',
    label: 'Orphan with a big number',
    note: 'A measured, unlinked node that everyone assumes is the cause — it must stay placed and stay unwired.',
    spec: LAUNCH_MISS,
  },
  {
    id: 'society-peg-break',
    label: 'Contested devaluation',
    note: 'A link receipted for AND against, plus a qualitative link that closes the exact ladder.',
    spec: PEG_BREAK,
  },
  {
    id: 'society-reading-scores',
    label: 'All T1, page-anchored',
    note: 'Four figures read out of one uploaded report, each with its own page — the T1 regime the base corpus only samples one node at a time.',
    spec: READING_SCORES,
  },
  {
    id: 'society-remote-work',
    label: 'Four sinks, one outcome',
    note: 'Three terminal effects that are not the outcome — breaks any layout that reads "deepest column" or "every leaf" as the answer.',
    spec: REMOTE_WORK,
  },
  {
    id: 'society-tourism-season',
    label: 'Thirty-six seasonal months',
    note: 'A strong monthly cycle with a step down and a partial return, next to a two-point stub and a node with no series at all.',
    spec: TOURISM_SEASON,
  },
  {
    id: 'society-negative-power',
    label: 'A series that crosses zero',
    note: 'Receipted prices that go negative — a zero-anchored axis draws this upside down or clips it away.',
    spec: NEGATIVE_POWER_PRICES,
  },
  {
    id: 'society-bank-run',
    label: 'Five days, not five years',
    note: 'The only day-resolution world in the corpus: a time scale built for annual labels has to survive a run.',
    spec: BANK_RUN,
  },
  {
    id: 'society-port-closure',
    label: 'Diamond onto a container',
    note: 'Two routes from one root rejoin on a node whose magnitude lives entirely in its children, over a T0/T1/T2 mix.',
    spec: PORT_CLOSURE,
  },
  {
    id: 'society-insurance-losses',
    label: 'Heavy tail in a breakdown',
    note: 'One child an order of magnitude past its siblings — scaling to the largest hides the rest, scaling to the median clips the one that mattered.',
    spec: INSURANCE_LOSSES,
  },
  {
    id: 'society-middle-wage-jobs',
    label: 'Sector breakdown, no total',
    note: 'A grounded container with four children and no comparable aggregate, alongside two receipted series.',
    spec: MIDDLE_WAGE_JOBS,
  },
  {
    id: 'society-ad-market',
    label: 'Squat fan, contested',
    note: 'A four-way channel breakdown plus a live dispute — two roots, two mechanisms, one outcome, no chain anywhere.',
    spec: AD_MARKET,
  },
  {
    id: 'society-healthcare-costs',
    label: 'Twelve orders of magnitude',
    note: '0.4% beside a trillion-dollar spending line, with two breakdowns — a single shared scale flattens half the world to zero.',
    spec: HEALTHCARE_COSTS,
  },
  {
    id: 'society-segregation',
    label: 'Structure only, dated',
    note: 'A sorting mechanism with no number anywhere, shaped as a diamond: the chart must shelve the whole world, while decade-long periods still place it on the timeline.',
    spec: SEGREGATION_TIPPING,
  },
  {
    id: 'society-transit-ridership',
    label: 'Five uneven monthly series',
    note: 'A receipted series on every node, of different lengths and cadences, one with a gap where no count was taken.',
    spec: TRANSIT_RIDERSHIP,
  },
  {
    id: 'society-pension-shortfall',
    label: 'A thirty-year projection',
    note: 'Arithmetic about the future, kept honest as an illustrative T3 series — the only way a forecast may share a screen with a receipt.',
    spec: PENSION_SHORTFALL,
  },
  {
    id: 'society-monopoly-flywheel',
    label: 'A flywheel, unrolled',
    note: 'A reinforcing argument written as an acyclic ladder that splits and rejoins twice — a cycle has no topological order and the cascade would refuse it.',
    spec: MONOPOLY_FLYWHEEL,
  },
  {
    id: 'society-inflation-passthrough',
    label: 'Nine depths and a bypass',
    note: 'The ribbon case with one long-range edge from the root to depth six, which a band-breaking layout has to route without crossing the cards between.',
    spec: INFLATION_PASSTHROUGH,
  },
  {
    id: 'society-housing',
    label: 'Wide and layered',
    note: 'Nine roots onto two mechanisms onto one outcome, each condition dated by the years it ran and none of them measured over time.',
    spec: HOUSING_AFFORDABILITY,
  },
  {
    id: 'society-wage-stagnation',
    label: 'At the node cap (16)',
    note: 'Exactly NODE_CAP top-level nodes so nothing is dropped, with an unsorted series and a single-reading series on the same web.',
    spec: WAGE_STAGNATION,
  },
];

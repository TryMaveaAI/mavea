// world/scenarios.ts — the living answer's scenario corpus: named WorldSpecs that between them
// cover the SHAPES, DATA REGIMES and DOMAINS a real conversation produces, rather than the single
// world the surface happens to ship with. WORLD_SEED is one sample — 2008, twelve nodes, wholly
// illustrative — and a layout or a renderer that only holds up on it is not finished. This corpus
// is what the world gauntlet sweeps, and what a dev/QA pass can page through by hand.
//
// Two rules keep the fixtures honest, and they are the same rules the product obeys:
//
//   1. Every spec here survives its OWN coercion. `coerceWorldSpec(raw, worldCorpus(spec))` is the
//      gate a real turn passes through, so a fixture that could not pass it would be exercising a
//      world the product can never build. That is why a receipt's quote is written FROM its value
//      (`reading()`) — the coercer keeps a real figure only when the value's own digits appear in
//      the quote, and a hand-written sentence drifts from its number the moment either is edited.
//   2. Tiers say what actually backs a number. T1 is a figure read out of the user's own document,
//      T2 a figure with a public receipt, T3 a textbook figure inside an explicitly illustrative
//      world, and T0 the no-number tier every ungrounded claim degrades to. Nothing here is dressed
//      up as measured that isn't; the domains are real and explainable, the arithmetic is not
//      anyone's data.
import type { Receipt } from '../ground/types';
import type { EdgeRelation } from '../trust/relations';
import type { CausalRole } from '../why/types';
import { WORLD_SEED } from './seed';
import type { WorldEdge, WorldNode, WorldSeries, WorldSpec } from './types';
import { deriveEdgeStatus } from './validate';

/** Where every quote in this corpus is cited from. Named as what it is — a fixture — so nothing
 *  here can be mistaken for a real source if a scenario ever reaches a screen. */
const HOST = 'scenario corpus';

export interface WorldScenario {
  /** Stable slug — test names, dev-lab routes and defect reports all key on it. */
  id: string;
  label: string;
  /** What this scenario stresses, in one sentence. */
  note: string;
  spec: WorldSpec;
}

/* ------------------------------------------------------------------ *
 * Builders. Small and literal on purpose: a fixture that needs decoding is a fixture nobody
 * re-reads when it fails.
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
 * Shapes
 * ------------------------------------------------------------------ */

/** Ten depths, one node each: the ribbon case. A composition this long cannot be shown across a
 *  landscape viewport at a readable scale without being broken into reading bands. */
const CHAIN_RAINFOREST: WorldSpec = {
  title: 'Why is the rainforest drying out?',
  outcomeId: 'savanna-shift',
  provenance: {
    illustrative: true,
    notes: [
      'Textbook moisture-recycling chain — the mechanism, not a measurement of any basin.',
      'The decades are illustrative with everything else: the chain runs over a working lifetime, and these are the years that shape, not any basin’s record.',
    ],
  },
  nodes: [
    bare('clearing', 'Forest cleared for pasture', 'root', 0, on('1998', '2012')),
    bare('fewer-trees', 'Fewer trees left transpiring', 'mechanism', 1, on('2004')),
    sketched('less-vapour', 'Less water vapour returned to the air', 'mechanism', 2, 30, '%', {
      ...on('2006'),
      detail: 'A mature canopy returns most of the rain that lands on it straight back upward.',
    }),
    bare('weak-recycling', 'Moisture recycling inland weakens', 'mechanism', 3, on('2009')),
    sketched(
      'short-season',
      'The rainy season starts later',
      'mechanism',
      4,
      3,
      'weeks',
      on('2010', '2018'),
    ),
    bare('soil-deficit', 'Dry-season soil deficit deepens', 'mechanism', 5, on('2015')),
    bare('leaf-shedding', 'Trees shed leaves to survive the deficit', 'mechanism', 6, on('2017')),
    bare('open-canopy', 'The canopy opens and the forest floor dries', 'mechanism', 7, on('2019')),
    bare('fire-escapes', 'Ground fire escapes into standing forest', 'mechanism', 8, on('2021')),
    bare('savanna-shift', 'The forest shifts toward savanna', 'outcome', 9, on('2022', '2026')),
  ],
  edges: [
    link('clearing', 'fewer-trees', 'removes', 'causes'),
    link('fewer-trees', 'less-vapour', 'reduces', 'causes'),
    link('less-vapour', 'weak-recycling', 'starves', 'causes'),
    link('weak-recycling', 'short-season', 'delays', 'contributes'),
    link('short-season', 'soil-deficit', 'deepens', 'causes'),
    link('soil-deficit', 'leaf-shedding', 'forces', 'causes'),
    link('leaf-shedding', 'open-canopy', 'opens', 'causes'),
    link('open-canopy', 'fire-escapes', 'enables', 'enables'),
    link('fire-escapes', 'savanna-shift', 'tips', 'causes'),
  ],
};

/** Eleven roots landing on one outcome: the flat, wide web. No node carries a series, so the chart
 *  shelves the entire world — while the campaign the roots belong to is dated by month, so the same
 *  world reaches the timeline. Illustrative throughout, dates included: it is the shape of a swing
 *  decomposition, not one district's calendar. */
const WIDE_ELECTION: WorldSpec = {
  title: 'Why did the district swing?',
  outcomeId: 'seat-flipped',
  provenance: {
    illustrative: true,
    notes: ['Illustrative shares — the shape of a swing decomposition, not any real result.'],
  },
  nodes: [
    sketched(
      'turnout-young',
      'Turnout rose among first-time voters',
      'root',
      0,
      4.1,
      'pp',
      on('2026-05-07'),
    ),
    sketched(
      'turnout-rural',
      'Turnout fell in rural precincts',
      'root',
      0,
      2.6,
      'pp',
      on('2026-05-07'),
    ),
    sketched(
      'cost-living',
      'Cost of living dominated local coverage',
      'root',
      0,
      31,
      '%',
      on('2026-01', '2026-05'),
    ),
    sketched(
      'hospital',
      'The hospital closure stayed in the news',
      'root',
      0,
      12,
      '%',
      on('2025-11', '2026-04'),
    ),
    sketched(
      'boundary',
      'A boundary review moved two wards in',
      'root',
      0,
      5.4,
      'pp',
      on('2025-09'),
    ),
    sketched('incumbent', 'The incumbent retired', 'root', 0, 9, '%', on('2025-10')),
    sketched(
      'third-party',
      'A third party stood down locally',
      'root',
      0,
      3.2,
      'pp',
      on('2026-03'),
    ),
    sketched(
      'ground-game',
      'One campaign out-canvassed the other',
      'root',
      0,
      7,
      '%',
      on('2026-02', '2026-05'),
    ),
    sketched('postal', 'Postal voting was extended', 'root', 0, 1.9, 'pp', on('2026-01')),
    sketched(
      'weather',
      'Polling day was wet all afternoon',
      'root',
      0,
      0.8,
      'pp',
      on('2026-05-07'),
    ),
    sketched(
      'national',
      'The national swing ran the same way',
      'root',
      0,
      6.5,
      'pp',
      on('2026-04', '2026-05'),
    ),
    sketched('seat-flipped', 'The seat changed hands', 'outcome', 1, 2.3, 'pp', on('2026-05-08')),
  ],
  edges: [
    link('turnout-young', 'seat-flipped', 'lifted', 'contributes'),
    link('turnout-rural', 'seat-flipped', 'held back', 'dampens', -1),
    link('cost-living', 'seat-flipped', 'drove', 'causes'),
    link('hospital', 'seat-flipped', 'drove', 'causes'),
    link('boundary', 'seat-flipped', 'shifted', 'contributes'),
    link('incumbent', 'seat-flipped', 'opened', 'enables'),
    link('third-party', 'seat-flipped', 'released', 'contributes'),
    link('ground-game', 'seat-flipped', 'converted', 'contributes'),
    link('postal', 'seat-flipped', 'widened', 'contributes'),
    link('weather', 'seat-flipped', 'suppressed', 'dampens', -1),
    link('national', 'seat-flipped', 'carried', 'contributes'),
  ],
};

/** One cause reaching the outcome by two routes that rejoin — the diamond a depth-by-topology pass
 *  has to column correctly. Tiers are deliberately mixed: T0, T1 and T2 on one web. */
const DIAMOND_BRIDGE: WorldSpec = {
  title: 'Why did the bridge shake itself apart?',
  outcomeId: 'deck-failed',
  provenance: {
    notes: ['Mixed tiers: one figure from an uploaded report, one public, the rest qualitative.'],
  },
  nodes: [
    bare('steady-wind', 'A steady crosswind along the span', 'root', 0, {
      ...on('2025-11-06T21:00Z', '2025-11-07T03:40Z'),
      detail: 'Not a gust — the sustained, single-direction flow the deck could lock onto.',
    }),
    measured(
      'vortex',
      'Vortices shed off the deck edge',
      'mechanism',
      1,
      0.6,
      'Hz',
      'Shedding',
      on('2025-11-06T22:10Z'),
    ),
    uploaded(
      'torsion',
      'Torsional mode excited',
      'mechanism',
      2,
      0.2,
      'Hz',
      'Torsional mode',
      4,
      on('2025-11-06T23:20Z'),
    ),
    bare('vertical', 'Vertical bending mode excited', 'mechanism', 2, on('2025-11-06T23:35Z')),
    measured(
      'coupling',
      'The two modes locked together',
      'mechanism',
      3,
      8,
      'deg',
      'Twist angle',
      on('2025-11-07T01:05Z'),
    ),
    measured(
      'deck-failed',
      'The deck tore free',
      'outcome',
      4,
      100,
      '%',
      'Span loss',
      on('2025-11-07T03:12Z'),
    ),
  ],
  edges: [
    weighed('steady-wind', 'vortex', 'sheds', 'causes', 0.8, 'A steady flow sheds a steady wake.'),
    weighed(
      'vortex',
      'torsion',
      'excites',
      'causes',
      0.5,
      'The wake period met the torsional mode.',
    ),
    link('vortex', 'vertical', 'excites', 'causes'),
    weighed('torsion', 'coupling', 'locks', 'contributes', 0.7, 'Twist fed the next lift cycle.'),
    link('vertical', 'coupling', 'feeds', 'contributes'),
    weighed(
      'coupling',
      'deck-failed',
      'tore',
      'causes',
      0.9,
      'Amplitude grew until the hangers let go.',
    ),
  ],
};

/** One node and nothing else. The coercer REFUSES this world (it needs two nodes to be a web at
 *  all), so it exists to prove the surface degrades rather than crashes on a world it can render
 *  but never build. */
const SINGLE_OUTCOME: WorldSpec = {
  title: 'Why did the invoice triple?',
  outcomeId: 'bill-tripled',
  provenance: { notes: ['No causes were established — the outcome alone.'] },
  nodes: [measured('bill-tripled', 'The monthly bill tripled', 'outcome', 0, 214, '%', 'The bill')],
  edges: [],
};

/** The smallest web that is still a web. */
const PAIR_MINIMAL: WorldSpec = {
  title: 'Why did the sourdough fail to rise?',
  outcomeId: 'flat-loaf',
  provenance: { notes: ['A single established link.'] },
  nodes: [
    bare(
      'cold-kitchen',
      'The kitchen sat below 18°C overnight',
      'root',
      0,
      on('2026-02-14T21:30Z', '2026-02-15T06:30Z'),
    ),
    bare('flat-loaf', 'The loaf came out flat', 'outcome', 1, on('2026-02-15T08:40Z')),
  ],
  edges: [link('cold-kitchen', 'flat-loaf', 'slowed', 'causes')],
};

/** A node no edge reaches. It is a real finding the answer holds — it just has not been connected
 *  to anything yet — and it must not vanish, drift off the composition, or land on another node. */
const ORPHAN_LAKE: WorldSpec = {
  title: 'Why did the lake turn green?',
  outcomeId: 'algal-bloom',
  provenance: { notes: ['One observation is recorded but not yet linked to a cause.'] },
  nodes: [
    bare('fertiliser', 'Fertiliser ran off the north fields', 'root', 0, on('2025-04', '2025-05')),
    bare(
      'warm-water',
      'Surface water stayed warm into September',
      'root',
      0,
      on('2025-06', '2025-09'),
    ),
    bare('nutrients', 'Nutrient load rose in the shallows', 'mechanism', 1, on('2025-06')),
    measured('boat-traffic', 'Boat traffic', 'mechanism', 1, 41, '%', 'Weekend boat movements', {
      ...on('2025-07', '2025-08'),
      detail: 'Recorded during the same weeks. Nothing yet ties it to the bloom either way.',
    }),
    bare('algal-bloom', 'The lake bloomed', 'outcome', 2, on('2025-08')),
  ],
  edges: [
    link('fertiliser', 'nutrients', 'raised', 'causes'),
    link('nutrients', 'algal-bloom', 'fed', 'causes'),
    link('warm-water', 'algal-bloom', 'favoured', 'enables'),
  ],
};

/** How wide the generated grid world is at each stage, and what each stage's nodes are called.
 *  Twelve × five stages plus the outcome is 61 nodes and 102 links — past the size where a
 *  quadratic in a layout stops being invisible. */
const GRID_WIDTH = 12;
const GRID_STAGES: readonly string[] = [
  'Line {n} sags into vegetation',
  'Line {n} trips out',
  'Load reroutes onto corridor {n}',
  'Corridor {n} passes its rating',
  'Zone {n} islands and sheds load',
];

/** The scale case, generated because writing 61 plausible nodes by hand would be noise, not signal.
 *  Every edge runs from a shallower stage to a deeper one, so the web is acyclic by construction
 *  and the cascade always finds a topological order. */
function gridBlackout(): WorldSpec {
  const nodes: WorldNode[] = [];
  const edges: WorldEdge[] = [];
  const idAt = (stage: number, i: number): string => `s${stage}-${i}`;

  GRID_STAGES.forEach((template, stage) => {
    for (let i = 0; i < GRID_WIDTH; i++) {
      const id = idAt(stage, i);
      const label = template.replace('{n}', String(i + 1));
      const role: CausalRole = stage === 0 ? 'root' : 'mechanism';
      // Only the loaded stages carry a figure, and only the islanding stage carries a history —
      // so the chart has real lines to draw and a large majority to shelf, which is the honest
      // shape of a big causal web.
      if (stage >= 2) {
        const megawatts = 120 + ((i * 37 + stage * 11) % 260);
        nodes.push(
          sketched(id, label, role, stage, megawatts, 'MW', {
            ...(stage === GRID_STAGES.length - 1
              ? {
                  series: sketchedSeries('MW', [
                    ['2024-01', megawatts],
                    ['2024-02', megawatts * 1.1],
                    ['2024-03', megawatts * 0.8],
                  ]),
                }
              : {}),
          }),
        );
      } else {
        nodes.push(bare(id, label, role, stage));
      }
      if (stage > 0) {
        // Two predecessors per node, the second offset across the ring, so the web fans and
        // re-converges instead of being twelve parallel chains.
        for (const from of [idAt(stage - 1, i), idAt(stage - 1, (i + 5) % GRID_WIDTH)]) {
          edges.push(link(from, id, 'loads', 'contributes'));
        }
      }
    }
  });

  const outcome = 'blackout';
  nodes.push(bare(outcome, 'The regional grid blacks out', 'outcome', GRID_STAGES.length));
  for (let i = 0; i < 6; i++) {
    edges.push(link(idAt(GRID_STAGES.length - 1, i), outcome, 'cascades into', 'causes'));
  }

  return {
    title: 'Why did the regional grid black out?',
    outcomeId: outcome,
    provenance: {
      illustrative: true,
      notes: ['Illustrative cascade at realistic size — the shape of a grid failure, not one.'],
    },
    nodes,
    edges,
  };
}

/* ------------------------------------------------------------------ *
 * Data regimes
 * ------------------------------------------------------------------ */

/** The ONE fully grounded world in the corpus: every node figure carries a receipt whose quote
 *  holds its digits, and every link is T2, weighted and receipted. This is the only regime in which
 *  the engine may answer a what-if with an exact delta — every other scenario must answer in words,
 *  and the gauntlet asserts exactly that. */
const GROUNDED_RETENTION: WorldSpec = {
  title: 'Why did renewals fall this quarter?',
  outcomeId: 'renewals',
  provenance: { notes: ['Every figure and every link is receipted — the exact ladder is open.'] },
  nodes: [
    measured(
      'price-change',
      'List price rose at renewal',
      'root',
      0,
      18,
      '%',
      'The price increase',
      on('2026-01'),
    ),
    uploaded(
      'onboarding',
      'Onboarding completion slipped',
      'root',
      0,
      42,
      '%',
      'Completion',
      3,
      on('2025-10', '2026-03'),
    ),
    measured(
      'support-wait',
      'First-response time stretched',
      'mechanism',
      1,
      9,
      'min',
      'The wait',
      on('2026-01', '2026-03'),
    ),
    measured('renewals', 'Renewal rate', 'outcome', 2, 62, '%', 'The renewal rate', on('2026-03')),
  ],
  edges: [
    weighed(
      'price-change',
      'renewals',
      'cut',
      'dampens',
      0.35,
      'Renewal fell most on repriced plans.',
      -1,
    ),
    weighed(
      'onboarding',
      'support-wait',
      'raised',
      'causes',
      0.5,
      'Unfinished setups became tickets.',
    ),
    weighed(
      'support-wait',
      'renewals',
      'eroded',
      'dampens',
      0.25,
      'Slow first replies preceded churn.',
      -1,
    ),
    weighed(
      'price-change',
      'support-wait',
      'raised',
      'contributes',
      0.2,
      'Repricing drove billing tickets.',
    ),
  ],
};

/** Structure only. No node carries a figure, no series exists, nothing is dated — so the chart and
 *  the timeline have nothing they can honestly place and must shelf the ENTIRE world with a band
 *  that says so. A biochemical mechanism is the natural home for this regime: the answer is the
 *  sequence, and there is no number in it.
 *
 *  It stays undated DELIBERATELY, and it is the corpus's one world that does. A cycle in steady
 *  state has an order but no calendar position — every step is running right now, and has been for
 *  as long as the cell has — so a date here would be invented rather than unstated. The honest
 *  answer for a world like this is the disabled "Over time" chip, not a plausible-looking year. */
const T0_KREBS: WorldSpec = {
  title: 'Why does the Krebs cycle stall without oxygen?',
  outcomeId: 'cycle-halts',
  provenance: {
    illustrative: true,
    notes: ['A mechanism, not a measurement — this explanation has no numbers in it at all.'],
  },
  nodes: [
    bare('no-oxygen', 'No oxygen at the end of the electron transport chain', 'root', 0),
    bare('chain-backs-up', 'The electron transport chain backs up', 'mechanism', 1),
    bare('nadh-stays', 'NADH is not re-oxidised back to NAD⁺', 'mechanism', 2),
    bare('nad-pool', 'The free NAD⁺ pool runs down', 'mechanism', 3),
    bare('dehydrogenases', 'The cycle’s dehydrogenase steps lose their acceptor', 'mechanism', 4),
    bare('cycle-halts', 'The cycle halts', 'outcome', 5),
  ],
  edges: [
    link('no-oxygen', 'chain-backs-up', 'blocks', 'causes'),
    link('chain-backs-up', 'nadh-stays', 'prevents', 'causes'),
    link('nadh-stays', 'nad-pool', 'drains', 'causes'),
    link('nad-pool', 'dehydrogenases', 'starves', 'causes'),
    link('dehydrogenases', 'cycle-halts', 'stops', 'causes'),
  ],
};

/** Every node carries a measured series — the regime where the chart representation is at its
 *  richest and the shelf should be empty. */
const SERIES_RESERVOIR: WorldSpec = {
  title: 'Why did the reservoir run low?',
  outcomeId: 'storage',
  provenance: { notes: ['Every node carries a receipted annual series.'] },
  nodes: [
    measured('rainfall', 'Catchment rainfall', 'root', 0, 610, 'mm', 'Catchment rainfall', {
      series: measuredSeries('Catchment rainfall', 'mm', [
        ['2019', 940],
        ['2020', 880],
        ['2021', 760],
        ['2022', 700],
        ['2023', 655],
        ['2024', 610],
      ]),
    }),
    measured('demand', 'Metered demand', 'root', 0, 218, 'ML/d', 'Metered demand', {
      series: measuredSeries('Metered demand', 'ML/d', [
        ['2019', 190],
        ['2020', 196],
        ['2021', 203],
        ['2022', 209],
        ['2023', 214],
        ['2024', 218],
      ]),
    }),
    measured('inflow', 'River inflow', 'mechanism', 1, 340, 'ML/d', 'River inflow', {
      series: measuredSeries('River inflow', 'ML/d', [
        ['2019', 620],
        ['2020', 570],
        ['2021', 480],
        ['2022', 430],
        ['2023', 380],
        ['2024', 340],
      ]),
    }),
    measured('leakage', 'Network leakage', 'mechanism', 1, 96, 'ML/d', 'Network leakage', {
      series: measuredSeries('Network leakage', 'ML/d', [
        ['2019', 88],
        ['2020', 90],
        ['2021', 93],
        ['2022', 94],
        ['2023', 95],
        ['2024', 96],
      ]),
    }),
    measured('storage', 'Reservoir storage', 'outcome', 2, 27, '%', 'Reservoir storage', {
      series: measuredSeries('Reservoir storage', '%', [
        ['2019', 88],
        ['2020', 81],
        ['2021', 66],
        ['2022', 52],
        ['2023', 38],
        ['2024', 27],
      ]),
    }),
  ],
  edges: [
    weighed('rainfall', 'inflow', 'feeds', 'causes', 0.7, 'Inflow tracked the catchment total.'),
    weighed('inflow', 'storage', 'refills', 'causes', 0.6, 'Storage rose in the years inflow did.'),
    weighed(
      'demand',
      'storage',
      'draws down',
      'dampens',
      0.3,
      'Peak demand weeks drew storage down.',
      -1,
    ),
    link('leakage', 'storage', 'wastes', 'dampens', -1),
  ],
};

/** Evidence on BOTH sides of a link. A contested edge is receipted for and receipted against, and
 *  the surface has to show both rather than picking a winner. One qualitative link elsewhere keeps
 *  the world out of the exact regime — which is the honest reading: a disputed web cannot answer
 *  a counterfactual to the decimal. */
const CONTESTED_FISHERY: WorldSpec = {
  title: 'Why did the cod fishery collapse?',
  outcomeId: 'stock-collapse',
  provenance: { notes: ['One link is receipted on both sides and stays contested.'] },
  nodes: [
    measured('trawling', 'Bottom-trawl effort', 'root', 0, 3.4, 'kh', 'Trawl hours', {
      ...on('1985', '1992'),
      detail: 'Effort in thousands of vessel-hours over the shelf grounds.',
    }),
    bare('warming', 'Shelf water warmed through the decade', 'root', 0, on('1983', '1993')),
    measured(
      'recruitment',
      'Juvenile recruitment',
      'mechanism',
      1,
      12,
      '%',
      'Recruitment index',
      on('1991'),
    ),
    measured(
      'stock-collapse',
      'Spawning stock',
      'outcome',
      2,
      8,
      '%',
      'Spawning stock biomass',
      on('1992'),
    ),
  ],
  edges: [
    weighed(
      'trawling',
      'recruitment',
      'suppressed',
      'dampens',
      0.55,
      'Recruitment fell fastest where trawl effort was highest.',
      -1,
      'Recruitment fell as far in the closed area, where no trawler worked.',
    ),
    link('warming', 'recruitment', 'shifted', 'contributes', -1),
    weighed(
      'recruitment',
      'stock-collapse',
      'starved',
      'causes',
      0.6,
      'Missing year-classes never reached the spawning stock.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Content stress
 * ------------------------------------------------------------------ */

/** Labels the layouts were never authored against: a 113-character sentence, a single word, Latin
 *  accents, and a right-to-left script. Nothing here is decoration — a real answer about a French
 *  river or a Jordanian aquifer produces exactly these strings. */
const LABEL_EXTREMES: WorldSpec = {
  title: 'Why did the river run dry?',
  outcomeId: 'riverbed-dry',
  provenance: {
    illustrative: true,
    notes: ['Label stress — the shapes text actually arrives in.'],
  },
  nodes: [
    bare(
      'long-cause',
      'Abstraction licences issued through the 1970s were never revisited once the upstream aquifer began to fall',
      'root',
      0,
      on('1970', '1979'),
    ),
    bare('drought', 'Drought', 'root', 0, on('2022-06', '2022-09')),
    bare(
      'rhone',
      'Débit du fleuve Rhône réduit à l’étiage',
      'mechanism',
      1,
      on('2022-07', '2022-09'),
    ),
    bare('groundwater', 'انخفاض منسوب المياه الجوفية', 'mechanism', 1, on('1985', '2022')),
    sketched('baseflow', 'Baseflow', 'mechanism', 2, 12, '%', on('2022-08')),
    bare('riverbed-dry', 'The riverbed dried', 'outcome', 3, on('2022-09')),
  ],
  edges: [
    link('long-cause', 'groundwater', 'lowered', 'causes'),
    link('drought', 'rhone', 'cut', 'causes'),
    link('rhone', 'baseflow', 'reduced', 'causes'),
    link('groundwater', 'baseflow', 'reduced', 'causes'),
    link('baseflow', 'riverbed-dry', 'ended', 'causes'),
  ],
};

/** Numbers across nine orders of magnitude on one web, several nodes with their own breakdown, and
 *  a container whose magnitude lives entirely in its children rather than on itself. */
const MAGNITUDE_AQUIFER: WorldSpec = {
  title: 'Why is the aquifer level falling?',
  outcomeId: 'water-table',
  provenance: { notes: ['Nine orders of magnitude, and a total that only exists as its parts.'] },
  nodes: [
    container(
      'abstraction',
      'Licensed abstraction',
      'root',
      0,
      'Abstraction is licensed and reported by sector, never as a single basin total.',
      {
        ...on('2024-01', '2024-12'),
        unit: 'L',
        children: [
          measured(
            'abstraction.municipal',
            'Municipal supply',
            'root',
            0,
            1.2e12,
            'L',
            'Municipal supply',
          ),
          measured('abstraction.farms', 'Irrigated farms', 'root', 0, 8.4e11, 'L', 'Irrigation'),
          measured(
            'abstraction.industry',
            'Industry',
            'root',
            0,
            9.1e10,
            'L',
            'Industrial abstraction',
          ),
          measured(
            'abstraction.leak',
            'Distribution losses',
            'root',
            0,
            3.3e11,
            'L',
            'Distribution losses',
          ),
        ],
      },
    ),
    measured('recharge', 'Winter recharge', 'root', 0, 0.0003, 'm/d', 'Recharge rate', {
      ...on('2023-11', '2024-03'),
      detail: 'Metres per day averaged over the outcrop — a small number by nature, not by error.',
      children: [
        measured('recharge.outcrop', 'Chalk outcrop', 'root', 0, 0.0011, 'm/d', 'Outcrop recharge'),
        measured(
          'recharge.drift',
          'Through drift cover',
          'root',
          0,
          0.00007,
          'm/d',
          'Drift recharge',
        ),
      ],
    }),
    measured(
      'tracer',
      'Tracer dose used in the survey',
      'mechanism',
      1,
      0.0003,
      'mSv',
      'The dose',
      on('2024-02-14'),
    ),
    container(
      'balance',
      'Net balance',
      'mechanism',
      2,
      'The balance is reported as its components, not as a headline figure.',
      {
        ...on('2024-01', '2024-12'),
        children: [
          measured('balance.in', 'Inflow', 'mechanism', 2, 6.2e11, 'L', 'Annual inflow'),
          measured('balance.out', 'Outflow', 'mechanism', 2, 2.46e12, 'L', 'Annual outflow'),
        ],
      },
    ),
    measured(
      'water-table',
      'Water table',
      'outcome',
      3,
      41.8,
      'm',
      'The water table',
      on('2025-04'),
    ),
  ],
  edges: [
    weighed(
      'abstraction',
      'balance',
      'draws from',
      'causes',
      0.65,
      'Every litre licensed leaves the balance.',
      -1,
    ),
    weighed(
      'recharge',
      'balance',
      'replenishes',
      'causes',
      0.3,
      'Recharge is the only credit in the balance.',
    ),
    link('tracer', 'balance', 'measured', 'correlates'),
    weighed(
      'balance',
      'water-table',
      'sets',
      'causes',
      0.9,
      'The table follows the balance with a lag.',
    ),
  ],
};

/** Forty monthly readings, generated: the coercer's series cap, and enough points that a per-point
 *  quadratic in a path builder would show. */
function glacierMonths(): ReadonlyArray<readonly [string, number]> {
  const points: Array<readonly [string, number]> = [];
  for (let i = 0; i < 40; i++) {
    const year = 1985 + i;
    // A steady loss with a small oscillation — a real mass-balance record is neither flat nor
    // monotone, and a layout that only ever sees a monotone fixture is under-tested.
    points.push([String(year), Math.round((-0.3 * i + Math.sin(i / 3) * 2) * 100) / 100]);
  }
  return points;
}

/** Series edge cases on one web: a single point (no line to draw), points authored out of order,
 *  a forty-point run, and a node with no series at all to keep the shelf non-empty. */
const SERIES_SHAPES_GLACIER: WorldSpec = {
  title: 'Why is the glacier losing mass?',
  outcomeId: 'mass-balance',
  provenance: {
    illustrative: true,
    notes: ['Series edge cases — one point, unsorted points, forty points, and none at all.'],
  },
  nodes: [
    sketched('summer-temp', 'Summer air temperature', 'root', 0, 1.4, '°C', {
      series: sketchedSeries('°C', [['2024', 1.4]]),
      detail: 'A single reading — the record starts and ends in the same season.',
    }),
    sketched('albedo', 'Surface albedo', 'root', 0, 0.31, '', {
      // Authored out of order on purpose: the adapter sorts by parsed time, and a layout that
      // trusts array order draws a zigzag.
      series: sketchedSeries('', [
        ['2021', 0.42],
        ['2019', 0.48],
        ['2024', 0.31],
        ['2020', 0.45],
        ['2023', 0.34],
        ['2022', 0.39],
      ]),
    }),
    bare('snowfall', 'Winter snowfall', 'root', 0),
    sketched('mass-balance', 'Cumulative mass balance', 'outcome', 1, -11.2, 'm w.e.', {
      series: sketchedSeries('m w.e.', glacierMonths()),
    }),
  ],
  edges: [
    link('summer-temp', 'mass-balance', 'melts', 'causes', -1),
    link('albedo', 'mass-balance', 'absorbs', 'contributes', -1),
    link('snowfall', 'mass-balance', 'accumulates', 'causes'),
  ],
};

/** Exactly ONE dated observation in the whole world. No node carries a date of its own here — on
 *  purpose, so the only route onto the axis is the series span `worldToMorph` derives — which makes
 *  a single one-point series the smallest thing a timeline can be asked to draw, and a scale built
 *  from a single instant the degenerate case both time-based representations have to survive. */
const SINGLE_INSTANT_WAREHOUSE: WorldSpec = {
  title: 'Why did the warehouse flood?',
  outcomeId: 'stock-ruined',
  provenance: { notes: ['One gauge reading is the only dated fact in the answer.'] },
  nodes: [
    measured('gauge', 'River gauge at the wharf', 'root', 0, 4.6, 'm', 'The gauge', {
      series: measuredSeries('The gauge', 'm', [['2024-10', 4.6]]),
    }),
    bare('drain-blocked', 'The yard drain was blocked with silt', 'root', 0),
    bare('door-seal', 'The dock-door seal had perished', 'mechanism', 1),
    bare('stock-ruined', 'Pallet stock on the floor was ruined', 'outcome', 2),
  ],
  edges: [
    link('gauge', 'door-seal', 'overtopped', 'causes'),
    link('drain-blocked', 'door-seal', 'ponded against', 'contributes'),
    link('door-seal', 'stock-ruined', 'admitted water to', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * The corpus
 * ------------------------------------------------------------------ */

/**
 * The scenario corpus. Ordered cheapest-first so a failure in a small, readable world is reported
 * before the generated one — a red 61-node fixture is far harder to reason about than a red
 * two-node one, and they usually fail together.
 */
export const WORLD_SCENARIOS: readonly WorldScenario[] = [
  {
    id: 'seed-2008',
    label: 'The shipped seed',
    note: 'The one world the surface has today: twelve nodes, illustrative, series on five of them.',
    spec: WORLD_SEED,
  },
  {
    id: 'single-outcome',
    label: 'One node, no causes',
    note: 'An outcome with nothing established behind it. The coercer refuses it (a web needs two nodes); the surface still has to render it.',
    spec: SINGLE_OUTCOME,
  },
  {
    id: 'pair-minimal',
    label: 'Two nodes, one link',
    note: 'The smallest thing that is still a causal web.',
    spec: PAIR_MINIMAL,
  },
  {
    id: 'chain-rainforest',
    label: 'Deep narrow chain',
    note: 'Ten depths, one node each — the ribbon case the graph layout has to break into reading bands.',
    spec: CHAIN_RAINFOREST,
  },
  {
    id: 'wide-election',
    label: 'Shallow and wide',
    note: 'Eleven roots converging on one outcome, dated by month across a campaign and measured nowhere over time.',
    spec: WIDE_ELECTION,
  },
  {
    id: 'diamond-bridge',
    label: 'Diamond, mixed tiers',
    note: 'One cause reaching the outcome by two routes that rejoin, over a T0/T1/T2 mix.',
    spec: DIAMOND_BRIDGE,
  },
  {
    id: 'orphan-lake',
    label: 'Disconnected node',
    note: 'A recorded observation no edge reaches — it must stay placed, not drift or vanish.',
    spec: ORPHAN_LAKE,
  },
  {
    id: 'grounded-retention',
    label: 'Fully grounded',
    note: 'Receipts and weights on every node and link — the only regime that may answer a what-if exactly.',
    spec: GROUNDED_RETENTION,
  },
  {
    id: 't0-krebs',
    label: 'Structure only (T0)',
    note: 'No figure anywhere and, deliberately, no date — a steady-state cycle has no calendar position, so both time-based representations must shelf the entire world and say so.',
    spec: T0_KREBS,
  },
  {
    id: 'series-reservoir',
    label: 'A series on every node',
    note: 'Five receipted annual series — the chart at its richest, with an empty shelf.',
    spec: SERIES_RESERVOIR,
  },
  {
    id: 'contested-fishery',
    label: 'Contested evidence',
    note: 'A link receipted for AND against, plus one qualitative link that closes the exact ladder.',
    spec: CONTESTED_FISHERY,
  },
  {
    id: 'label-extremes',
    label: 'Label stress',
    note: 'A 113-character label, a one-word label, accented Latin, and a right-to-left script.',
    spec: LABEL_EXTREMES,
  },
  {
    id: 'magnitude-aquifer',
    label: 'Nine orders of magnitude',
    note: '0.0003 alongside 1.2e12, with breakdowns on several nodes and a container whose magnitude lives in its children.',
    spec: MAGNITUDE_AQUIFER,
  },
  {
    id: 'single-instant',
    label: 'One dated observation',
    note: 'A single one-point series is the only dated fact — the degenerate time domain both time-based representations have to survive.',
    spec: SINGLE_INSTANT_WAREHOUSE,
  },
  {
    id: 'series-shapes',
    label: 'Series edge cases',
    note: 'A one-point series, an unsorted series, a forty-point series, and a node with none.',
    spec: SERIES_SHAPES_GLACIER,
  },
  {
    id: 'grid-blackout',
    label: 'Scale: 61 nodes, 102 links',
    note: 'A layered cascade past the size where a quadratic in a layout stops being invisible.',
    spec: gridBlackout(),
  },
];

/** Look one up by id — the dev lab and a failing test both want this rather than an index. */
export function worldScenario(id: string): WorldScenario | undefined {
  return WORLD_SCENARIOS.find((s) => s.id === id);
}

/**
 * Every quote a spec cites, as one body of text: the corpus that grounds it. Pass it as
 * `coerceWorldSpec(raw, worldCorpus(spec))` to round-trip a scenario through the honesty gates
 * exactly as a live turn goes through them — the sentences the receipts quote are, by construction,
 * the sentences the source contained.
 */
export function worldCorpus(spec: WorldSpec): string {
  const quotes: string[] = [];
  const take = (r: Receipt | undefined): void => {
    if (r) quotes.push(r.quote);
  };
  const visit = (n: WorldNode): void => {
    take(n.receipt);
    take(n.series?.receipt);
    for (const p of n.series?.points ?? []) take(p.receipt);
    for (const c of n.children ?? []) visit(c);
  };
  for (const n of spec.nodes) visit(n);
  for (const e of spec.edges) {
    take(e.receipt);
    for (const r of e.receipts ?? []) take(r);
    take(e.counter);
  }
  return quotes.join('\n');
}

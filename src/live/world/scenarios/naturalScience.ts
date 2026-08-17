// world/scenarios/naturalScience.ts — twenty-one worlds drawn from the natural sciences and
// medicine. The base corpus proves the SHAPES a causal web arrives in; this batch proves the
// DOMAINS do not all behave alike. A physiological mechanism has no numbers in it at all, a
// volcano observatory has excellent numbers and refuses to put one on its conclusion, a
// pharmacology answer arrives with evidence pointing both ways, and a flash flood is measured in
// hours where a glacier is measured in decades — the same renderer has to hold up across every one.
//
// The honesty rules are the corpus's, unchanged:
//
//   1. A receipt's quote is BUILT from the value it grounds (`reading()`), so the two can never
//      drift: the coercer keeps a real figure only when the value's own digits appear in its quote,
//      and a hand-written sentence stops matching the moment either side is edited.
//   2. A tier says what actually backs a number. T1 is a figure read off the user's own document
//      (with its page), T2 a figure carrying a public receipt, T3 a textbook magnitude that may
//      only exist inside an explicitly illustrative world, and T0 the no-number tier every
//      ungrounded claim degrades to. Where a domain genuinely does not support a precise figure —
//      an eruption forecast, a catalytic cycle count — the node is T0 and stays T0.
//
// The mechanisms are real and explainable; the arithmetic is a fixture and says so (`HOST`).
import type { Receipt } from '../../ground/types';
import type { EdgeRelation } from '../../trust/relations';
import type { CausalRole } from '../../why/types';
import type { WorldScenario } from '../scenarios';
import type { WorldEdge, WorldNode, WorldSeries, WorldSpec } from '../types';
import { deriveEdgeStatus } from '../validate';

/** Where every quote in this batch is cited from. Named as what it is — a fixture — so nothing here
 *  can be mistaken for a real source if a scenario ever reaches a screen. */
const HOST = 'scenario corpus';

/* ------------------------------------------------------------------ *
 * Builders. Deliberate duplicates of the base corpus's — a batch file is read on its own when it
 * fails, and the builders are the part you have to be able to see. Behaviour is identical, so a
 * later hoist into a shared module is a move, not a rewrite.
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

/** The share, written INTO the receipt exactly the way `reading()` writes a value into its own.
 *  A weight is a measurement — the ribbons size themselves by it — so the coercer keeps one only
 *  when the cited sentence actually states it, and a hand-authored sentence drifts from its number
 *  the moment either is edited. Printed at full precision so the stated share IS the stored one. */
const shareOf = (weight: number): string =>
  `Accounted for ${+(weight * 100).toFixed(2)}% of the outcome.`;

/** A measured link: weighted, receipted, T2. */
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
  const receipt: Receipt = { quote: `${quote} ${shareOf(weight)}`, host: HOST };
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
 * Earth systems
 * ------------------------------------------------------------------ */

/** Measured nodes, annual series, and one deliberately qualitative branch. The dampening path
 *  (stratification) shares an outcome with the reinforcing one, so a chart that assumes every
 *  contribution points the same way draws the wrong picture. */
const OCEAN_HEAT: WorldSpec = {
  title: 'Why does the ocean keep gaining heat?',
  outcomeId: 'heat-content',
  provenance: {
    notes: [
      'Figures sit at the magnitudes the observing systems report; the receipts are fixture text.',
    ],
  },
  nodes: [
    measured('co2', 'Atmospheric CO₂', 'root', 0, 421, 'ppm', 'Atmospheric CO₂', {
      series: measuredSeries('Atmospheric CO₂', 'ppm', [
        ['2019', 411],
        ['2020', 414],
        ['2021', 416],
        ['2022', 419],
        ['2023', 421],
      ]),
    }),
    measured(
      'imbalance',
      'Top-of-atmosphere energy imbalance',
      'mechanism',
      1,
      0.9,
      'W/m²',
      'The energy imbalance',
    ),
    measured(
      'uptake',
      'Share of the retained energy that ends up in seawater',
      'mechanism',
      2,
      90,
      '%',
      'The ocean share',
    ),
    bare('stratification', 'The warmed surface layer stratifies', 'mechanism', 2, {
      detail: 'A warmer, lighter surface mixes downward less readily, which works the other way.',
    }),
    measured(
      'heat-content',
      'Upper-ocean heat content',
      'outcome',
      3,
      287,
      'ZJ',
      'Upper-ocean heat content',
      {
        series: measuredSeries('Upper-ocean heat content', 'ZJ', [
          ['2019', 230],
          ['2020', 245],
          ['2021', 258],
          ['2022', 272],
          ['2023', 287],
        ]),
      },
    ),
  ],
  edges: [
    weighed('co2', 'imbalance', 'traps', 'causes', 0.6, 'Less of the outgoing longwave escapes.'),
    weighed('imbalance', 'uptake', 'loads', 'causes', 0.7, 'Seawater takes almost all of it.'),
    weighed(
      'uptake',
      'heat-content',
      'accumulates in',
      'causes',
      0.8,
      'Heat content climbs for as long as the imbalance stays positive.',
    ),
    link('imbalance', 'stratification', 'warms', 'causes'),
    link('stratification', 'heat-content', 'slows mixing into', 'dampens', -1),
  ],
};

/** A T1 world: the numbers come off the user's own site investigation, with page anchors, and the
 *  mechanism between them carries none. Two roots converge one step in, so the composition is a
 *  fan that becomes a chain. */
const QUAKE_LIQUEFACTION: WorldSpec = {
  title: 'Why did the apartment block tilt after the quake?',
  outcomeId: 'block-tilted',
  provenance: {
    notes: ['Every figure is read from the uploaded site investigation; the rest is mechanism.'],
  },
  nodes: [
    measured(
      'shaking',
      'Peak ground acceleration at the site',
      'root',
      0,
      0.35,
      'g',
      'Peak ground acceleration',
      on('2026-01-19T04:31Z'),
    ),
    uploaded(
      'loose-sand',
      'Loose saturated sand between 3 m and 9 m depth',
      'root',
      0,
      8,
      'blows',
      'The corrected blow count',
      12,
      { detail: 'Below the water table for the whole of that interval.' },
    ),
    bare(
      'cyclic-load',
      'Each shaking cycle loads the sand with no time to drain',
      'mechanism',
      1,
      on('2026-01-19T04:31Z', '2026-01-19T04:33Z'),
    ),
    bare(
      'pore-pressure',
      'Pore water pressure climbs cycle by cycle',
      'mechanism',
      2,
      on('2026-01-19T04:32Z'),
    ),
    bare(
      'zero-stress',
      'Effective stress reaches zero and the grains float apart',
      'mechanism',
      3,
      on('2026-01-19T04:33Z'),
    ),
    uploaded(
      'settlement',
      'Differential settlement across the raft',
      'mechanism',
      4,
      220,
      'mm',
      'Differential settlement',
      31,
      on('2026-01-19T04:33Z', '2026-01-19T18:00Z'),
    ),
    uploaded(
      'block-tilted',
      'The block came to rest out of plumb',
      'outcome',
      5,
      2.4,
      'deg',
      'The residual tilt',
      2,
      on('2026-01-22'),
    ),
  ],
  edges: [
    link('shaking', 'cyclic-load', 'drives', 'causes'),
    link('loose-sand', 'cyclic-load', 'offers a bed for', 'enables'),
    link('cyclic-load', 'pore-pressure', 'raises', 'causes'),
    link('pore-pressure', 'zero-stress', 'cancels', 'causes'),
    weighed(
      'zero-stress',
      'settlement',
      'settles',
      'causes',
      0.75,
      'The raft settled where the sand had liquefied.',
    ),
    weighed(
      'settlement',
      'block-tilted',
      'tilts',
      'causes',
      0.85,
      'The tilt follows the differential settlement across the raft.',
    ),
  ],
};

/** Signals with excellent numbers and a conclusion that carries none. Three receipted series feed
 *  two unmeasured interpretations and a T0 outcome — the honest shape for a domain where the inputs
 *  are instrumented and the forecast is not. A chart has plenty to draw; the outcome card must
 *  still show no figure. */
const CALDERA_UNREST: WorldSpec = {
  title: 'Why did the observatory raise the alert level?',
  outcomeId: 'alert',
  provenance: {
    notes: ['Instrument readings are receipted; the interpretation is qualitative on purpose.'],
  },
  nodes: [
    measured('uplift', 'Ground uplift at the caldera centre', 'root', 0, 65, 'mm/yr', 'Uplift', {
      series: measuredSeries('Uplift', 'mm/yr', [
        ['2020', 12],
        ['2021', 21],
        ['2022', 34],
        ['2023', 48],
        ['2024', 65],
      ]),
    }),
    measured('so2', 'SO₂ flux from the fumarole field', 'root', 0, 420, 't/d', 'SO₂ flux', {
      series: measuredSeries('SO₂ flux', 't/d', [
        ['2020', 90],
        ['2021', 140],
        ['2022', 210],
        ['2023', 320],
        ['2024', 420],
      ]),
    }),
    measured(
      'seismicity',
      'Shallow volcano-tectonic events',
      'root',
      0,
      18,
      'per day',
      'Shallow event rate',
      {
        series: measuredSeries('Shallow event rate', 'per day', [
          ['2020', 2],
          ['2021', 4],
          ['2022', 7],
          ['2023', 11],
          ['2024', 18],
        ]),
      },
    ),
    bare('intrusion', 'Fresh magma is intruding at shallow depth', 'mechanism', 1),
    bare('hydrothermal', 'The hydrothermal system is pressurising', 'mechanism', 1),
    bare('alert', 'The alert level was raised one step', 'outcome', 2, {
      detail:
        'Unrest is not a forecast. Nothing here asserts a probability or a date for an eruption, and no figure is attached to this node for that reason.',
    }),
  ],
  edges: [
    link('uplift', 'intrusion', 'is consistent with', 'correlates'),
    link('so2', 'intrusion', 'points to', 'correlates'),
    link('seismicity', 'intrusion', 'accompanies', 'correlates'),
    link('uplift', 'hydrothermal', 'could equally be', 'correlates'),
    link('intrusion', 'alert', 'triggered', 'causes'),
    link('hydrothermal', 'alert', 'triggered', 'causes'),
  ],
};

/** Hours, not years. Two receipted hourly series with clock-time labels, so anything that assumes a
 *  world's time axis is annual — tick formatting, extent parsing, the timeline's band width —
 *  meets a sub-day domain. Two independent routes converge on the peak. */
const FLASH_FLOOD: WorldSpec = {
  title: 'Why did the high street flood in under two hours?',
  outcomeId: 'peak',
  provenance: {
    notes: [
      'Gauge readings through one evening; the water behind the embankment stood past midnight, so the world runs from teatime to the small hours.',
    ],
  },
  nodes: [
    measured(
      'rain',
      'Rainfall intensity at the upland gauge',
      'root',
      0,
      42,
      'mm/h',
      'Rainfall intensity',
      {
        ...on('2026-08-11T18:00Z', '2026-08-11T23:00Z'),
        series: measuredSeries('Rainfall intensity', 'mm/h', [
          ['18:00', 6],
          ['19:00', 21],
          ['20:00', 42],
          ['21:00', 33],
          ['22:00', 11],
          ['23:00', 3],
        ]),
      },
    ),
    bare('wet-soil', 'The catchment was already at field capacity', 'root', 0),
    measured(
      'impervious',
      'Sealed surface across the new estate',
      'root',
      0,
      63,
      '%',
      'Sealed surface',
    ),
    measured(
      'runoff',
      'Share of the rain that ran off',
      'mechanism',
      1,
      72,
      '%',
      'The runoff share',
      on('2026-08-11T18:30Z', '2026-08-11T22:00Z'),
    ),
    bare('culvert', 'The rail culvert was part-blocked with debris', 'mechanism', 1),
    bare(
      'backwater',
      'Water ponded behind the embankment',
      'mechanism',
      2,
      on('2026-08-11T20:40Z', '2026-08-12T01:30Z'),
    ),
    measured(
      'peak',
      'Peak discharge at the town gauge',
      'outcome',
      3,
      128,
      'm³/s',
      'Peak discharge',
      {
        ...on('2026-08-11T21:00Z'),
        series: measuredSeries('Peak discharge', 'm³/s', [
          ['18:00', 12],
          ['19:00', 19],
          ['20:00', 58],
          ['21:00', 128],
          ['22:00', 96],
          ['23:00', 44],
        ]),
      },
    ),
  ],
  edges: [
    weighed('rain', 'runoff', 'delivers', 'causes', 0.5, 'Runoff rose with the hourly intensity.'),
    weighed('impervious', 'runoff', 'seals', 'causes', 0.3, 'Sealed ground infiltrates nothing.'),
    link('wet-soil', 'runoff', 'leaves no store for', 'contributes'),
    weighed('runoff', 'peak', 'concentrates into', 'causes', 0.7, 'The peak followed the runoff.'),
    link('culvert', 'backwater', 'holds back', 'causes'),
    link('backwater', 'peak', 'raises', 'contributes'),
  ],
};

/** Ten depths and two roots, with one measured threshold in the middle of an otherwise qualitative
 *  chain and a non-monotone outcome series that falls for fifteen years and then recovers. A chart
 *  that reads "trend" off the first and last point gets this world exactly backwards. */
const OZONE_HOLE: WorldSpec = {
  title: 'Why does the ozone hole open every spring?',
  outcomeId: 'column',
  provenance: {
    notes: ['A mechanism with two real numbers in it: a physical threshold and a column record.'],
  },
  nodes: [
    measured(
      'cfc',
      'CFC-12 released from refrigeration and foam blowing',
      'root',
      0,
      540,
      'ppt',
      'The CFC-12 burden',
    ),
    bare('montreal', 'The phase-out cut new emissions', 'root', 0),
    bare(
      'troposphere',
      'The molecules are unreactive and survive the lower atmosphere',
      'mechanism',
      1,
    ),
    bare('stratosphere', 'Slow overturning lifts them above the ozone layer', 'mechanism', 2),
    bare('photolysis', 'Short-wave sunlight splits a chlorine atom off', 'mechanism', 3),
    bare('reservoirs', 'Most of that chlorine is parked as HCl and ClONO₂', 'mechanism', 4),
    measured(
      'psc',
      'Polar stratospheric clouds form in the winter vortex',
      'mechanism',
      5,
      195,
      'K',
      'The cloud formation threshold',
    ),
    bare(
      'activation',
      'Reservoir species react on the cloud particles to release Cl₂',
      'mechanism',
      6,
    ),
    bare('vortex', 'The vortex keeps the processed air walled off until spring', 'mechanism', 7),
    bare('sunrise', 'The first sunlight photolyses Cl₂ into free radicals', 'mechanism', 8),
    bare('catalytic', 'Catalytic cycles run over and over on the same atom', 'mechanism', 9, {
      detail:
        'One chlorine atom passes through the cycle many times before it is parked again. How many is not a number this answer holds.',
    }),
    measured(
      'column',
      'October total column ozone over the pole',
      'outcome',
      10,
      145,
      'DU',
      'October column ozone',
      {
        series: measuredSeries('October column ozone', 'DU', [
          ['1979', 300],
          ['1987', 180],
          ['1994', 92],
          ['2006', 85],
          ['2015', 120],
          ['2023', 145],
        ]),
      },
    ),
  ],
  edges: [
    link('montreal', 'cfc', 'cut', 'dampens', -1),
    link('cfc', 'troposphere', 'survives', 'enables'),
    link('troposphere', 'stratosphere', 'is carried into', 'causes'),
    link('stratosphere', 'photolysis', 'exposes to', 'causes'),
    link('photolysis', 'reservoirs', 'feeds', 'causes'),
    weighed(
      'psc',
      'activation',
      'provides surfaces for',
      'enables',
      0.6,
      'Activation only runs where cloud particles form.',
    ),
    link('reservoirs', 'activation', 'supplies', 'causes'),
    link('activation', 'vortex', 'is bottled up by', 'enables'),
    link('vortex', 'sunrise', 'holds until', 'enables'),
    link('sunrise', 'catalytic', 'starts', 'causes'),
    weighed(
      'catalytic',
      'column',
      'destroys',
      'causes',
      0.85,
      'The column falls fastest in the weeks after sunrise.',
      -1,
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Life, populations and land
 * ------------------------------------------------------------------ */

/** Twelve nodes, ten of them roots, and half of them with no figure at all — the wide fan in its
 *  half-numbered regime, which is what a real multi-stressor answer looks like. No node carries a
 *  series, so the chart shelves the whole world; the arrivals and the losses are dated across a
 *  century instead. The three roots that stay undated are the standing ones — a single valley's
 *  worth of range, one egg a year, no island within reach — which were true throughout and so have
 *  no date to give. */
const ISLAND_EXTINCTION: WorldSpec = {
  title: 'Why did the island bird go extinct?',
  outcomeId: 'extinct',
  provenance: {
    illustrative: true,
    notes: ['A composite island endemic — the standard stressor set, not one species’ record.'],
  },
  nodes: [
    bare('rats', 'Ship rats reached the island with the first cargo', 'root', 0, on('1841')),
    bare('cats', 'Feral cats established in the lowland scrub', 'root', 0, on('1868', '1890')),
    sketched(
      'clearing',
      'Lowland forest cleared for plantation',
      'root',
      0,
      78,
      '%',
      on('1885', '1930'),
    ),
    bare('hunting', 'Birds were taken for food and for feathers', 'root', 0, on('1850', '1902')),
    bare('disease', 'Introduced avian malaria reached the lowlands', 'root', 0, on('1907')),
    sketched('small-range', 'The species only ever held one valley', 'root', 0, 12, 'km²'),
    sketched('low-fecundity', 'One egg per pair per year', 'root', 0, 1, 'egg/yr'),
    bare('cyclone', 'A cyclone flattened what canopy was left', 'root', 0, on('1932')),
    sketched(
      'inbreeding',
      'The remnant population lost genetic diversity',
      'root',
      0,
      3,
      '%',
      on('1920', '1940'),
    ),
    bare('no-refuge', 'No predator-free island lay within dispersal range', 'root', 0),
    bare(
      'nest-predation',
      'Nests were emptied faster than they could be replaced',
      'mechanism',
      1,
      on('1845', '1938'),
    ),
    bare('extinct', 'The species was never recorded again', 'outcome', 2, on('1941')),
  ],
  edges: [
    link('rats', 'nest-predation', 'raided', 'causes'),
    link('cats', 'nest-predation', 'raided', 'causes'),
    link('nest-predation', 'extinct', 'emptied', 'causes'),
    link('clearing', 'extinct', 'removed habitat for', 'causes'),
    link('hunting', 'extinct', 'thinned', 'contributes'),
    link('disease', 'extinct', 'killed', 'contributes'),
    link('small-range', 'extinct', 'left no margin for', 'enables'),
    link('low-fecundity', 'extinct', 'slowed recovery of', 'enables'),
    link('cyclone', 'extinct', 'stripped', 'contributes'),
    link('inbreeding', 'extinct', 'weakened', 'contributes'),
    link('no-refuge', 'extinct', 'closed the exit for', 'enables'),
  ],
};

/** An epidemic curve: an illustrative series that rises, peaks and falls, on a world whose nodes are
 *  otherwise textbook constants. A layout that only ever meets monotone series draws the wrong
 *  shape here, and a "latest value" summary reports the tail rather than the outbreak. */
const OUTBREAK_MEASLES: WorldSpec = {
  title: 'Why did measles come back in this district?',
  outcomeId: 'outbreak',
  provenance: {
    illustrative: true,
    notes: ['Textbook measles constants and an illustrative curve — not any district’s record.'],
  },
  nodes: [
    sketched(
      'r0',
      'Measles spreads further per case than almost anything else',
      'root',
      0,
      15,
      'cases',
    ),
    sketched('coverage', 'Two-dose coverage in the district', 'root', 0, 84, '%'),
    bare('importation', 'One imported case reached a school', 'root', 0),
    sketched('threshold', 'Coverage needed to stop transmission', 'mechanism', 1, 93, '%'),
    sketched(
      'susceptible',
      'A susceptible pool built up in one age band',
      'mechanism',
      2,
      4200,
      'children',
    ),
    bare('chains', 'Transmission chains established across three schools', 'mechanism', 3),
    sketched('outbreak', 'Confirmed cases', 'outcome', 4, 124, 'cases', {
      series: sketchedSeries('cases', [
        ['wk 1', 3],
        ['wk 2', 9],
        ['wk 3', 26],
        ['wk 4', 61],
        ['wk 5', 98],
        ['wk 6', 124],
        ['wk 7', 96],
        ['wk 8', 52],
        ['wk 9', 21],
        ['wk 10', 7],
      ]),
    }),
  ],
  edges: [
    link('r0', 'threshold', 'sets', 'causes'),
    link('coverage', 'susceptible', 'shrinks', 'dampens', -1),
    link('threshold', 'susceptible', 'is missed by', 'contributes'),
    link('susceptible', 'chains', 'fuels', 'causes'),
    link('r0', 'chains', 'accelerates', 'causes'),
    link('importation', 'chains', 'seeds', 'enables'),
    link('chains', 'outbreak', 'became', 'causes'),
  ],
};

/** A container whose magnitude lives entirely in its four children, alongside three receipted annual
 *  series and one qualitative link. The children span two orders of magnitude, so a breakdown that
 *  sizes on its own field rather than a children roll-up shows a parent smaller than its parts. */
const SOIL_SALINITY: WorldSpec = {
  title: 'Why is the irrigated block losing yield?',
  outcomeId: 'yield',
  provenance: {
    notes: [
      'Salt arrives from four sources and is only ever reported per source, never as a total.',
    ],
  },
  nodes: [
    container(
      'salt-input',
      'Salt delivered to the root zone',
      'root',
      0,
      'Salt load is reported by source, never as a single figure for the block.',
      {
        unit: 't/ha/yr',
        children: [
          measured(
            'salt-input.irrigation',
            'In the irrigation water',
            'root',
            0,
            4.2,
            't/ha/yr',
            'Salt in the irrigation water',
          ),
          measured(
            'salt-input.capillary',
            'Drawn up from the water table',
            'root',
            0,
            1.8,
            't/ha/yr',
            'Salt drawn up from below',
          ),
          measured(
            'salt-input.fertiliser',
            'From fertiliser',
            'root',
            0,
            0.35,
            't/ha/yr',
            'Salt from fertiliser',
          ),
          measured(
            'salt-input.rainfall',
            'From rainfall',
            'root',
            0,
            0.02,
            't/ha/yr',
            'Salt from rainfall',
          ),
        ],
      },
    ),
    measured(
      'water-table',
      'Depth to the water table',
      'root',
      0,
      1.2,
      'm',
      'Depth to the water table',
      {
        series: measuredSeries('Depth to the water table', 'm', [
          ['2019', 3.4],
          ['2020', 3],
          ['2021', 2.5],
          ['2022', 2],
          ['2023', 1.6],
          ['2024', 1.2],
        ]),
      },
    ),
    measured(
      'leaching',
      'Leaching fraction the scheme applies',
      'root',
      0,
      8,
      '%',
      'The leaching fraction',
    ),
    bare('capillary', 'Capillary rise now reaches the root zone', 'mechanism', 1),
    measured('ec', 'Root-zone salinity', 'mechanism', 2, 6.4, 'dS/m', 'Root-zone salinity', {
      series: measuredSeries('Root-zone salinity', 'dS/m', [
        ['2019', 2.1],
        ['2020', 2.8],
        ['2021', 3.6],
        ['2022', 4.5],
        ['2023', 5.4],
        ['2024', 6.4],
      ]),
    }),
    measured('yield', 'Wheat yield', 'outcome', 3, 2.1, 't/ha', 'Wheat yield', {
      series: measuredSeries('Wheat yield', 't/ha', [
        ['2019', 4.8],
        ['2020', 4.4],
        ['2021', 3.9],
        ['2022', 3.3],
        ['2023', 2.7],
        ['2024', 2.1],
      ]),
    }),
  ],
  edges: [
    weighed(
      'water-table',
      'capillary',
      'brings within reach of',
      'causes',
      0.6,
      'Capillary rise reaches the roots once the table is shallow.',
      -1,
    ),
    link('capillary', 'salt-input', 'adds to', 'contributes'),
    weighed(
      'salt-input',
      'ec',
      'accumulates as',
      'causes',
      0.7,
      'What is not leached stays behind.',
    ),
    weighed(
      'leaching',
      'ec',
      'flushes',
      'dampens',
      0.25,
      'Salinity falls where more water is applied.',
      -1,
    ),
    weighed(
      'ec',
      'yield',
      'depresses',
      'dampens',
      0.65,
      'Wheat yield falls above the salinity threshold.',
      -1,
    ),
  ],
};

/** A contested link plus a node no edge reaches. The contested claim is receipted for AND against,
 *  and the disconnected observation is a real logged record that has not been tied to anything —
 *  it must stay placed rather than drift, vanish, or land on top of a neighbour. */
const POLLINATOR_LOSSES: WorldSpec = {
  title: 'Why did the apiary lose so many colonies over winter?',
  outcomeId: 'winter-loss',
  provenance: {
    notes: ['One link carries evidence on both sides; one observation is logged but unattached.'],
  },
  nodes: [
    measured(
      'varroa',
      'Varroa load in the autumn samples',
      'root',
      0,
      6,
      'per 100',
      'The varroa load',
      on('2025-09'),
    ),
    measured(
      'neonic',
      'Neonicotinoid residue in stored pollen',
      'root',
      0,
      3.4,
      'ppb',
      'The residue',
      on('2025-08'),
    ),
    measured(
      'forage',
      'Continuous forage within flight range',
      'root',
      0,
      41,
      '%',
      'Forage cover',
      on('2025-03', '2025-09'),
    ),
    bare('queen', 'The autumn queen supersedure failed in six hives', 'root', 0, on('2025-09')),
    bare(
      'dwv',
      'Deformed wing virus rose in the winter bees',
      'mechanism',
      1,
      on('2025-11', '2026-01'),
    ),
    bare(
      'nutrition',
      'Winter bees went into the cold with poor fat bodies',
      'mechanism',
      1,
      on('2025-10', '2026-02'),
    ),
    measured(
      'hive-weight',
      'Scale-hive weight through the season',
      'mechanism',
      1,
      49,
      'kg',
      'Scale-hive weight',
      {
        ...on('2025-03', '2025-10'),
        detail: 'Logged the same season. Nothing yet ties the trend to the losses either way.',
        series: measuredSeries('Scale-hive weight', 'kg', [
          ['Mar', 42],
          ['Apr', 48],
          ['May', 61],
          ['Jun', 57],
          ['Jul', 49],
        ]),
      },
    ),
    measured(
      'winter-loss',
      'Colonies lost over winter',
      'outcome',
      2,
      38,
      '%',
      'Winter colony loss',
      on('2026-03'),
    ),
  ],
  edges: [
    weighed(
      'varroa',
      'dwv',
      'transmits',
      'causes',
      0.6,
      'Virus titre tracked mite load across the yard.',
    ),
    weighed(
      'dwv',
      'nutrition',
      'shortens',
      'causes',
      0.4,
      'Infected winter bees carried smaller fat bodies.',
    ),
    weighed(
      'neonic',
      'nutrition',
      'impairs',
      'contributes',
      0.2,
      'Colonies on treated forage foraged less per trip.',
      1,
      'Colony-level effects were not separable from mite load in the field trial.',
    ),
    weighed(
      'forage',
      'nutrition',
      'feeds',
      'dampens',
      0.35,
      'Yards with continuous forage wintered better.',
      -1,
    ),
    weighed(
      'nutrition',
      'winter-loss',
      'costs',
      'causes',
      0.7,
      'Losses concentrated in the poorly-provisioned hives.',
    ),
    link('queen', 'winter-loss', 'left broodless', 'contributes'),
  ],
};

/** Selection with a counter-pressure, over generations rather than years. The outcome series goes up
 *  and then comes back down, and one root points the other way — the honest picture of a trait that
 *  tracks the environment instead of ratcheting. */
const FINCH_BEAK: WorldSpec = {
  title: 'Why did the finches’ beaks get deeper after the drought?',
  outcomeId: 'beak-depth',
  provenance: {
    illustrative: true,
    notes: ['Magnitudes follow the published island record; treated as illustrative throughout.'],
  },
  nodes: [
    bare('drought', 'A drought year left only large, hard seeds', 'root', 0),
    sketched('heritable', 'Beak depth is strongly heritable', 'root', 0, 0.75, 'h²'),
    bare('rain-return', 'Wet years returned and small seeds came back', 'root', 0),
    sketched('seed-size', 'Mean seed hardness on the island', 'mechanism', 1, 1.9, 'index', {
      series: sketchedSeries('index', [
        ['1975', 1],
        ['1976', 1.1],
        ['1977', 1.9],
        ['1978', 1.7],
        ['1979', 1.4],
      ]),
    }),
    bare('small-beak-death', 'Small-beaked birds could not open what was left', 'mechanism', 2),
    sketched('survival', 'Survivors came from the large-beaked tail', 'mechanism', 3, 15, '%'),
    sketched('beak-depth', 'Mean beak depth in the next generation', 'outcome', 4, 10.1, 'mm', {
      series: sketchedSeries('mm', [
        ['1976', 9.4],
        ['1977', 9.5],
        ['1978', 10.1],
        ['1979', 10],
        ['1980', 9.9],
        ['1983', 9.6],
      ]),
    }),
  ],
  edges: [
    link('drought', 'seed-size', 'hardened', 'causes'),
    link('seed-size', 'small-beak-death', 'starved', 'causes'),
    link('small-beak-death', 'survival', 'filtered', 'causes'),
    link('heritable', 'beak-depth', 'passes on', 'enables'),
    link('survival', 'beak-depth', 'shifted', 'causes'),
    link('rain-return', 'beak-depth', 'pulled back', 'dampens', -1),
  ],
};

/** Exactly NODE_CAP top-level nodes — the boundary where one more node would be dropped by the
 *  coercer. Eight measured roots, four of them with series on a four-hour clock, feeding a chain
 *  that ends in a figure five orders of magnitude off the smallest one on the web. */
const WILDFIRE_RUN: WorldSpec = {
  title: 'Why did the fire run so far in one afternoon?',
  outcomeId: 'area',
  provenance: {
    notes: ['Sixteen nodes: the largest world the coercer will keep whole, at fire-weather scale.'],
  },
  nodes: [
    measured(
      'fuel-load',
      'Surface fuel load in the stand',
      'root',
      0,
      28,
      't/ha',
      'Surface fuel load',
    ),
    measured('fuel-moisture', 'Fine dead fuel moisture', 'root', 0, 4, '%', 'Fine fuel moisture', {
      ...on('2026-01-07T10:00Z', '2026-01-07T13:00Z'),
      series: measuredSeries('Fine fuel moisture', '%', [
        ['10:00', 9],
        ['12:00', 6],
        ['14:00', 4],
        ['16:00', 4],
      ]),
    }),
    measured(
      'drought-index',
      'Drought factor for the district',
      'root',
      0,
      9.8,
      'of 10',
      'The drought factor',
    ),
    measured('wind', 'Sustained wind at ten metres', 'root', 0, 47, 'km/h', 'Sustained wind', {
      ...on('2026-01-07T11:00Z', '2026-01-07T14:00Z'),
      series: measuredSeries('Sustained wind', 'km/h', [
        ['10:00', 21],
        ['12:00', 34],
        ['14:00', 43],
        ['16:00', 47],
      ]),
    }),
    measured('slope', 'Slope on the run-up face', 'root', 0, 22, 'deg', 'The slope'),
    measured(
      'temperature',
      'Air temperature',
      'root',
      0,
      41,
      '°C',
      'Air temperature',
      on('2026-01-07T12:00Z', '2026-01-07T15:00Z'),
    ),
    measured(
      'humidity',
      'Relative humidity',
      'root',
      0,
      8,
      '%',
      'Relative humidity',
      on('2026-01-07T12:00Z', '2026-01-07T15:00Z'),
    ),
    measured(
      'canopy',
      'Canopy base height across the stand',
      'root',
      0,
      2.1,
      'm',
      'Canopy base height',
    ),
    bare('ladder-fuels', 'Shrubs and bark connect the surface fuels to the canopy', 'mechanism', 1),
    bare(
      'preheating',
      'Flames lean into the fuel upslope and dry it ahead of the front',
      'mechanism',
      2,
      on('2026-01-07T12:20Z', '2026-01-07T13:10Z'),
    ),
    bare(
      'crown-fire',
      'The fire moves into the canopy and stays there',
      'mechanism',
      3,
      on('2026-01-07T13:10Z'),
    ),
    measured(
      'spotting',
      'Maximum spotting distance',
      'mechanism',
      4,
      1.8,
      'km',
      'Spotting distance',
      on('2026-01-07T13:30Z', '2026-01-07T15:30Z'),
    ),
    bare(
      'pyroconvection',
      'A convection column stands over the head of the fire',
      'mechanism',
      4,
      on('2026-01-07T13:40Z', '2026-01-07T16:30Z'),
    ),
    bare(
      'suppression',
      'Direct attack became unsafe and crews were withdrawn',
      'mechanism',
      5,
      on('2026-01-07T14:05Z'),
    ),
    measured(
      'spread-rate',
      'Head-fire rate of spread',
      'mechanism',
      5,
      4.6,
      'km/h',
      'Rate of spread',
      {
        ...on('2026-01-07T13:10Z', '2026-01-07T17:30Z'),
        series: measuredSeries('Rate of spread', 'km/h', [
          ['10:00', 0.4],
          ['12:00', 1.6],
          ['14:00', 3.1],
          ['16:00', 4.6],
        ]),
      },
    ),
    measured(
      'area',
      'Area burned by the end of the run',
      'outcome',
      6,
      18400,
      'ha',
      'Area burned',
      on('2026-01-08T01:40Z'),
    ),
  ],
  edges: [
    weighed(
      'fuel-moisture',
      'preheating',
      'primes',
      'causes',
      0.4,
      'Dry fine fuel ignites from radiant heat alone.',
      -1,
    ),
    link('temperature', 'fuel-moisture', 'dries', 'dampens', -1),
    link('humidity', 'fuel-moisture', 'holds up', 'causes'),
    link('drought-index', 'fuel-moisture', 'lowers', 'dampens', -1),
    link('fuel-load', 'preheating', 'feeds', 'contributes'),
    weighed(
      'slope',
      'preheating',
      'leans flames into',
      'causes',
      0.35,
      'Flames tilt toward the slope above them.',
    ),
    link('canopy', 'ladder-fuels', 'sits close above', 'enables'),
    link('ladder-fuels', 'crown-fire', 'carries fire up into', 'enables'),
    weighed(
      'preheating',
      'crown-fire',
      'ignites',
      'causes',
      0.55,
      'The canopy caught where the surface fire ran hottest.',
    ),
    weighed(
      'wind',
      'crown-fire',
      'drives',
      'causes',
      0.6,
      'The run followed the wind through the afternoon.',
    ),
    link('crown-fire', 'pyroconvection', 'builds', 'causes'),
    weighed(
      'crown-fire',
      'spotting',
      'throws embers from',
      'causes',
      0.5,
      'Embers landed well ahead of the main front.',
    ),
    link('pyroconvection', 'spotting', 'lofts', 'contributes'),
    weighed(
      'spotting',
      'spread-rate',
      'jumps',
      'causes',
      0.45,
      'New fires ahead of the front shortened every run.',
    ),
    weighed(
      'wind',
      'spread-rate',
      'pushes',
      'causes',
      0.4,
      'Rate of spread rose with the wind, hour by hour.',
    ),
    link('suppression', 'spread-rate', 'stopped limiting', 'enables'),
    link('crown-fire', 'suppression', 'forced back', 'causes'),
    weighed(
      'spread-rate',
      'area',
      'sweeps',
      'causes',
      0.8,
      'Area burned is the run rate carried over the afternoon.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Bodies, drugs and cells
 * ------------------------------------------------------------------ */

/** Nine depths, one figure. Everything on the way to the outcome is qualitative and the outcome
 *  alone carries a receipted number, so the chart has exactly one bar to draw and the shelf holds
 *  the other nine nodes — the opposite regime to a fully-seriesed world. */
const HEART_FAILURE: WorldSpec = {
  title: 'Why did the heart get weaker after the heart attack?',
  outcomeId: 'ef',
  provenance: { notes: ['A mechanism with a single measured endpoint at the end of it.'] },
  nodes: [
    bare('infarct', 'An infarct killed part of the ventricle wall', 'root', 0, on('2025-03-08')),
    bare(
      'scar',
      'Contractile muscle was replaced by scar',
      'mechanism',
      1,
      on('2025-03-08', '2025-05'),
    ),
    bare('stroke-volume', 'Each beat ejects less blood', 'mechanism', 2, on('2025-05')),
    bare(
      'baroreflex',
      'Baroreceptors read the lower output as low volume',
      'mechanism',
      3,
      on('2025-05'),
    ),
    bare(
      'sympathetic',
      'Sympathetic drive rises and stays up',
      'mechanism',
      4,
      on('2025-05', '2026-03'),
    ),
    bare(
      'raas',
      'The renin–angiotensin–aldosterone system switches on',
      'mechanism',
      4,
      on('2025-06', '2026-03'),
    ),
    bare(
      'afterload',
      'Vasoconstriction raises the pressure the ventricle works against',
      'mechanism',
      5,
      on('2025-08'),
    ),
    bare(
      'retention',
      'Salt and water are retained and preload climbs',
      'mechanism',
      5,
      on('2025-09'),
    ),
    bare('remodelling', 'The ventricle dilates and its wall thins', 'mechanism', 6, {
      ...on('2025-09', '2026-02'),
      detail:
        'The compensations that protected perfusion in the first week are what enlarge the chamber over the next year.',
    }),
    measured(
      'ef',
      'Ejection fraction at one year',
      'outcome',
      7,
      32,
      '%',
      'Ejection fraction',
      on('2026-03-08'),
    ),
  ],
  edges: [
    link('infarct', 'scar', 'replaces', 'causes'),
    link('scar', 'stroke-volume', 'reduces', 'causes', -1),
    link('stroke-volume', 'baroreflex', 'is read by', 'causes', -1),
    link('baroreflex', 'sympathetic', 'switches on', 'causes'),
    link('baroreflex', 'raas', 'switches on', 'causes'),
    link('sympathetic', 'afterload', 'raises', 'causes'),
    link('raas', 'retention', 'drives', 'causes'),
    link('afterload', 'remodelling', 'stretches', 'causes'),
    link('retention', 'remodelling', 'stretches', 'causes'),
    link('remodelling', 'ef', 'lowers', 'dampens', -1),
  ],
};

/** A drug interaction with the evidence split. One edge is receipted for and against at once, a
 *  container node holds the clearance breakdown its magnitude actually lives in, and the outcome is
 *  a single grounded number — so a card has to show a contested badge next to a confident figure. */
const WARFARIN_INR: WorldSpec = {
  title: 'Why did the INR jump after the antibiotic course?',
  outcomeId: 'inr',
  provenance: {
    notes: [
      'Route shares are textbook magnitudes carried on fixture receipts; one link is disputed.',
    ],
  },
  nodes: [
    bare(
      'antibiotic',
      'A five-day course of co-trimoxazole was started',
      'root',
      0,
      on('2026-06-01', '2026-06-05'),
    ),
    bare(
      'cyp2c9',
      'The main clearance enzyme for the active enantiomer is inhibited',
      'mechanism',
      1,
      on('2026-06-01', '2026-06-07'),
    ),
    bare('vitk', 'Gut flora make less vitamin K₂', 'mechanism', 1, on('2026-06-02', '2026-06-07')),
    container(
      'clearance',
      'How the dose is cleared',
      'mechanism',
      2,
      'Clearance is reported per route, not as a single figure for the dose.',
      {
        ...on('2026-06-01', '2026-06-07'),
        unit: '%',
        children: [
          measured('clearance.cyp2c9', 'Via CYP2C9', 'mechanism', 2, 62, '%', 'The CYP2C9 route'),
          measured('clearance.cyp3a4', 'Via CYP3A4', 'mechanism', 2, 21, '%', 'The CYP3A4 route'),
          measured('clearance.cyp1a2', 'Via CYP1A2', 'mechanism', 2, 11, '%', 'The CYP1A2 route'),
          measured(
            'clearance.renal',
            'Unchanged in urine',
            'mechanism',
            2,
            6,
            '%',
            'The renal route',
          ),
        ],
      },
    ),
    bare(
      'factors',
      'Vitamin K-dependent clotting factors fall further',
      'mechanism',
      3,
      on('2026-06-03', '2026-06-07'),
    ),
    measured(
      'inr',
      'INR at day seven',
      'outcome',
      4,
      6.1,
      'INR',
      'The INR at day seven',
      on('2026-06-07'),
    ),
  ],
  edges: [
    weighed(
      'antibiotic',
      'cyp2c9',
      'inhibits',
      'causes',
      0.6,
      'The sulfonamide component inhibits that enzyme.',
    ),
    weighed(
      'antibiotic',
      'vitk',
      'clears out',
      'causes',
      0.2,
      'A broad-spectrum course thins the menaquinone-producing flora.',
      1,
      'Dietary vitamin K1, not gut menaquinone, supplies most of the liver requirement.',
    ),
    link('cyp2c9', 'clearance', 'slows', 'dampens', -1),
    link('clearance', 'factors', 'prolongs exposure of', 'causes', -1),
    link('vitk', 'factors', 'starves', 'dampens', -1),
    weighed(
      'factors',
      'inr',
      'lengthens',
      'causes',
      0.8,
      'The INR lengthens as factor activity falls.',
    ),
  ],
};

/** Two nodes carry the SAME label at the same depth. Identity by exact id still resolves them, but
 *  the merge path's unique-label rescue has to refuse the ambiguity rather than guess — and the
 *  layout has to make two identically-titled cards distinguishable. Structure only, no numbers. */
const ANAPHYLAXIS: WorldSpec = {
  title: 'Why does an allergic reaction turn into shock so fast?',
  outcomeId: 'shock',
  provenance: {
    illustrative: true,
    notes: ['A mechanism with no numbers in it, and two nodes that legitimately share a name.'],
  },
  nodes: [
    bare(
      'ige',
      'IgE already bound to mast cells meets the allergen again',
      'root',
      0,
      on('2026-03-14T23:38Z'),
    ),
    bare(
      'crosslink',
      'Adjacent receptors are cross-linked',
      'mechanism',
      1,
      on('2026-03-14T23:39Z'),
    ),
    bare('skin-mast', 'Mast cells degranulate', 'mechanism', 2, {
      ...on('2026-03-14T23:41Z'),
      detail: 'In the dermis, where the wheal and flare appear first.',
    }),
    bare('airway-mast', 'Mast cells degranulate', 'mechanism', 2, {
      ...on('2026-03-14T23:42Z'),
      detail: 'In the bronchial mucosa, minutes later and with different consequences.',
    }),
    bare(
      'histamine',
      'Histamine and tryptase reach the circulation within minutes',
      'mechanism',
      3,
      on('2026-03-14T23:44Z', '2026-03-14T23:58Z'),
    ),
    bare(
      'leukotrienes',
      'Leukotrienes are synthesised on demand over the same minutes',
      'mechanism',
      3,
      on('2026-03-14T23:45Z', '2026-03-15T00:04Z'),
    ),
    bare(
      'vasodilation',
      'Capillaries dilate and leak plasma into the tissues',
      'mechanism',
      4,
      on('2026-03-14T23:52Z'),
    ),
    bare(
      'bronchoconstriction',
      'Airway smooth muscle contracts',
      'mechanism',
      4,
      on('2026-03-14T23:55Z'),
    ),
    bare('shock', 'Circulation collapses', 'outcome', 5, on('2026-03-15T00:06Z')),
  ],
  edges: [
    link('ige', 'crosslink', 'bridges', 'causes'),
    link('crosslink', 'skin-mast', 'triggers', 'causes'),
    link('crosslink', 'airway-mast', 'triggers', 'causes'),
    link('skin-mast', 'histamine', 'releases', 'causes'),
    link('airway-mast', 'histamine', 'releases', 'causes'),
    link('airway-mast', 'leukotrienes', 'makes', 'causes'),
    link('histamine', 'vasodilation', 'dilates', 'causes'),
    link('leukotrienes', 'bronchoconstriction', 'tightens', 'causes'),
    link('histamine', 'bronchoconstriction', 'tightens', 'contributes'),
    link('vasodilation', 'shock', 'empties', 'causes'),
    link('bronchoconstriction', 'shock', 'starves', 'contributes'),
  ],
};

/** An illustrative chain whose figures are speeds and durations rather than counts — minutes,
 *  millimetres per minute, hours — so the units axis is not shares and the sizing cannot lean on a
 *  common denominator. One node carries a long standing-context detail. */
const MIGRAINE_AURA: WorldSpec = {
  title: 'Why does the aura come before the headache?',
  outcomeId: 'headache',
  provenance: {
    illustrative: true,
    notes: ['Textbook rates and durations for cortical spreading depression, not one patient’s.'],
  },
  nodes: [
    bare('trigger', 'A trigger lowers the cortical threshold', 'root', 0, on('2026-04-02T21:40Z')),
    sketched(
      'csd',
      'A wave of depolarisation crosses the visual cortex',
      'mechanism',
      1,
      3,
      'mm/min',
      {
        ...on('2026-04-02T23:05Z'),
        detail:
          'The wave moves at about the speed the aura is reported to march across the visual field, which is why the two are taken to be the same event seen from inside and outside.',
      },
    ),
    sketched(
      'aura',
      'The aura marches across the visual field',
      'mechanism',
      2,
      20,
      'min',
      on('2026-04-02T23:07Z', '2026-04-02T23:27Z'),
    ),
    bare(
      'spillover',
      'Potassium and glutamate flood the extracellular space behind it',
      'mechanism',
      2,
      on('2026-04-02T23:10Z', '2026-04-02T23:50Z'),
    ),
    bare(
      'cgrp',
      'Trigeminal endings release CGRP onto the meningeal vessels',
      'mechanism',
      3,
      on('2026-04-02T23:40Z'),
    ),
    bare(
      'sensitisation',
      'Second-order neurons in the brainstem sensitise',
      'mechanism',
      4,
      on('2026-04-03T00:25Z'),
    ),
    bare(
      'allodynia',
      'Brushing the scalp starts to hurt',
      'mechanism',
      5,
      on('2026-04-03T01:10Z', '2026-04-03T04:30Z'),
    ),
    sketched(
      'headache',
      'The headache phase',
      'outcome',
      6,
      12,
      'h',
      on('2026-04-03T00:40Z', '2026-04-03T12:40Z'),
    ),
  ],
  edges: [
    link('trigger', 'csd', 'lowers the bar for', 'enables'),
    link('csd', 'aura', 'is seen as', 'causes'),
    link('csd', 'spillover', 'leaves behind', 'causes'),
    link('spillover', 'cgrp', 'provokes', 'causes'),
    link('aura', 'headache', 'precedes', 'correlates'),
    link('cgrp', 'sensitisation', 'sensitises', 'causes'),
    link('sensitisation', 'allodynia', 'shows as', 'causes'),
    link('sensitisation', 'headache', 'sustains', 'causes'),
    link('allodynia', 'headache', 'accompanies', 'correlates'),
  ],
};

/** Two illustrative series that disagree: performance keeps degrading while the self-report
 *  plateaus. Both are on the same world with the same time labels, so a chart that overlays series
 *  has to hold two different units and two different shapes at once. */
const SLEEP_DEBT: WorldSpec = {
  title: 'Why does short sleep stop feeling bad before it stops being bad?',
  outcomeId: 'lapses',
  provenance: {
    illustrative: true,
    notes: ['Illustrative curves at the shape sleep-restriction studies report, not one study.'],
  },
  nodes: [
    sketched('restriction', 'Six hours in bed, fourteen nights running', 'root', 0, 6, 'h/night'),
    bare('slow-wave', 'Deep slow-wave sleep is protected first', 'mechanism', 1),
    sketched('rem-loss', 'REM and late-cycle sleep take the cut', 'mechanism', 1, 45, '%'),
    bare('homeostatic', 'Sleep pressure no longer clears overnight', 'mechanism', 2),
    sketched('self-rating', 'Reported sleepiness', 'mechanism', 3, 7, 'of 9', {
      series: sketchedSeries('of 9', [
        ['night 1', 3],
        ['night 3', 5],
        ['night 5', 6],
        ['night 7', 6],
        ['night 9', 7],
        ['night 11', 7],
        ['night 14', 7],
      ]),
    }),
    sketched('lapses', 'Attentional lapses on a vigilance task', 'outcome', 3, 9, 'lapses', {
      series: sketchedSeries('lapses', [
        ['night 1', 1],
        ['night 3', 3],
        ['night 5', 5],
        ['night 7', 6],
        ['night 9', 7],
        ['night 11', 8],
        ['night 14', 9],
      ]),
    }),
  ],
  edges: [
    link('restriction', 'slow-wave', 'spares', 'dampens', -1),
    link('restriction', 'rem-loss', 'cuts', 'causes'),
    link('slow-wave', 'homeostatic', 'only partly clears', 'dampens', -1),
    link('rem-loss', 'homeostatic', 'leaves', 'causes'),
    link('homeostatic', 'lapses', 'shows as', 'causes'),
    link('homeostatic', 'self-rating', 'stops tracking', 'correlates'),
  ],
};

/** A container of energy sources feeding two tissue depots, both of which land on one mechanism —
 *  a diamond with a breakdown hanging off its root, plus a dampening root that has nothing to do
 *  with the chain above it. Series on two nodes, none on the rest. */
const INSULIN_RESISTANCE: WorldSpec = {
  title: 'Why did fasting insulin climb before the glucose did?',
  outcomeId: 'insulin',
  provenance: {
    notes: [
      'The surplus exists only as its logged sources; the mechanism between them is textbook.',
    ],
  },
  nodes: [
    container(
      'surplus',
      'Daily energy surplus',
      'root',
      0,
      'The surplus is logged per source in the diary, never as one daily total.',
      {
        unit: 'kcal',
        children: [
          measured(
            'surplus.drinks',
            'Sweetened drinks',
            'root',
            0,
            180,
            'kcal',
            'Sweetened drinks',
          ),
          measured('surplus.snacks', 'Evening snacks', 'root', 0, 240, 'kcal', 'Evening snacks'),
          measured(
            'surplus.portions',
            'Portion drift at dinner',
            'root',
            0,
            95,
            'kcal',
            'Portion drift',
          ),
        ],
      },
    ),
    measured('exercise', 'Moderate activity per week', 'root', 0, 40, 'min/wk', 'Weekly activity'),
    measured('liver-fat', 'Liver fat fraction', 'mechanism', 1, 14, '%', 'Liver fat fraction', {
      series: measuredSeries('Liver fat fraction', '%', [
        ['2021', 6],
        ['2022', 8],
        ['2023', 11],
        ['2024', 14],
      ]),
    }),
    measured(
      'muscle-lipid',
      'Lipid stored inside muscle fibres',
      'mechanism',
      1,
      3.1,
      '%',
      'Intramuscular lipid',
    ),
    bare('signalling', 'Lipid intermediates blunt the insulin receptor signal', 'mechanism', 2),
    bare(
      'glucose-output',
      'The liver no longer shuts off glucose output after a meal',
      'mechanism',
      3,
    ),
    measured('insulin', 'Fasting insulin', 'outcome', 4, 118, 'pmol/L', 'Fasting insulin', {
      series: measuredSeries('Fasting insulin', 'pmol/L', [
        ['2021', 61],
        ['2022', 78],
        ['2023', 96],
        ['2024', 118],
      ]),
    }),
  ],
  edges: [
    weighed(
      'surplus',
      'liver-fat',
      'is stored as',
      'causes',
      0.5,
      'Liver fat rose while the surplus persisted.',
    ),
    weighed(
      'surplus',
      'muscle-lipid',
      'is stored as',
      'causes',
      0.3,
      'Muscle lipid rose over the same period.',
    ),
    weighed(
      'exercise',
      'muscle-lipid',
      'burns off',
      'dampens',
      0.25,
      'Muscle lipid falls in the weeks with more training.',
      -1,
    ),
    link('liver-fat', 'signalling', 'blunts', 'causes'),
    link('muscle-lipid', 'signalling', 'blunts', 'causes'),
    link('signalling', 'glucose-output', 'releases', 'causes'),
    weighed(
      'glucose-output',
      'insulin',
      'is answered by',
      'causes',
      0.7,
      'Fasting insulin rises to hold glucose flat.',
    ),
  ],
};

/** Population-scale evidence where the attribution is genuinely disputed: the agricultural link is
 *  receipted on both sides, three nodes carry two-yearly series, and two roots have no figure at
 *  all. The dampening stewardship root arrives late in the record, which a naive trend line over
 *  the outcome series will not show. */
const ANTIBIOTIC_RESISTANCE: WorldSpec = {
  title: 'Why are more bloodstream infections resistant to first-line drugs?',
  outcomeId: 'bsi',
  provenance: {
    notes: ['Two-yearly surveillance figures; the farm-to-human link stays contested on purpose.'],
  },
  nodes: [
    measured(
      'prescribing',
      'Community prescribing',
      'root',
      0,
      620,
      'per 1,000',
      'Community prescribing',
    ),
    measured(
      'agriculture',
      'Antimicrobials sold for food-producing animals',
      'root',
      0,
      118,
      'mg/PCU',
      'Veterinary sales',
      {
        series: measuredSeries('Veterinary sales', 'mg/PCU', [
          ['2016', 156],
          ['2018', 138],
          ['2020', 127],
          ['2022', 118],
        ]),
      },
    ),
    bare('travel', 'Returning travellers bring resistant strains home', 'root', 0),
    bare('stewardship', 'A stewardship programme started on the wards', 'root', 0),
    bare('selection', 'Every course selects for whatever survives it', 'mechanism', 1),
    bare('plasmid', 'Resistance genes move between species on plasmids', 'mechanism', 1),
    measured(
      'carriage',
      'Carriage of resistant E. coli in the community',
      'mechanism',
      2,
      24,
      '%',
      'Community carriage',
      {
        series: measuredSeries('Community carriage', '%', [
          ['2016', 15],
          ['2018', 18],
          ['2020', 21],
          ['2022', 24],
        ]),
      },
    ),
    measured(
      'hygiene',
      'Hand hygiene compliance on the audited wards',
      'mechanism',
      2,
      71,
      '%',
      'Hand hygiene compliance',
    ),
    bare('transmission', 'Strains pass between patients on shared wards', 'mechanism', 3),
    measured('bsi', 'Resistant bloodstream isolates', 'outcome', 4, 17, '%', 'Resistant isolates', {
      series: measuredSeries('Resistant isolates', '%', [
        ['2016', 11],
        ['2018', 13],
        ['2020', 15],
        ['2022', 17],
      ]),
    }),
  ],
  edges: [
    weighed(
      'prescribing',
      'selection',
      'applies',
      'causes',
      0.55,
      'Carriage is highest where prescribing is highest.',
    ),
    weighed(
      'agriculture',
      'carriage',
      'seeds',
      'contributes',
      0.15,
      'The same plasmid families turn up in farm and human isolates.',
      1,
      'Whole-genome typing put the human isolates in lineages the farm samples never carried.',
    ),
    link('travel', 'carriage', 'imports into', 'contributes'),
    link('selection', 'plasmid', 'rewards', 'causes'),
    weighed(
      'selection',
      'carriage',
      'enriches',
      'causes',
      0.5,
      'Resistant carriage follows each course.',
    ),
    link('plasmid', 'carriage', 'spreads', 'causes'),
    weighed(
      'carriage',
      'transmission',
      'supplies',
      'causes',
      0.45,
      'Ward transmission starts from what patients already carry.',
    ),
    weighed(
      'hygiene',
      'transmission',
      'interrupts',
      'dampens',
      0.3,
      'Transmission fell on the wards that audited best.',
      -1,
    ),
    link('stewardship', 'prescribing', 'trims', 'dampens', -1),
    weighed(
      'transmission',
      'bsi',
      'becomes',
      'causes',
      0.6,
      'Resistant isolates track ward transmission.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Physics, chemistry and things that break
 * ------------------------------------------------------------------ */

/** A brightness curve in magnitudes, where the "best" value is the most NEGATIVE one and the series
 *  labels are days rather than dates. Anything that assumes bigger is better, or that a time label
 *  parses as a calendar date, is wrong on this world. */
const SUPERNOVA: WorldSpec = {
  title: 'Why does a massive star explode when its core turns to iron?',
  outcomeId: 'explosion',
  provenance: {
    illustrative: true,
    notes: ['Textbook core-collapse magnitudes; the light curve is a shape, not an observation.'],
  },
  nodes: [
    bare('iron-core', 'Fusion reaches iron and stops paying for itself', 'root', 0),
    sketched('limit', 'The core passes the electron-degeneracy limit', 'mechanism', 1, 1.4, 'M☉'),
    bare('photodisintegration', 'Gamma rays break iron nuclei back into helium', 'mechanism', 2),
    bare(
      'neutronisation',
      'Electron capture removes the pressure holding the core up',
      'mechanism',
      2,
    ),
    sketched('collapse', 'The core falls inward', 'mechanism', 3, 0.5, 's'),
    sketched('bounce', 'Nuclear matter stiffens and the infall bounces', 'mechanism', 4, 10, 'km'),
    sketched('neutrinos', 'Share of the energy that leaves as neutrinos', 'mechanism', 5, 99, '%'),
    sketched(
      'revival',
      'Share of that flux that revives the stalled shock',
      'mechanism',
      6,
      1,
      '%',
    ),
    sketched('explosion', 'Peak brightness of the ejected envelope', 'outcome', 7, -17.2, 'mag', {
      series: sketchedSeries('mag', [
        ['day 0', -14],
        ['day 10', -16.5],
        ['day 20', -17.2],
        ['day 40', -16.8],
        ['day 60', -16.2],
        ['day 100', -15.1],
        ['day 200', -13.4],
      ]),
    }),
  ],
  edges: [
    link('iron-core', 'photodisintegration', 'exposes to', 'causes'),
    link('iron-core', 'neutronisation', 'exposes to', 'causes'),
    link('limit', 'collapse', 'permits', 'enables'),
    link('photodisintegration', 'collapse', 'drains energy for', 'causes'),
    link('neutronisation', 'collapse', 'removes support for', 'causes'),
    link('collapse', 'bounce', 'ends in', 'causes'),
    link('bounce', 'neutrinos', 'radiates as', 'causes'),
    link('neutrinos', 'revival', 'partly heats', 'contributes'),
    link('revival', 'explosion', 'restarts', 'causes'),
  ],
};

/** Series whose time labels are elapsed minutes, not dates — the case where a chart cannot build a
 *  calendar scale from a history at all, while the NODES carry clock times and reach the timeline
 *  anyway. Nine depths, illustrative throughout, and every figure a rate or a threshold.
 *
 *  The runaway is a feedback loop, and it is written UNROLLED — the second turn of the loop
 *  (`heat-faster`) is its own node, the way edge-cases' feedback-loop and self-sustaining worlds
 *  write theirs. A literal ring (rate → heat-accum) is a world nothing can hold: the coercer cuts
 *  the back-edge to keep the web acyclic, so the spec would describe one thing and the product
 *  render another. Unrolled, the acceleration still reads as acceleration — it just arrives at a
 *  later node than the one it came from. */
const THERMAL_RUNAWAY: WorldSpec = {
  title: 'Why did the batch reactor run away after the cooling failed?',
  outcomeId: 'relief',
  provenance: {
    illustrative: true,
    notes: [
      'A textbook runaway on an elapsed-time axis; the numbers are shapes, not one batch.',
      'The half-hour is part of the sketch: one overnight batch, not a night anybody worked.',
    ],
  },
  nodes: [
    bare(
      'cooling-lost',
      'Cooling water is lost from the jacket',
      'root',
      0,
      on('2026-05-19T23:35Z'),
    ),
    bare(
      'heat-accum',
      'Reaction heat stops leaving the vessel',
      'mechanism',
      1,
      on('2026-05-19T23:35Z', '2026-05-19T23:50Z'),
    ),
    sketched('temp', 'Batch temperature', 'mechanism', 2, 168, '°C', {
      ...on('2026-05-19T23:40Z', '2026-05-20T00:00Z'),
      series: sketchedSeries('°C', [
        ['t+0 min', 82],
        ['t+5 min', 96],
        ['t+10 min', 118],
        ['t+15 min', 147],
        ['t+20 min', 168],
      ]),
    }),
    sketched(
      'rate',
      'The reaction rate roughly doubles for every ten degrees',
      'mechanism',
      3,
      2,
      '× / 10 K',
      on('2026-05-19T23:45Z', '2026-05-19T23:58Z'),
    ),
    bare(
      'heat-faster',
      'The accelerated reaction now puts heat in faster than the first pass did',
      'mechanism',
      4,
      on('2026-05-19T23:50Z', '2026-05-20T00:02Z'),
    ),
    bare(
      'onset',
      'A second, faster decomposition path opens above its onset temperature',
      'mechanism',
      5,
      on('2026-05-19T23:56Z'),
    ),
    bare(
      'gas',
      'Gas is produced faster than the vent line can pass it',
      'mechanism',
      6,
      on('2026-05-19T23:57Z', '2026-05-20T00:04Z'),
    ),
    sketched('pressure', 'Vessel pressure', 'mechanism', 7, 14, 'bar', {
      ...on('2026-05-19T23:40Z', '2026-05-20T00:00Z'),
      series: sketchedSeries('bar', [
        ['t+0 min', 1],
        ['t+5 min', 2],
        ['t+10 min', 4],
        ['t+15 min', 8],
        ['t+20 min', 14],
      ]),
    }),
    bare('relief', 'The relief path is overwhelmed', 'outcome', 8, on('2026-05-20T00:05Z')),
  ],
  edges: [
    link('cooling-lost', 'heat-accum', 'strands', 'causes'),
    link('heat-accum', 'temp', 'raises', 'causes'),
    link('temp', 'rate', 'accelerates', 'causes'),
    link('rate', 'heat-faster', 'adds to', 'contributes'),
    link('heat-faster', 'onset', 'drives past', 'causes'),
    link('onset', 'gas', 'generates', 'causes'),
    link('temp', 'gas', 'expands', 'contributes'),
    link('gas', 'pressure', 'raises', 'causes'),
    link('pressure', 'relief', 'exceeds', 'causes'),
  ],
};

/** A diamond, a T1 document world, and a node no edge reaches. The disconnected reading is a real
 *  trend from the same investigation that the strip-down never tied to the failed blade — so it has
 *  to be visible and unattached, not quietly wired to the nearest neighbour. */
const TURBINE_BLADE: WorldSpec = {
  title: 'Why did the turbine blade let go at speed?',
  outcomeId: 'rupture',
  provenance: {
    notes: [
      'Figures come off the uploaded failure investigation; one of them connects to nothing.',
    ],
  },
  nodes: [
    uploaded(
      'coating',
      'The thermal barrier coating spalled off one blade',
      'root',
      0,
      40,
      '%',
      'Coating loss over the aerofoil',
      7,
      on('2025-02', '2025-06'),
    ),
    uploaded(
      'hot-spot',
      'Metal temperature rose where the coating had gone',
      'mechanism',
      1,
      60,
      'K',
      'The local overtemperature',
      9,
      on('2025-03', '2025-09'),
    ),
    bare(
      'creep',
      'Creep strain accumulated through the aerofoil',
      'mechanism',
      2,
      on('2025-04', '2025-09'),
    ),
    bare(
      'oxidation',
      'Grain-boundary oxidation opened a path inward',
      'mechanism',
      2,
      on('2025-05', '2025-09'),
    ),
    bare('crack', 'A crack ran from the trailing edge', 'mechanism', 3, on('2025-08')),
    uploaded(
      'vibration',
      'Rotor vibration over the last two hundred hours',
      'mechanism',
      1,
      3.1,
      'mm/s',
      'Broadband vibration',
      22,
      {
        ...on('2025-09-20', '2025-09-28'),
        detail:
          'Logged over the same period. The strip-down did not tie it to the failed blade either way.',
      },
    ),
    bare('rupture', 'The blade separated at speed', 'outcome', 4, on('2025-09-28')),
  ],
  edges: [
    weighed(
      'coating',
      'hot-spot',
      'exposes',
      'causes',
      0.7,
      'The hot spot sits exactly where the coating had gone.',
    ),
    link('hot-spot', 'creep', 'accelerates', 'causes'),
    link('hot-spot', 'oxidation', 'accelerates', 'causes'),
    link('creep', 'crack', 'opens', 'causes'),
    link('oxidation', 'crack', 'opens', 'causes'),
    weighed(
      'crack',
      'rupture',
      'severs',
      'causes',
      0.9,
      'The fracture surface starts at the trailing-edge crack.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * The batch
 * ------------------------------------------------------------------ */

/**
 * The natural-science batch. Every id carries the `natural-` prefix so it can never collide with
 * another batch's, and the order runs smallest-and-plainest first, for the same reason the base
 * corpus does: a red seven-node world is far easier to reason about than a red sixteen-node one.
 */
export const NATURAL_SCIENCE_SCENARIOS: WorldScenario[] = [
  {
    id: 'natural-anaphylaxis',
    label: 'Duplicate labels, no numbers',
    note: 'Two nodes legitimately share a label: the merge path’s unique-label rescue must refuse the ambiguity rather than guess, and both cards must stay tellable apart.',
    spec: ANAPHYLAXIS,
  },
  {
    id: 'natural-heart-failure',
    label: 'Nine depths, one number',
    note: 'A long qualitative chain ending in the only grounded figure — the chart draws one bar and shelves the other nine nodes.',
    spec: HEART_FAILURE,
  },
  {
    id: 'natural-quake-liquefaction',
    label: 'Uploaded report (T1)',
    note: 'Figures read out of the user’s own document with page anchors, over a mechanism that carries none.',
    spec: QUAKE_LIQUEFACTION,
  },
  {
    id: 'natural-turbine-blade',
    label: 'Diamond plus an orphan',
    note: 'A T1 failure investigation whose two routes rejoin, with one logged reading that no edge reaches and must not be wired up for tidiness.',
    spec: TURBINE_BLADE,
  },
  {
    id: 'natural-migraine-aura',
    label: 'Rates and durations',
    note: 'Illustrative figures in mm/min, minutes and hours — no common denominator for a sizing pass to lean on.',
    spec: MIGRAINE_AURA,
  },
  {
    id: 'natural-warfarin-inr',
    label: 'Contested, with a breakdown',
    note: 'One link receipted for and against at once, next to a container whose magnitude lives in four children and a confidently grounded outcome.',
    spec: WARFARIN_INR,
  },
  {
    id: 'natural-caldera-unrest',
    label: 'Measured causes, unnumbered conclusion',
    note: 'Three receipted series feed a T0 outcome on purpose: the domain instruments its inputs and refuses to put a figure on its forecast.',
    spec: CALDERA_UNREST,
  },
  {
    id: 'natural-ocean-heat',
    label: 'Reinforcing and dampening together',
    note: 'A receipted annual world where one branch pushes the outcome the other way — a chart that assumes every contribution shares a sign gets it backwards.',
    spec: OCEAN_HEAT,
  },
  {
    id: 'natural-flash-flood',
    label: 'Hours, not years',
    note: 'Two receipted series on a clock-time axis: extent parsing, tick formatting and band widths all meet a six-hour world.',
    spec: FLASH_FLOOD,
  },
  {
    id: 'natural-supernova',
    label: 'Negative is brighter',
    note: 'A magnitude light curve whose best value is the most negative, on day-labelled points that never parse as calendar dates.',
    spec: SUPERNOVA,
  },
  {
    id: 'natural-thermal-runaway',
    label: 'Elapsed-time axis',
    note: 'Series labelled in elapsed minutes, so no calendar scale can be built from them — while the nodes carry clock times and place a feedback loop, unrolled, across one midnight.',
    spec: THERMAL_RUNAWAY,
  },
  {
    id: 'natural-sleep-debt',
    label: 'Two series that disagree',
    note: 'A self-report that plateaus while performance keeps sliding: two units, two shapes, one time axis.',
    spec: SLEEP_DEBT,
  },
  {
    id: 'natural-finch-beak',
    label: 'Up, then back down',
    note: 'A non-monotone outcome series with a counter-pressure root, so a first-to-last reading of the trend reports the opposite of the answer.',
    spec: FINCH_BEAK,
  },
  {
    id: 'natural-outbreak-measles',
    label: 'Epidemic curve',
    note: 'An illustrative series that rises, peaks and falls — a “latest value” summary reports the tail instead of the outbreak.',
    spec: OUTBREAK_MEASLES,
  },
  {
    id: 'natural-island-extinction',
    label: 'Wide fan, half numbered',
    note: 'Ten roots on one outcome with figures on only half of them: a century of dated arrivals on the timeline, nothing at all for the chart, and the standing traits held aside.',
    spec: ISLAND_EXTINCTION,
  },
  {
    id: 'natural-insulin-resistance',
    label: 'Breakdown into a diamond',
    note: 'A container of logged sources feeding two depots that rejoin, plus a dampening root off to the side and series on two nodes only.',
    spec: INSULIN_RESISTANCE,
  },
  {
    id: 'natural-soil-salinity',
    label: 'Container plus three series',
    note: 'A parent whose magnitude exists only as four children spanning two orders of magnitude — a breakdown that sizes on its own field draws the parent smaller than its parts.',
    spec: SOIL_SALINITY,
  },
  {
    id: 'natural-pollinator-losses',
    label: 'Contested plus an orphan',
    note: 'Evidence on both sides of one stressor and a scale-hive record attached to nothing — the two honesty affordances on one small world.',
    spec: POLLINATOR_LOSSES,
  },
  {
    id: 'natural-antibiotic-resistance',
    label: 'Surveillance, disputed attribution',
    note: 'Three two-yearly series, two unnumbered roots, and a farm-to-human link that stays contested — the regime where the picture is rich and the cause is not settled.',
    spec: ANTIBIOTIC_RESISTANCE,
  },
  {
    id: 'natural-ozone-hole',
    label: 'Ten depths, then recovery',
    note: 'A deep chain with one measured threshold in the middle and an outcome series that falls for fifteen years before turning back up.',
    spec: OZONE_HOLE,
  },
  {
    id: 'natural-wildfire-run',
    label: 'Exactly sixteen nodes',
    note: 'The coercer’s node cap on the nose: eight measured roots, four short clock-time series, and an outcome five orders of magnitude off the smallest figure on the web.',
    spec: WILDFIRE_RUN,
  },
];

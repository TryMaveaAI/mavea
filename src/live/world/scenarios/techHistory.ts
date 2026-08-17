// world/scenarios/techHistory.ts — the engineering-and-history batch of the scenario corpus:
// twenty-one WorldSpecs drawn from the domains a real conversation actually asks "why" about — an
// outage, a launch, a breach, a bridge, a war, a famine, a build that got slow. They exist for the
// same reason the rest of the corpus does: the surface ships with ONE world, and a layout, a
// renderer or a cascade that only holds up on that one is not finished.
//
// The two honesty rules the parent corpus states are obeyed here without exception:
//
//   1. A receipt's quote is BUILT FROM the value it grounds (`reading()`), so the coercer's
//      "the value's own digits must appear in its quote" gate can never be drifted out of by
//      editing one side of the pair. Every spec here survives `coerceWorldSpec(raw,
//      worldCorpus(spec))` — the gate a live turn passes through.
//   2. A tier says what actually backs a number. T1 is read off an uploaded document, T2 carries a
//      public receipt, T3 is a textbook magnitude and exists ONLY inside a world flagged
//      illustrative, and T0 is the no-number tier. Where this batch touches a real historical
//      episode — a Bronze Age collapse, a continental war, a plague, a famine — it either carries no
//      figure at all (T0) or is flagged illustrative and labels its indices as schematic. Nothing
//      here dresses a fabricated figure up as a measurement, and no real company, flight, incident
//      or state is named: the mechanisms are real and explainable, the arithmetic is nobody's data.
//
// The builders below are deliberate copies of the parent corpus's, which keeps them module-private.
// This batch is authored as a leaf file that imports nothing from its siblings; if the corpus grows
// a shared `scenarios/builders.ts`, this block is what should move into it.
import type { Receipt } from '../../ground/types';
import type { EdgeRelation } from '../../trust/relations';
import type { CausalRole } from '../../why/types';
import type { WorldScenario } from '../scenarios';
import type { WorldEdge, WorldNode, WorldSeries, WorldSpec } from '../types';
import { deriveEdgeStatus } from '../validate';

/** Where every quote in this batch is cited from. Named as what it is — a fixture — so nothing here
 *  can be mistaken for a real source if a scenario ever reaches a screen. */
const HOST = 'scenario corpus';

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
 * Operations — an outage, a launch, a breach, a database
 * ------------------------------------------------------------------ */

/** One root reaching the outcome down two routes that rejoin twice — a diamond over a T0/T1/T2 mix,
 *  with the only series hung on a mid-web mechanism rather than the outcome. */
const DATACENTRE_OUTAGE: WorldSpec = {
  title: 'Why was the region unavailable for four hours?',
  outcomeId: 'region-down',
  provenance: {
    notes: ['Two figures from the uploaded incident review, two public, the rest qualitative.'],
  },
  nodes: [
    bare('utility-dip', 'A voltage dip on the incoming utility feed', 'root', 0, {
      ...on('2026-02-17T23:58Z'),
      detail:
        'Seven cycles below tolerance — enough to drop the rectifiers, not enough to register as an outage upstream.',
    }),
    uploaded(
      'ups-ride',
      'The UPS ride-through ran out before the generators took load',
      'mechanism',
      1,
      42,
      's',
      'UPS ride-through',
      7,
      on('2026-02-17T23:58Z', '2026-02-18T00:04Z'),
    ),
    measured(
      'genset-fail',
      'Two of the four generator sets failed to pick up load',
      'mechanism',
      1,
      2,
      'sets',
      'Generator sets that failed to take load',
      on('2026-02-18T00:02Z'),
    ),
    bare(
      'pdu-drop',
      'Rack power distribution lost its input',
      'mechanism',
      2,
      on('2026-02-18T00:05Z'),
    ),
    bare(
      'chiller-stop',
      'The chilled-water plant stopped with the buses',
      'mechanism',
      2,
      on('2026-02-18T00:06Z'),
    ),
    measured(
      'hot-aisle',
      'Cold-aisle inlet temperature',
      'mechanism',
      3,
      38,
      '°C',
      'Cold-aisle inlet temperature',
      {
        ...on('2026-02-18T00:10Z', '2026-02-18T01:40Z'),
        series: measuredSeries('Cold-aisle inlet temperature', '°C', [
          ['00:10', 24],
          ['00:40', 29],
          ['01:10', 34],
          ['01:40', 38],
        ]),
      },
    ),
    bare(
      'thermal-trip',
      'Surviving racks shut down on inlet temperature',
      'mechanism',
      4,
      on('2026-02-18T00:52Z', '2026-02-18T01:35Z'),
    ),
    uploaded(
      'region-down',
      'Regional API unavailability',
      'outcome',
      5,
      247,
      'min',
      'Regional API unavailability',
      2,
      on('2026-02-18T00:05Z', '2026-02-18T04:12Z'),
    ),
  ],
  edges: [
    weighed(
      'utility-dip',
      'ups-ride',
      'drained',
      'causes',
      0.6,
      'The ride-through began at the dip.',
    ),
    weighed(
      'utility-dip',
      'genset-fail',
      'stalled',
      'causes',
      0.5,
      'Both sets failed on the same start attempt.',
    ),
    weighed(
      'ups-ride',
      'pdu-drop',
      'dropped',
      'causes',
      0.8,
      'Rack power ended when the ride-through did.',
    ),
    link('genset-fail', 'pdu-drop', 'left unbacked', 'causes'),
    link('genset-fail', 'chiller-stop', 'stopped', 'causes'),
    weighed(
      'chiller-stop',
      'hot-aisle',
      'heated',
      'causes',
      0.7,
      'Inlet temperature climbed once cooling stopped.',
    ),
    weighed(
      'hot-aisle',
      'thermal-trip',
      'tripped',
      'causes',
      0.65,
      'Racks shut down on their own inlet limit.',
    ),
    weighed(
      'pdu-drop',
      'region-down',
      'took offline',
      'causes',
      0.55,
      'Most of the fleet was already dark.',
    ),
    weighed(
      'thermal-trip',
      'region-down',
      'extended',
      'contributes',
      0.35,
      'Recovery waited for the halls to cool.',
    ),
  ],
};

/** Eight depths, one node each, wholly illustrative: the ribbon shape again but in a T3 regime, so
 *  the figures are textbook magnitudes and the series is uncaveated at point level. */
const ROCKET_UPPER_STAGE: WorldSpec = {
  title: 'Why did the upper stage fail to reach orbit?',
  outcomeId: 'no-orbit',
  provenance: {
    illustrative: true,
    notes: ['An illustrative loss-of-mission chain for a pressurisation fault — no flight’s data.'],
  },
  nodes: [
    bare('cold-soak', 'A long coast left the stage cold-soaked', 'root', 0),
    sketched('helium-leak', 'Pressurant leak rate', 'mechanism', 1, 0.4, 'kg/min', {
      detail: 'A seal that seats at ambient temperature can shrink open at coast temperatures.',
    }),
    bare('tank-press', 'Tank pressure fell below the pump inlet requirement', 'mechanism', 2),
    sketched('cavitation', 'Turbopump inlet margin', 'mechanism', 3, -0.2, 'bar'),
    sketched('thrust-drop', 'Chamber pressure against nominal', 'mechanism', 4, 61, '%', {
      series: sketchedSeries('%', [
        ['T+0', 100],
        ['T+60', 100],
        ['T+120', 97],
        ['T+180', 88],
        ['T+240', 61],
      ]),
    }),
    bare('long-burn', 'Guidance answered by extending the burn', 'mechanism', 5),
    bare('depletion', 'Propellant ran out before the target velocity', 'mechanism', 6),
    sketched('no-orbit', 'Velocity shortfall at cutoff', 'outcome', 7, 340, 'm/s'),
  ],
  edges: [
    link('cold-soak', 'helium-leak', 'opened', 'causes'),
    link('helium-leak', 'tank-press', 'bled off', 'causes'),
    link('tank-press', 'cavitation', 'starved', 'causes'),
    link('cavitation', 'thrust-drop', 'cut', 'causes'),
    link('thrust-drop', 'long-burn', 'forced', 'causes'),
    link('long-burn', 'depletion', 'emptied', 'causes'),
    link('depletion', 'no-orbit', 'ended', 'causes'),
  ],
};

/** A finding that sits on the board unlinked. The scanner count is real and recorded in the same
 *  week; nothing ties it to the intrusion in either direction, and pretending otherwise — in the
 *  data or in the layout — is the failure this scenario exists to catch. */
const BREACH_ORPHAN: WorldSpec = {
  title: 'Why did the customer records leak?',
  outcomeId: 'records-exfil',
  provenance: { notes: ['One recorded observation is not tied to the chain and stays unlinked.'] },
  nodes: [
    bare('phish', 'A contractor account was phished', 'root', 0, on('2026-04-06')),
    bare('no-mfa', 'That account had no second factor', 'root', 0),
    measured(
      'token-life',
      'Session token lifetime',
      'mechanism',
      1,
      720,
      'h',
      'Session token lifetime',
    ),
    bare(
      'lateral',
      'The session reached the internal admin console',
      'mechanism',
      2,
      on('2026-04-07'),
    ),
    measured(
      'export-job',
      'Rows pulled by the reporting export',
      'mechanism',
      3,
      2.1e6,
      'rows',
      'Rows pulled by the export',
      on('2026-04-08', '2026-04-09'),
    ),
    measured(
      'scanner-noise',
      'Open scanner findings that week',
      'mechanism',
      1,
      64,
      'findings',
      'Open scanner findings',
      {
        ...on('2026-04-06', '2026-04-12'),
        detail:
          'Recorded in the same week. Nothing has tied it to this intrusion in either direction.',
      },
    ),
    bare('records-exfil', 'Customer records left the network', 'outcome', 4, on('2026-04-09')),
  ],
  edges: [
    link('phish', 'lateral', 'handed over', 'enables'),
    weighed(
      'no-mfa',
      'lateral',
      'left open',
      'enables',
      0.5,
      'A stolen password was sufficient on its own.',
    ),
    weighed(
      'token-life',
      'lateral',
      'kept alive',
      'contributes',
      0.3,
      'The session outlived the contractor’s last shift by weeks.',
    ),
    link('lateral', 'export-job', 'ran', 'causes'),
    weighed(
      'export-job',
      'records-exfil',
      'carried out',
      'causes',
      0.8,
      'The export left by the path it was requested on.',
    ),
  ],
};

/** The batch's fully grounded world: every node figure carries a receipt whose quote holds its
 *  digits, every link is T2, weighted and receipted, and the outcome is measured — the only regime
 *  in which the engine may answer a what-if with an exact delta. */
const DB_COLLAPSE: WorldSpec = {
  title: 'Why did the checkout database fall over at noon?',
  outcomeId: 'p99',
  provenance: {
    notes: ['Every figure and every link is receipted — this world may answer exactly.'],
  },
  nodes: [
    uploaded(
      'index-dropped',
      'The migration dropped the covering index',
      'root',
      0,
      1,
      'index',
      'Indexes dropped by the migration',
      2,
      on('2026-05-14T22:40Z'),
    ),
    measured(
      'plan-flip',
      'Checkout queries taking the sequential plan',
      'root',
      0,
      100,
      '%',
      'Checkout queries taking the sequential plan',
      on('2026-05-15T11:30Z', '2026-05-15T12:20Z'),
    ),
    measured(
      'rows-scanned',
      'Rows read per checkout query',
      'mechanism',
      1,
      41000,
      'rows',
      'Rows read per checkout query',
      on('2026-05-15T11:30Z', '2026-05-15T12:20Z'),
    ),
    measured(
      'pool-wait',
      'Time spent waiting for a connection',
      'mechanism',
      2,
      3.4,
      's',
      'Connection-pool wait',
      on('2026-05-15T11:40Z', '2026-05-15T12:25Z'),
    ),
    measured('p99', 'Checkout p99 latency', 'outcome', 3, 18.6, 's', 'Checkout p99 latency', {
      ...on('2026-05-15T11:30Z', '2026-05-15T12:15Z'),
      series: measuredSeries('Checkout p99 latency', 's', [
        ['11:30', 0.42],
        ['11:45', 1.1],
        ['12:00', 6.8],
        ['12:15', 18.6],
      ]),
    }),
  ],
  edges: [
    weighed(
      'index-dropped',
      'plan-flip',
      'forced',
      'causes',
      0.9,
      'The plan changed on the same deploy.',
    ),
    weighed(
      'plan-flip',
      'rows-scanned',
      'multiplied',
      'causes',
      0.85,
      'Every checkout began reading the whole table.',
    ),
    weighed(
      'rows-scanned',
      'pool-wait',
      'held',
      'causes',
      0.7,
      'Long readers held their connections open.',
    ),
    weighed(
      'pool-wait',
      'p99',
      'stretched',
      'causes',
      0.8,
      'Requests spent their time waiting for a connection.',
    ),
    weighed(
      'index-dropped',
      'pool-wait',
      'lengthened',
      'contributes',
      0.2,
      'Vacuum work competed for the same pool.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Engineered things — a roof, an approach, a grid
 * ------------------------------------------------------------------ */

/** A design assumption is never one number, and the interesting one here is ZERO: the ponding
 *  allowance the roof was given. A container whose magnitude lives entirely in four children, next
 *  to the measured load that actually arrived. */
const ROOF_COLLAPSE: WorldSpec = {
  title: 'Why did the concourse roof come down?',
  outcomeId: 'roof-collapse',
  provenance: {
    notes: ['The design load exists only as its four parts, one of which is zero by design.'],
  },
  nodes: [
    container(
      'design-load',
      'Assumed roof load',
      'root',
      0,
      'The design load is recorded as its components and never as one governing total.',
      {
        ...on('1974'),
        unit: 'kN/m2',
        children: [
          measured('design-load.dead', 'Dead load', 'root', 0, 1.2, 'kN/m2', 'Dead load'),
          measured('design-load.snow', 'Snow load', 'root', 0, 0.75, 'kN/m2', 'Snow load'),
          measured('design-load.plant', 'Rooftop plant', 'root', 0, 0.4, 'kN/m2', 'Rooftop plant'),
          measured(
            'design-load.ponding',
            'Ponding allowance',
            'root',
            0,
            0,
            'kN/m2',
            'Ponding allowance',
          ),
        ],
      },
    ),
    bare(
      'drain-blocked',
      'The parapet drains were blocked with grit',
      'root',
      0,
      on('2025-11', '2026-01'),
    ),
    measured(
      'snow-event',
      'Snow depth on the roof',
      'mechanism',
      1,
      0.61,
      'm',
      'Snow depth',
      on('2026-01-12', '2026-01-15'),
    ),
    bare(
      'ponding',
      'Meltwater stood at the low point of the bay',
      'mechanism',
      1,
      on('2026-01-15', '2026-01-17'),
    ),
    measured(
      'actual-load',
      'Load carried by the failed bay',
      'mechanism',
      2,
      3.1,
      'kN/m2',
      'Load at the failed bay',
      on('2026-01-17'),
    ),
    bare(
      'connection',
      'The bolted connection at the truss shoe had no second path',
      'root',
      0,
      on('1974'),
    ),
    bare('roof-collapse', 'The bay came down', 'outcome', 3, on('2026-01-17')),
  ],
  edges: [
    link('design-load', 'actual-load', 'was exceeded by', 'contributes'),
    weighed(
      'snow-event',
      'actual-load',
      'added',
      'causes',
      0.5,
      'The bay failed during the thaw rather than the storm.',
    ),
    weighed(
      'drain-blocked',
      'ponding',
      'held',
      'causes',
      0.6,
      'Water stood where the drains should have taken it.',
    ),
    weighed(
      'ponding',
      'actual-load',
      'added',
      'causes',
      0.4,
      'Standing water is a load the roof was never given.',
    ),
    weighed(
      'actual-load',
      'roof-collapse',
      'overloaded',
      'causes',
      0.75,
      'The shoe tore at the most heavily loaded bay.',
    ),
    link('connection', 'roof-collapse', 'left nothing to catch', 'enables'),
  ],
};

/** The latent-condition lattice an incident report actually produces: three standing conditions,
 *  several active failures, every consequence with more than one parent, and exactly one number in
 *  the whole world. Nothing carries a series, so the chart has nothing to draw — but an approach is
 *  a sequence of minutes, and the nodes are timed to the minute, down to a duty day that began
 *  eleven hours before the touchdown it ends at. */
const RUNWAY_EXCURSION: WorldSpec = {
  title: 'Why did the approach end in a runway excursion?',
  outcomeId: 'excursion',
  provenance: { notes: ['A lattice of latent conditions; one public figure, everything else T0.'] },
  nodes: [
    bare(
      'late-descent',
      'Air traffic control kept the flight high until close in',
      'root',
      0,
      on('2026-09-03T23:31Z', '2026-09-03T23:44Z'),
    ),
    bare(
      'crew-fatigue',
      'The crew was on the last leg of a long duty day',
      'root',
      0,
      on('2026-09-03T13:10Z', '2026-09-03T23:53Z'),
    ),
    bare(
      'wet-runway',
      'The runway was wet and the last braking report was old',
      'root',
      0,
      on('2026-09-03T22:10Z', '2026-09-03T23:53Z'),
    ),
    bare(
      'unstable',
      'The approach stayed above the stabilisation gate',
      'mechanism',
      1,
      on('2026-09-03T23:44Z', '2026-09-03T23:50Z'),
    ),
    bare(
      'no-goaround',
      'Neither pilot called the go-around',
      'mechanism',
      1,
      on('2026-09-03T23:48Z'),
    ),
    measured(
      'touchdown',
      'Touchdown point beyond the aiming markers',
      'mechanism',
      2,
      610,
      'm',
      'Touchdown point beyond the markers',
      on('2026-09-03T23:51Z'),
    ),
    bare(
      'late-reverse',
      'Reverse thrust was selected late',
      'mechanism',
      2,
      on('2026-09-03T23:52Z'),
    ),
    bare(
      'hydroplane',
      'The wheels did not spin up on the wet surface',
      'mechanism',
      2,
      on('2026-09-03T23:51Z', '2026-09-03T23:53Z'),
    ),
    bare('excursion', 'The aircraft left the paved surface', 'outcome', 3, on('2026-09-03T23:53Z')),
  ],
  edges: [
    link('late-descent', 'unstable', 'left high', 'causes'),
    link('crew-fatigue', 'no-goaround', 'narrowed', 'contributes'),
    link('unstable', 'no-goaround', 'went unchallenged', 'contributes'),
    link('unstable', 'touchdown', 'lengthened', 'causes'),
    link('no-goaround', 'touchdown', 'allowed', 'enables'),
    link('crew-fatigue', 'late-reverse', 'delayed', 'contributes'),
    link('wet-runway', 'hydroplane', 'wetted', 'causes'),
    link('touchdown', 'excursion', 'shortened', 'causes'),
    link('late-reverse', 'excursion', 'reduced braking on', 'contributes'),
    link('hydroplane', 'excursion', 'lengthened', 'causes'),
  ],
};

/** An hourglass: five standing conditions squeeze through ONE bottleneck and fan out again. Two
 *  nodes carry receipted series on quite different time bases — years on one, seconds on the other
 *  — which is the honest shape of a grid event and a hard case for a shared time axis. */
const GRID_CASCADE: WorldSpec = {
  title: 'Why did one interconnector trip shed load across half the country?',
  outcomeId: 'load-shed',
  provenance: { notes: ['Two receipted series on different time bases — years, and seconds.'] },
  nodes: [
    bare('low-inertia', 'Overnight the system ran on few synchronous machines', 'root', 0),
    measured(
      'import-share',
      'Share of demand met by import',
      'root',
      0,
      34,
      '%',
      'Share of demand met by import',
      {
        series: measuredSeries('Share of demand met by import', '%', [
          ['2019', 12],
          ['2021', 21],
          ['2023', 29],
          ['2025', 34],
        ]),
      },
    ),
    bare('maintenance', 'One of the two interconnector poles was out for work', 'root', 0),
    bare('weak-fault', 'A fault on the remaining pole cleared slowly', 'root', 0),
    bare('gas-ramp', 'The reserve gas plant could not ramp inside the window', 'root', 0),
    measured(
      'import-lost',
      'Import lost at the trip',
      'mechanism',
      1,
      1400,
      'MW',
      'Import lost at the trip',
    ),
    measured(
      'rocof',
      'Rate of change of frequency',
      'mechanism',
      2,
      0.42,
      'Hz/s',
      'Rate of change of frequency',
    ),
    bare('embedded-trip', 'Embedded generation tripped on its own protection', 'mechanism', 3),
    measured('freq-nadir', 'Frequency nadir', 'mechanism', 4, 48.8, 'Hz', 'Frequency nadir', {
      series: measuredSeries('Frequency nadir', 'Hz', [
        ['t+0 s', 50],
        ['t+2 s', 49.4],
        ['t+5 s', 48.8],
        ['t+30 s', 49.6],
      ]),
    }),
    bare('load-shed', 'Automatic low-frequency load shedding fired', 'outcome', 5),
  ],
  edges: [
    weighed(
      'maintenance',
      'import-lost',
      'halved',
      'contributes',
      0.4,
      'Only one pole was carrying the import.',
    ),
    weighed(
      'weak-fault',
      'import-lost',
      'tripped',
      'causes',
      0.7,
      'The remaining pole cleared to a fault.',
    ),
    weighed(
      'import-share',
      'import-lost',
      'sized',
      'contributes',
      0.5,
      'The loss was as large as the import had grown.',
    ),
    weighed(
      'import-lost',
      'rocof',
      'steepened',
      'causes',
      0.65,
      'Frequency fell fastest at the instant of the loss.',
    ),
    weighed(
      'low-inertia',
      'rocof',
      'steepened',
      'contributes',
      0.55,
      'The same loss moves frequency further on a light system.',
    ),
    link('rocof', 'embedded-trip', 'tripped', 'causes'),
    weighed(
      'embedded-trip',
      'freq-nadir',
      'deepened',
      'dampens',
      0.45,
      'Each block of embedded loss pushed the nadir lower.',
      -1,
    ),
    link('gas-ramp', 'freq-nadir', 'failed to arrest', 'dampens', -1),
    weighed('rocof', 'freq-nadir', 'drove', 'causes', 0.6, 'The nadir followed the slope.', -1),
    link('freq-nadir', 'load-shed', 'triggered', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * History — a collapse, a war, a treaty, a plague, an engine, a famine, a discovery
 * ------------------------------------------------------------------ */

/** A historiographical world: several standing explanations, one of which the literature disputes,
 *  so the edge carries a receipt for AND against. The only figure is an explicitly schematic index,
 *  which is what an illustrative history world is allowed to hold.
 *
 *  It is the corpus's one world that is undated because it CANNOT be dated: everything here happens
 *  before the era, and `parseWorldTime` has no BC vocabulary — "1200 BC" is prose to it. The ISO
 *  extended form the parser would take (`-001200-01-01`) is off by one for every BC year (ISO year
 *  0 is 1 BC), it is not how any source writes a date, and the axis would label it "-1200" anyway.
 *  A silently-shifted century is worse than a held-aside card, so this world states the limit and
 *  keeps the disabled chip. */
const BRONZE_AGE: WorldSpec = {
  title: 'Why did the Late Bronze Age palace system collapse?',
  outcomeId: 'palace-end',
  provenance: {
    illustrative: true,
    notes: [
      'An illustrative synthesis of the standard explanations, not a measurement of any site.',
      'One link is disputed in the literature and is shown contested rather than resolved.',
    ],
  },
  nodes: [
    bare('drought', 'A multi-decade drought across the eastern Mediterranean', 'root', 0),
    bare('quakes', 'A run of earthquakes along the same fault systems', 'root', 0),
    bare('sea-peoples', 'Displaced groups moved along the coast', 'root', 0),
    bare('tin-routes', 'The long tin route from the east was interrupted', 'root', 0),
    bare('harvest', 'Palace grain stores could not be refilled', 'mechanism', 1),
    bare('bronze-short', 'Bronze working slowed for want of tin', 'mechanism', 1),
    bare('redistribution', 'The palace lost its hold on redistribution', 'mechanism', 2),
    bare('scribes', 'The scribal administration stopped being kept up', 'mechanism', 3),
    sketched('archive', 'Palace archive activity, schematic index', 'mechanism', 3, 20, 'index', {
      series: sketchedSeries('index', [
        ['1300 BC', 100],
        ['1250 BC', 95],
        ['1200 BC', 60],
        ['1150 BC', 20],
      ]),
      detail:
        'A schematic index, drawn to show the shape of the decline rather than any excavated count.',
    }),
    bare('palace-end', 'The palace centres were abandoned', 'outcome', 4),
  ],
  edges: [
    link('drought', 'harvest', 'failed', 'causes'),
    link('quakes', 'redistribution', 'damaged', 'contributes'),
    weighed(
      'sea-peoples',
      'redistribution',
      'cut',
      'dampens',
      0.4,
      'The coastal routes stopped carrying what the palaces lived on.',
      -1,
      'Several centres fell before any recorded coastal raid reached them.',
    ),
    link('tin-routes', 'bronze-short', 'starved', 'causes'),
    link('harvest', 'redistribution', 'emptied', 'causes'),
    link('bronze-short', 'redistribution', 'weakened', 'contributes'),
    link('redistribution', 'scribes', 'ended', 'causes'),
    link('redistribution', 'archive', 'ended', 'causes'),
    link('scribes', 'palace-end', 'preceded', 'correlates'),
    link('archive', 'palace-end', 'marks', 'correlates'),
  ],
};

/** Twelve nodes, fourteen links, and not one number: the honest tier regime for a question about
 *  why a war began. Dense enough that most nodes have two parents, and with no series anywhere the
 *  chart must shelf the whole world and say so. The crisis itself is dated to the day — the five
 *  weeks are the whole point of the question — while the four structural preconditions behind it
 *  are not: an alliance bloc and a war plan were standing facts, not events, and the axis would
 *  have to reach back decades to place them, squeezing July into one column. */
const JULY_CRISIS: WorldSpec = {
  title: 'Why did a regional assassination become a continental war?',
  outcomeId: 'general-war',
  provenance: {
    notes: ['Structure only: no figure anywhere, and every link asserted rather than measured.'],
  },
  nodes: [
    bare('alliances', 'Two alliance blocs had committed to each other in advance', 'root', 0),
    bare('war-plans', 'The war plans depended on mobilising first', 'root', 0),
    bare('naval-race', 'A naval building race had hardened opinion at home', 'root', 0),
    bare('balkan-rivalry', 'Two empires were competing over the same Balkan ground', 'root', 0),
    bare('assassination', 'The heir to one throne was assassinated', 'root', 0, on('1914-06-28')),
    bare(
      'backing',
      'One capital promised another unconditional backing',
      'mechanism',
      1,
      on('1914-07-06'),
    ),
    bare('ultimatum', 'An ultimatum was written to be refused', 'mechanism', 2, on('1914-07-23')),
    bare('local-war', 'A local war was declared', 'mechanism', 3, on('1914-07-28')),
    bare(
      'partial-mob',
      'A partial mobilisation was ordered, then widened',
      'mechanism',
      4,
      on('1914-07-29', '1914-07-31'),
    ),
    bare(
      'timetables',
      'Mobilisation timetables left no room to wait',
      'mechanism',
      5,
      on('1914-07-31', '1914-08-01'),
    ),
    bare(
      'second-note',
      'A second ultimatum expired unanswered',
      'mechanism',
      5,
      on('1914-07-31', '1914-08-01'),
    ),
    bare('general-war', 'The great powers were at war', 'outcome', 6, on('1914-08-04')),
  ],
  edges: [
    link('assassination', 'backing', 'prompted', 'causes'),
    link('balkan-rivalry', 'backing', 'shaped', 'contributes'),
    link('backing', 'ultimatum', 'emboldened', 'enables'),
    link('balkan-rivalry', 'ultimatum', 'framed', 'contributes'),
    link('ultimatum', 'local-war', 'led to', 'causes'),
    link('local-war', 'partial-mob', 'triggered', 'causes'),
    link('alliances', 'partial-mob', 'obliged', 'contributes'),
    link('war-plans', 'timetables', 'set', 'causes'),
    link('partial-mob', 'timetables', 'started', 'causes'),
    link('timetables', 'second-note', 'forced', 'causes'),
    link('naval-race', 'general-war', 'hardened', 'contributes'),
    link('alliances', 'general-war', 'widened', 'causes'),
    link('timetables', 'general-war', 'outran diplomacy on', 'causes'),
    link('second-note', 'general-war', 'ended', 'causes'),
  ],
};

/** TWO contested edges on one web — evidence for and against each — with a single qualitative link
 *  keeping the exact ladder shut and a T0 outcome carrying no figure at all. */
const TREATY_COLLAPSE: WorldSpec = {
  title: 'Why did the fishing quota treaty collapse?',
  outcomeId: 'treaty-lapsed',
  provenance: {
    notes: ['Two links are receipted on both sides; the outcome itself carries no figure.'],
  },
  nodes: [
    measured(
      'quota-key',
      'Share of the quota still set by the original key',
      'root',
      0,
      46,
      '%',
      'Share still set by the original key',
      on('1996', '2014'),
    ),
    bare(
      'stock-moved',
      'The stock shifted north out of one party’s waters',
      'root',
      0,
      on('2007', '2016'),
    ),
    measured(
      'new-entrant',
      'Catch taken by a party outside the agreement',
      'root',
      0,
      180,
      'kt',
      'Catch taken outside the agreement',
      on('2012', '2018'),
    ),
    bare('no-arbiter', 'The treaty had no binding dispute procedure', 'root', 0),
    measured(
      'overshoot',
      'Total catch above the agreed ceiling',
      'mechanism',
      1,
      31,
      '%',
      'Catch above the agreed ceiling',
      on('2013', '2018'),
    ),
    bare(
      'unilateral',
      'Two parties began setting their own quotas',
      'mechanism',
      2,
      on('2015', '2019'),
    ),
    bare('treaty-lapsed', 'The agreement lapsed without renewal', 'outcome', 3, on('2019')),
  ],
  edges: [
    weighed(
      'stock-moved',
      'unilateral',
      'undermined',
      'causes',
      0.5,
      'The party whose share moved north set its own number first.',
      1,
      'That party had already raised its quota in the years before the stock moved.',
    ),
    weighed(
      'quota-key',
      'unilateral',
      'froze',
      'contributes',
      0.4,
      'The allocation key was never reopened.',
      1,
      'The key was reopened once, and the parties left it where it was.',
    ),
    weighed(
      'new-entrant',
      'overshoot',
      'added',
      'causes',
      0.45,
      'The catch taken outside the agreement is the part above the ceiling.',
    ),
    link('no-arbiter', 'unilateral', 'left unchecked', 'enables'),
    weighed(
      'unilateral',
      'overshoot',
      'raised',
      'causes',
      0.5,
      'The ceiling was passed once the quotas were set separately.',
    ),
    weighed(
      'overshoot',
      'treaty-lapsed',
      'discredited',
      'causes',
      0.55,
      'Parties left an agreement that no longer bound the catch.',
    ),
  ],
};

/** An illustrative spread mechanism whose one series is dated in centuries-old calendar years —
 *  a time axis nothing else in the corpus produces, and a shape a naive year parser mishandles. */
const PLAGUE_SPREAD: WorldSpec = {
  title: 'Why did the plague reach the far end of the trade network?',
  outcomeId: 'reach',
  provenance: {
    illustrative: true,
    notes: ['An illustrative spread mechanism; the index is schematic, the dates are calendar.'],
  },
  nodes: [
    bare('caravan', 'Grain and furs moved along a continuous caravan route', 'root', 0),
    bare('ports', 'Ports handled ships without any quarantine', 'root', 0),
    sketched('voyage', 'Typical voyage between the main ports', 'mechanism', 1, 30, 'days', {
      detail: 'Long enough for a ship to arrive with the outbreak still aboard.',
    }),
    sketched('overland', 'Overland spread along the roads', 'mechanism', 1, 4, 'km/day'),
    bare('rats-fleas', 'Ship rats carried infected fleas ashore', 'mechanism', 2),
    bare('density', 'Dense towns shared water and had nowhere to isolate', 'mechanism', 3),
    sketched('reach', 'Towns on the network reporting the outbreak', 'outcome', 4, 80, '%', {
      series: sketchedSeries('%', [
        ['1347', 5],
        ['1348', 35],
        ['1349', 65],
        ['1350', 80],
      ]),
      detail: 'A schematic share, drawn to show the pace of the spread rather than any register.',
    }),
  ],
  edges: [
    link('caravan', 'overland', 'carried', 'causes'),
    link('ports', 'voyage', 'allowed', 'enables'),
    link('voyage', 'rats-fleas', 'delivered', 'causes'),
    link('rats-fleas', 'density', 'met', 'contributes'),
    link('overland', 'density', 'reached', 'causes'),
    link('density', 'reach', 'multiplied', 'causes'),
    link('rats-fleas', 'reach', 'seeded', 'causes'),
  ],
};

/** A T0 parent whose magnitude lives ENTIRELY in four illustrative children — the container case
 *  again, but in a world with no receipts anywhere, which is a different code path from the
 *  receipted container the aquifer world exercises. */
const STEAM_POWER: WorldSpec = {
  title: 'Why did steam power spread through industry?',
  outcomeId: 'steam-share',
  provenance: {
    illustrative: true,
    notes: [
      'Textbook magnitudes for a well-understood transition — the shape, not a historical series.',
    ],
  },
  nodes: [
    bare('coal-cost', 'Coal at the pithead was cheap where the engines were built', 'root', 0),
    bare('mine-water', 'Deep mines flooded faster than horses could lift the water', 'root', 0),
    bare('boring', 'Cylinder boring became accurate enough to hold steam', 'root', 0),
    sketched(
      'condenser',
      'Coal burned per unit of work after the separate condenser',
      'mechanism',
      1,
      -70,
      '%',
    ),
    bare('rotative', 'Rotative motion let engines drive machinery, not only pumps', 'mechanism', 2),
    bare('siting', 'Mills could be sited away from the fast rivers', 'mechanism', 3),
    bare('capacity', 'Installed steam capacity by sector', 'mechanism', 3, {
      detail: 'Recorded sector by sector; the total is a modern reconstruction, not a return.',
      children: [
        sketched('capacity.textiles', 'Textiles', 'mechanism', 3, 340, 'khp'),
        sketched('capacity.mining', 'Mining', 'mechanism', 3, 210, 'khp'),
        sketched('capacity.iron', 'Iron and metal', 'mechanism', 3, 150, 'khp'),
        sketched('capacity.transport', 'Transport', 'mechanism', 3, 90, 'khp'),
      ],
    }),
    sketched('steam-share', 'Share of industrial power from steam', 'outcome', 4, 80, '%', {
      series: sketchedSeries('%', [
        ['1760', 5],
        ['1800', 20],
        ['1840', 55],
        ['1870', 80],
      ]),
    }),
  ],
  edges: [
    link('mine-water', 'condenser', 'paid for', 'enables'),
    link('boring', 'condenser', 'made possible', 'enables'),
    link('coal-cost', 'condenser', 'tolerated', 'contributes'),
    link('condenser', 'rotative', 'freed', 'causes'),
    link('rotative', 'siting', 'released', 'causes'),
    link('rotative', 'capacity', 'filled', 'causes'),
    link('siting', 'capacity', 'spread', 'contributes'),
    link('capacity', 'steam-share', 'accumulated into', 'causes'),
    link('coal-cost', 'steam-share', 'sustained', 'contributes'),
  ],
};

/** Why a harvest failure becomes a famine — the entitlement mechanism, with a relief programme as
 *  the one dampening cause and NO figure on the outcome, because a mortality number here would be
 *  exactly the fabricated precision this corpus exists to refuse. */
const FAMINE: WorldSpec = {
  title: 'Why did a crop failure turn into a famine?',
  outcomeId: 'famine',
  provenance: {
    illustrative: true,
    notes: [
      'The mechanism by which a harvest failure becomes a famine — illustrative, not one country’s record.',
      'The outcome carries no figure: a mortality number would be invented precision.',
    ],
  },
  nodes: [
    bare(
      'blight',
      'A single clonal variety failed to a new pathogen',
      'root',
      0,
      on('1845-08', '1846-10'),
    ),
    bare('tenancy', 'Most households worked land they did not hold', 'root', 0),
    bare(
      'exports',
      'Grain kept leaving the region under standing contracts',
      'root',
      0,
      on('1845-09', '1847-06'),
    ),
    sketched(
      'price',
      'Staple price against the season before',
      'mechanism',
      1,
      320,
      '%',
      on('1845-10', '1847-06'),
    ),
    bare('no-substitute', 'No cheap substitute staple was within reach', 'mechanism', 1),
    sketched(
      'relief',
      'Relief wage against the staple price',
      'mechanism',
      2,
      40,
      '%',
      on('1846-03', '1847-09'),
    ),
    bare(
      'entitlement',
      'Households could no longer buy the food that was there',
      'mechanism',
      2,
      on('1846-01', '1848-06'),
    ),
    bare('famine', 'Mortality rose across the region', 'outcome', 3, on('1846-09', '1849-06')),
  ],
  edges: [
    link('blight', 'price', 'removed', 'causes'),
    link('exports', 'price', 'tightened', 'contributes'),
    link('tenancy', 'entitlement', 'left exposed', 'contributes'),
    link('price', 'entitlement', 'priced out', 'causes'),
    link('no-substitute', 'entitlement', 'narrowed', 'contributes'),
    link('relief', 'entitlement', 'offset part of', 'dampens', -1),
    link('entitlement', 'famine', 'starved', 'causes'),
    link('exports', 'famine', 'drained', 'contributes'),
  ],
};

/** Four roots injecting at four different depths of one long chain: the discovery is at the top,
 *  the missing chemist and the war are conditions that land in the middle. A shape neither a pure
 *  chain nor a fan, and the case where a layout that columns by role rather than depth goes wrong. */
const ANTIBIOTIC_PATH: WorldSpec = {
  title: 'Why did the first antibiotic take sixteen years to reach patients?',
  outcomeId: 'clinical-use',
  provenance: {
    illustrative: true,
    notes: ['The path a laboratory observation takes to a treatment; the index is schematic.'],
  },
  nodes: [
    bare('contamination', 'A culture plate was left contaminated over a holiday', 'root', 0),
    bare('unstable', 'The active substance was unstable and hard to keep', 'root', 0),
    bare('no-chemist', 'The first laboratory had no chemist to purify it', 'root', 0),
    bare('war-demand', 'Wartime demand made scale-up a priority', 'root', 0),
    bare('inhibition', 'A clear zone appeared around the mould', 'mechanism', 1),
    bare('freeze-dry', 'Freeze-drying gave a stable, concentrated powder', 'mechanism', 2),
    bare('mouse-trial', 'A single night’s animal trial settled the question', 'mechanism', 3),
    bare('deep-tank', 'Deep-tank fermentation replaced surface culture', 'mechanism', 4),
    sketched('yield', 'Yield per litre of broth, schematic index', 'mechanism', 5, 100, 'index', {
      series: sketchedSeries('index', [
        ['1928', 1],
        ['1940', 4],
        ['1943', 30],
        ['1945', 100],
      ]),
      detail: 'A schematic index of the scale-up, drawn to show its shape rather than any figures.',
    }),
    bare('clinical-use', 'Enough drug existed to treat patients routinely', 'outcome', 6),
  ],
  edges: [
    link('contamination', 'inhibition', 'revealed', 'causes'),
    link('inhibition', 'freeze-dry', 'motivated', 'contributes'),
    link('unstable', 'freeze-dry', 'demanded', 'causes'),
    link('no-chemist', 'freeze-dry', 'delayed', 'dampens', -1),
    link('freeze-dry', 'mouse-trial', 'made possible', 'enables'),
    link('mouse-trial', 'deep-tank', 'justified', 'causes'),
    link('war-demand', 'deep-tank', 'funded', 'enables'),
    link('deep-tank', 'yield', 'multiplied', 'causes'),
    link('yield', 'clinical-use', 'supplied', 'causes'),
    link('mouse-trial', 'clinical-use', 'proved', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Institutions and systems — a council, a retailer, a protocol
 * ------------------------------------------------------------------ */

/** A four-ward breakdown read straight off an uploaded return: every child is T1 with a page
 *  anchor, the parent states that no combined figure exists, and the outcome is a seat count rather
 *  than a percentage. */
const COUNCIL_ELECTION: WorldSpec = {
  title: 'Why did the council change hands on a smaller vote?',
  outcomeId: 'control-changed',
  provenance: {
    notes: ['A breakdown that only exists as its parts, read from the uploaded return.'],
  },
  nodes: [
    container(
      'turnout',
      'Turnout by ward',
      'root',
      0,
      'Turnout is published ward by ward; the return prints no single borough figure.',
      {
        ...on('2026-05-07'),
        unit: '%',
        children: [
          uploaded('turnout.north', 'North ward', 'root', 0, 58, '%', 'North ward turnout', 4),
          uploaded('turnout.east', 'East ward', 'root', 0, 41, '%', 'East ward turnout', 4),
          uploaded('turnout.west', 'West ward', 'root', 0, 37, '%', 'West ward turnout', 4),
          uploaded('turnout.quay', 'Quay ward', 'root', 0, 29, '%', 'Quay ward turnout', 4),
        ],
      },
    ),
    measured(
      'split-vote',
      'Vote taken by the new independent slate',
      'root',
      0,
      11,
      '%',
      'The independent slate’s share',
      on('2026-05-07'),
    ),
    bare(
      'boundary',
      'Two estates moved into the marginal ward',
      'root',
      0,
      on('2025-10', '2025-12'),
    ),
    measured(
      'swing',
      'Swing across the three marginal wards',
      'mechanism',
      1,
      3.8,
      'pp',
      'The swing in the marginals',
      on('2026-05-07'),
    ),
    uploaded(
      'control-changed',
      'Seats held by the largest group',
      'outcome',
      2,
      21,
      'seats',
      'Seats held by the largest group',
      2,
      on('2026-05-08'),
    ),
  ],
  edges: [
    weighed(
      'turnout',
      'swing',
      'shaped',
      'contributes',
      0.3,
      'The swing was largest where turnout moved most.',
    ),
    weighed(
      'split-vote',
      'swing',
      'split',
      'dampens',
      0.45,
      'The slate stood in every marginal ward.',
      -1,
    ),
    link('boundary', 'swing', 'moved', 'contributes'),
    weighed(
      'swing',
      'control-changed',
      'flipped',
      'causes',
      0.6,
      'Three wards changed hands on that swing.',
    ),
  ],
};

/** Two series that both go NEGATIVE, alongside a three-channel breakdown: the sign handling a chart
 *  only meets when a business stops growing, and a container next to it whose own value is absent. */
const RETAIL_DECLINE: WorldSpec = {
  title: 'Why did the retailer stop growing?',
  outcomeId: 'like-for-like',
  provenance: {
    notes: ['Two series that cross zero, and a total that exists only as its channels.'],
  },
  nodes: [
    container(
      'revenue',
      'Revenue by channel',
      'root',
      0,
      'The filing reports revenue channel by channel and never as one comparable total.',
      {
        unit: '£m',
        children: [
          uploaded('revenue.stores', 'Stores', 'root', 0, 1840, '£m', 'Store revenue', 11),
          uploaded('revenue.online', 'Online', 'root', 0, 412, '£m', 'Online revenue', 11),
          uploaded('revenue.wholesale', 'Wholesale', 'root', 0, 96, '£m', 'Wholesale revenue', 11),
        ],
      },
    ),
    measured(
      'lease-cost',
      'Rent and rates per square metre',
      'root',
      0,
      214,
      '£/m2',
      'Rent and rates per square metre',
    ),
    measured(
      'delivery',
      'Median delivery promise',
      'mechanism',
      1,
      4,
      'days',
      'The delivery promise',
    ),
    bare('range', 'The range stayed built for a weekly shop', 'mechanism', 1),
    measured('footfall', 'Footfall across the estate', 'mechanism', 2, -19, '%', 'Footfall', {
      series: measuredSeries('Footfall', '%', [
        ['2021', -4],
        ['2022', -9],
        ['2023', -14],
        ['2024', -19],
      ]),
    }),
    measured(
      'like-for-like',
      'Like-for-like sales growth',
      'outcome',
      3,
      -2.6,
      '%',
      'Like-for-like sales growth',
      {
        series: measuredSeries('Like-for-like sales growth', '%', [
          ['2021', 3.1],
          ['2022', 1.4],
          ['2023', -0.7],
          ['2024', -2.6],
        ]),
      },
    ),
  ],
  edges: [
    weighed(
      'revenue',
      'like-for-like',
      'carried',
      'contributes',
      0.4,
      'Growth tracked the channel that was shrinking.',
    ),
    weighed(
      'lease-cost',
      'footfall',
      'emptied',
      'dampens',
      0.3,
      'Units stood empty where rents held.',
      -1,
    ),
    link('delivery', 'revenue', 'lost', 'dampens', -1),
    link('range', 'revenue', 'narrowed', 'dampens', -1),
    weighed(
      'footfall',
      'like-for-like',
      'drained',
      'causes',
      0.55,
      'Sales fell in the weeks footfall did.',
      -1,
    ),
    link('range', 'footfall', 'gave no reason for', 'dampens', -1),
  ],
};

/** The rising world: an outcome that goes UP, a grounded figure of exactly ZERO on a root, and a
 *  six-point receipted series — the adoption S-curve, which is the well-behaved case every other
 *  scenario here is the exception to. */
const HTTPS_ADOPTION: WorldSpec = {
  title: 'Why did encrypted transport become the default?',
  outcomeId: 'https-share',
  provenance: {
    notes: ['A grounded zero on a root, and an outcome that rises rather than falls.'],
  },
  nodes: [
    measured(
      'free-certs',
      'Price of a publicly trusted certificate',
      'root',
      0,
      0,
      '£',
      'The price of a publicly trusted certificate',
    ),
    measured(
      'automation',
      'Time to issue and install a certificate',
      'root',
      0,
      90,
      's',
      'Time to issue and install a certificate',
    ),
    bare('browser-ui', 'Browsers began marking plain pages as not secure', 'root', 0),
    bare('ranking', 'Search ranking favoured encrypted pages', 'root', 0),
    measured(
      'cpu-cost',
      'Handshake CPU cost per connection',
      'mechanism',
      1,
      1,
      '%',
      'Handshake CPU cost per connection',
      {
        detail:
          'Once the handshake stopped being expensive, the last operational objection went with it.',
      },
    ),
    bare('platform-default', 'Hosting platforms turned it on by default', 'mechanism', 2),
    measured(
      'https-share',
      'Share of page loads over encrypted transport',
      'outcome',
      3,
      95,
      '%',
      'Share of page loads over encrypted transport',
      {
        series: measuredSeries('Share of page loads over encrypted transport', '%', [
          ['2014', 27],
          ['2016', 45],
          ['2018', 70],
          ['2020', 85],
          ['2022', 92],
          ['2024', 95],
        ]),
      },
    ),
  ],
  edges: [
    weighed(
      'free-certs',
      'platform-default',
      'took the bill from',
      'enables',
      0.5,
      'Hosts stopped charging for something that had stopped costing them.',
    ),
    weighed(
      'automation',
      'platform-default',
      'made routine',
      'enables',
      0.6,
      'Renewal stopped being a calendar reminder.',
    ),
    weighed(
      'cpu-cost',
      'platform-default',
      'cleared',
      'enables',
      0.4,
      'The handshake stopped showing up in capacity planning.',
    ),
    weighed(
      'browser-ui',
      'https-share',
      'pushed',
      'causes',
      0.45,
      'Adoption stepped up at each release that changed the wording.',
    ),
    link('ranking', 'https-share', 'nudged', 'contributes'),
    weighed(
      'platform-default',
      'https-share',
      'flipped',
      'causes',
      0.7,
      'Most of the change arrived as a default rather than a decision.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Software regressions — a training run, a renderer, a pipeline, a cutover
 * ------------------------------------------------------------------ */

/** A series whose time labels are TRAINING STEPS, not dates — the case where anything that parses
 *  `t` as a calendar value has to fall back to ordinal spacing instead of collapsing the axis. */
const TRAINING_DIVERGED: WorldSpec = {
  title: 'Why did the training run diverge partway through the schedule?',
  outcomeId: 'run-lost',
  provenance: { notes: ['The only series is indexed by step, not by date.'] },
  nodes: [
    bare(
      'lr-restart',
      'The run resumed at the full peak learning rate',
      'root',
      0,
      on('2026-03-11T22:15Z'),
    ),
    measured(
      'bad-shard',
      'Documents in the corrupted shard',
      'root',
      0,
      120000,
      'docs',
      'Documents in the corrupted shard',
    ),
    bare('fp-format', 'Attention logits accumulated in half precision', 'root', 0),
    bare('no-checkpoint', 'Checkpoints were kept only at evaluation boundaries', 'root', 0),
    bare(
      'nan-attn',
      'Attention scores overflowed to non-finite values',
      'mechanism',
      1,
      on('2026-03-12T01:40Z'),
    ),
    measured(
      'loss-spike',
      'Training loss at the spike',
      'mechanism',
      2,
      11.4,
      'nats',
      'Training loss',
      {
        ...on('2026-03-12T01:40Z', '2026-03-12T03:05Z'),
        series: measuredSeries('Training loss', 'nats', [
          ['step 60k', 2.31],
          ['step 80k', 2.19],
          ['step 92k', 2.6],
          ['step 96k', 11.4],
        ]),
      },
    ),
    bare(
      'opt-state',
      'The optimiser state carried the spike forward',
      'mechanism',
      3,
      on('2026-03-12T02:00Z', '2026-03-12T04:20Z'),
    ),
    measured(
      'run-lost',
      'Steps discarded before the run was stopped',
      'outcome',
      4,
      41000,
      'steps',
      'Steps discarded before the run was stopped',
      on('2026-03-12T04:30Z'),
    ),
  ],
  edges: [
    link('lr-restart', 'loss-spike', 're-heated', 'contributes'),
    weighed(
      'bad-shard',
      'loss-spike',
      'fed',
      'causes',
      0.5,
      'The spike lands on the step that reads the bad shard.',
    ),
    link('fp-format', 'nan-attn', 'overflowed', 'causes'),
    link('nan-attn', 'loss-spike', 'poisoned', 'causes'),
    weighed(
      'loss-spike',
      'opt-state',
      'propagated',
      'causes',
      0.6,
      'The moment estimates never recovered their scale.',
    ),
    weighed(
      'opt-state',
      'run-lost',
      'carried',
      'causes',
      0.7,
      'Every step after the spike inherited those moment estimates.',
    ),
    link('no-checkpoint', 'run-lost', 'lengthened', 'contributes'),
  ],
};

/** Five nodes, a diamond, and a contested edge whose counter-receipt is the profile disagreeing
 *  with the bisect. The series is labelled by RELEASE — ordered, but not a time axis at all. */
const RENDER_REGRESSION: WorldSpec = {
  title: 'Why did scrolling get slower after the redesign?',
  outcomeId: 'frame-time',
  provenance: {
    notes: ['One link is receipted for and against: the bisect blames what the profile does not.'],
  },
  nodes: [
    measured(
      'shadow-layers',
      'Elements painting their own shadow layer',
      'root',
      0,
      340,
      'nodes',
      'Elements painting a shadow layer',
      on('2026-02-03'),
    ),
    bare(
      'backdrop',
      'A backdrop filter was added to the sticky header',
      'root',
      0,
      on('2026-02-17'),
    ),
    measured(
      'reflows',
      'Forced reflows per scroll frame',
      'mechanism',
      1,
      7,
      'reflows',
      'Forced reflows per scroll frame',
      on('2026-02-03', '2026-03-10'),
    ),
    bare(
      'raster-tiles',
      'Tiles were re-rastered instead of reused',
      'mechanism',
      2,
      on('2026-02-17', '2026-03-10'),
    ),
    measured(
      'frame-time',
      '95th-percentile frame time',
      'outcome',
      3,
      42,
      'ms',
      '95th-percentile frame time',
      {
        ...on('2026-01-20', '2026-03-10'),
        series: measuredSeries('95th-percentile frame time', 'ms', [
          ['v4.1.0', 12],
          ['v4.2.0', 13],
          ['v4.3.0', 31],
          ['v4.4.0', 42],
        ]),
      },
    ),
  ],
  edges: [
    weighed(
      'shadow-layers',
      'raster-tiles',
      'invalidated',
      'causes',
      0.55,
      'Tiles under a shadow are re-rastered whenever the shadow moves.',
      1,
      'The same tiles are re-rastered in the build before the shadows landed.',
    ),
    weighed(
      'backdrop',
      'raster-tiles',
      'forced',
      'causes',
      0.5,
      'A backdrop filter reads the tiles behind it every frame.',
    ),
    link('backdrop', 'reflows', 'remeasured', 'contributes'),
    weighed(
      'reflows',
      'frame-time',
      'stalled',
      'causes',
      0.35,
      'The main thread waits on every forced reflow.',
    ),
    weighed(
      'raster-tiles',
      'frame-time',
      'filled',
      'causes',
      0.6,
      'Raster time dominates the slow frames.',
    ),
  ],
};

/** A stage breakdown whose parts DON'T add to the outcome — the pipeline is longer than the sum of
 *  its stages, because the stages queue. A hierarchy renderer that sizes the parent from its own
 *  value, or assumes the children total it, gets this one wrong. */
const BUILD_SLOWDOWN: WorldSpec = {
  title: 'Why does the pipeline take three times as long as it did in the spring?',
  outcomeId: 'wall-clock',
  provenance: {
    notes: ['The four stage times are read from the build report; they do not add to the total.'],
  },
  nodes: [
    container(
      'stage-time',
      'Wall clock by stage',
      'root',
      0,
      'The build report prints each stage separately and no combined figure.',
      {
        unit: 'min',
        children: [
          uploaded('stage-time.install', 'Dependency install', 'root', 0, 6.4, 'min', 'Install', 1),
          uploaded('stage-time.typecheck', 'Typecheck', 'root', 0, 4.1, 'min', 'Typecheck', 1),
          uploaded('stage-time.test', 'Test', 'root', 0, 17.2, 'min', 'Test', 1),
          uploaded('stage-time.bundle', 'Bundle', 'root', 0, 9.3, 'min', 'Bundle', 1),
        ],
      },
    ),
    measured(
      'test-files',
      'Test files in the suite',
      'root',
      0,
      1180,
      'files',
      'Test files in the suite',
    ),
    measured(
      'cache-miss',
      'Builds starting from a cold cache',
      'mechanism',
      1,
      72,
      '%',
      'Builds starting from a cold cache',
    ),
    bare('type-graph', 'One barrel file pulled the whole graph into every project', 'mechanism', 1),
    bare('no-shard', 'The suite still ran in a single job', 'mechanism', 2),
    measured('wall-clock', 'Pipeline wall clock', 'outcome', 3, 37, 'min', 'Pipeline wall clock', {
      series: measuredSeries('Pipeline wall clock', 'min', [
        ['wk 12', 12],
        ['wk 20', 18],
        ['wk 28', 27],
        ['wk 34', 37],
      ]),
    }),
  ],
  edges: [
    link('stage-time', 'wall-clock', 'sums into', 'causes'),
    weighed(
      'test-files',
      'no-shard',
      'outgrew',
      'causes',
      0.5,
      'The suite grew past what one job finishes in a coffee break.',
    ),
    weighed(
      'cache-miss',
      'wall-clock',
      'repeated',
      'causes',
      0.4,
      'A cold build repeats work the cache already holds.',
    ),
    weighed(
      'type-graph',
      'wall-clock',
      'widened',
      'contributes',
      0.3,
      'Every project rebuilds when the barrel changes.',
    ),
    weighed(
      'no-shard',
      'wall-clock',
      'serialised',
      'causes',
      0.55,
      'The suite is the critical path.',
    ),
  ],
};

/** Almost everything here is T1: five figures read off the uploaded runbook and postmortem, each
 *  with its own page. One of them is contested by a second reading of the same document — the case
 *  where the objection is as well-anchored as the claim. */
const MIGRATION_ROLLBACK: WorldSpec = {
  title: 'Why did the cutover have to be rolled back?',
  outcomeId: 'rollback',
  provenance: { notes: ['Read out of the uploaded runbook and postmortem — pages, not the web.'] },
  nodes: [
    uploaded(
      'dual-write',
      'Days the two stores were written in parallel',
      'root',
      0,
      2,
      'days',
      'Days of parallel writes',
      3,
      on('2026-06-17T22:00Z', '2026-06-19T22:00Z'),
    ),
    uploaded(
      'backfill',
      'Rows still to backfill at cutover',
      'root',
      0,
      4.2e6,
      'rows',
      'Rows outstanding at cutover',
      4,
      on('2026-06-19T22:00Z'),
    ),
    bare('collation', 'The new database compared strings under a different collation', 'root', 0),
    bare(
      'dupes',
      'Unique constraints let two spellings of one key through',
      'mechanism',
      1,
      on('2026-06-19T22:05Z', '2026-06-19T22:50Z'),
    ),
    uploaded(
      'mismatch',
      'Orders that did not match between the two stores',
      'mechanism',
      2,
      318,
      'orders',
      'Orders that did not match',
      6,
      on('2026-06-19T22:20Z', '2026-06-19T23:10Z'),
    ),
    bare(
      'reads-drift',
      'Reads began serving whichever store answered first',
      'mechanism',
      2,
      on('2026-06-19T22:40Z', '2026-06-19T23:25Z'),
    ),
    uploaded(
      'rollback',
      'Minutes from cutover to rollback',
      'outcome',
      3,
      96,
      'min',
      'Minutes from cutover to rollback',
      7,
      on('2026-06-19T22:00Z', '2026-06-19T23:36Z'),
    ),
  ],
  edges: [
    weighed(
      'dual-write',
      'reads-drift',
      'shortened',
      'causes',
      0.4,
      'The parallel window closed before the read path was switched.',
    ),
    weighed(
      'backfill',
      'mismatch',
      'left behind',
      'causes',
      0.5,
      'The orders that did not match are the rows not yet backfilled.',
      1,
      'The mismatches include keys that were backfilled twice rather than missed.',
    ),
    link('collation', 'dupes', 'allowed', 'enables'),
    weighed(
      'dupes',
      'mismatch',
      'doubled',
      'causes',
      0.45,
      'Each duplicated key produced a mismatched order.',
    ),
    weighed(
      'mismatch',
      'rollback',
      'forced',
      'causes',
      0.65,
      'The rollback was called on the mismatch count.',
    ),
    link('reads-drift', 'rollback', 'confused', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * The batch
 * ------------------------------------------------------------------ */

/**
 * The engineering-and-history batch, ordered by domain rather than size: an operator paging through
 * the dev lab is looking for a KIND of world ("show me an outage", "show me a history question"),
 * and the corpus that aggregates these batches is what orders the whole set for the gauntlet.
 */
export const TECH_HISTORY_SCENARIOS: readonly WorldScenario[] = [
  {
    id: 'tech-datacentre-outage',
    label: 'Datacentre outage',
    note: 'A diamond that rejoins twice over a T0/T1/T2 mix, with the only series on a mid-web mechanism rather than the outcome.',
    spec: DATACENTRE_OUTAGE,
  },
  {
    id: 'tech-rocket-upper-stage',
    label: 'Loss of vehicle',
    note: 'Eight depths, one node each, wholly illustrative — the ribbon shape in a T3 regime where no point wears a receipt.',
    spec: ROCKET_UPPER_STAGE,
  },
  {
    id: 'tech-breach-orphan',
    label: 'Security breach, one loose finding',
    note: 'A measured observation no edge reaches: it must stay placed and must not be quietly attached to the chain.',
    spec: BREACH_ORPHAN,
  },
  {
    id: 'tech-db-collapse',
    label: 'Database collapse, fully grounded',
    note: 'Receipts and weights on every node and link with a measured outcome — this batch’s only exact-ladder world.',
    spec: DB_COLLAPSE,
  },
  {
    id: 'tech-roof-collapse',
    label: 'Structural failure with a zero part',
    note: 'A container whose magnitude lives in four children, one of which is a grounded ZERO — the allowance the design never made.',
    spec: ROOF_COLLAPSE,
  },
  {
    id: 'tech-runway-excursion',
    label: 'Aviation incident lattice',
    note: 'Latent conditions and active failures with multiple parents per node, one figure in the whole world, and a chronology measured in minutes.',
    spec: RUNWAY_EXCURSION,
  },
  {
    id: 'tech-grid-cascade',
    label: 'Grid cascade through one bottleneck',
    note: 'An hourglass — five roots squeezing through a single node and fanning out — with receipted series on two different time bases.',
    spec: GRID_CASCADE,
  },
  {
    id: 'tech-bronze-age',
    label: 'Fall of a civilization',
    note: 'A historiographical web whose disputed link carries evidence on both sides, whose only figure is an explicitly schematic index, and which no date contract can place: BC years do not parse.',
    spec: BRONZE_AGE,
  },
  {
    id: 'tech-july-crisis',
    label: 'Outbreak of a war (T0 only)',
    note: 'Twelve nodes, fourteen links, not one number — the honest tier regime for a question about why a war began, dated to the day across five weeks with the standing preconditions held aside.',
    spec: JULY_CRISIS,
  },
  {
    id: 'tech-treaty-collapse',
    label: 'Treaty collapse, twice contested',
    note: 'Two links receipted for AND against on one web, with a T0 outcome that carries no figure at all.',
    spec: TREATY_COLLAPSE,
  },
  {
    id: 'tech-plague-spread',
    label: 'Historical pandemic spread',
    note: 'An illustrative spread mechanism whose series is dated in centuries-old calendar years — a time axis nothing else produces.',
    spec: PLAGUE_SPREAD,
  },
  {
    id: 'tech-steam-power',
    label: 'Industrial revolution driver',
    note: 'A T0 parent whose magnitude lives entirely in four illustrative children — the container case with no receipt anywhere.',
    spec: STEAM_POWER,
  },
  {
    id: 'tech-famine',
    label: 'Famine, with a dampening cause',
    note: 'The entitlement mechanism with relief as the one dampening cause, and deliberately no figure on the outcome.',
    spec: FAMINE,
  },
  {
    id: 'tech-antibiotic-path',
    label: 'Path of a discovery',
    note: 'Four roots injecting at four different depths of one long chain — neither a chain nor a fan, and where columning by role goes wrong.',
    spec: ANTIBIOTIC_PATH,
  },
  {
    id: 'tech-council-election',
    label: 'Election result from a return',
    note: 'A four-ward breakdown where every child is T1 with its own page anchor, and the outcome is a seat count rather than a share.',
    spec: COUNCIL_ELECTION,
  },
  {
    id: 'tech-retail-decline',
    label: 'Company decline, series crossing zero',
    note: 'Two receipted series that go negative, beside a three-channel breakdown whose parent has no value of its own.',
    spec: RETAIL_DECLINE,
  },
  {
    id: 'tech-https-adoption',
    label: 'Protocol adoption (rising)',
    note: 'An outcome that rises rather than falls, a six-point receipted S-curve, and a grounded figure of exactly zero on a root.',
    spec: HTTPS_ADOPTION,
  },
  {
    id: 'tech-training-diverged',
    label: 'Model training divergence',
    note: 'A series indexed by training step rather than date — anything parsing `t` as a calendar value has to fall back to ordinal spacing.',
    spec: TRAINING_DIVERGED,
  },
  {
    id: 'tech-render-regression',
    label: 'Rendering regression',
    note: 'A five-node diamond whose contested link is the profile disagreeing with the bisect, over a series labelled by release.',
    spec: RENDER_REGRESSION,
  },
  {
    id: 'tech-build-slowdown',
    label: 'Build pipeline slowdown',
    note: 'A stage breakdown whose parts deliberately do NOT add to the outcome — the pipeline is longer than the sum of its stages.',
    spec: BUILD_SLOWDOWN,
  },
  {
    id: 'tech-migration-rollback',
    label: 'Migration rolled back (T1 heavy)',
    note: 'Five figures read off an uploaded runbook, each with its own page, and an objection anchored as well as the claim it disputes.',
    spec: MIGRATION_ROLLBACK,
  },
];

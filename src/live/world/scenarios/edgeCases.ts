// world/scenarios/edgeCases.ts — the batch of the scenario corpus that is adversarial on STRUCTURE
// and DATA rather than on subject matter. Every other batch varies the domain; this one varies the
// shape until it hurts: an outcome with no causes, one node, an unrolled ring, a 28-deep ribbon, a 30-way
// fan in each direction, a graph where every pair is linked, ten nodes that share one label, values
// that are all identical / all zero / all negative / at the integer limit, a 400-point history, and
// labels that are invisible, single-glyph, unbreakable, right-to-left or emoji.
//
// The honesty discipline is the corpus's, unchanged:
//
//   1. A receipt's quote is built FROM the value it grounds (`reading()`), so the sentence and the
//      number can never drift — which is exactly what `coerceWorldSpec` checks with `valueInQuote`.
//      Only a figure with a real receipt is T1/T2; a textbook figure is T3 inside an explicitly
//      illustrative world; everything else is T0 and carries no number at all.
//   2. The domains are ordinary and true to life — a stuck telemetry gateway really does report one
//      cached value on every meter, a pumping station really does log ten alarms all called "Pump
//      failure" — so a fixture that reaches a screen is never misleading.
//
// Several shapes the brief asks for cannot be written down as a WorldSpec at all, or cannot survive
// the coercer. Each one is expressed as the closest legal thing and the softening is stated in that
// scenario's `note`: those notes are the findings, and they are what this batch exists to produce.
//
// The builders below are the corpus's own (scenarios.ts), duplicated because they are module-private
// there. They are the one place a quote is written, so they are worth lifting into a shared builders
// module when the batches are aggregated.
import type { Receipt } from '../../ground/types';
import type { EdgeRelation } from '../../trust/relations';
import type { CausalRole } from '../../why/types';
import type { WorldScenario } from '../scenarios';
import type { WorldEdge, WorldNode, WorldSeries, WorldSpec } from '../types';
import { deriveEdgeStatus } from '../validate';

/** Where every quote in this batch is cited from — named as what it is, so nothing here can be
 *  mistaken for a real source if a scenario ever reaches a screen. */
const HOST = 'scenario corpus';

/* ------------------------------------------------------------------ *
 * Builders
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

/** A day, as a node's own date. Written out rather than computed so a fixture stays readable. */
const on = (t: string): Pick<WorldNode, 'date'> => ({ date: { t } });

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
 * Degenerate sizes — nothing, one, two
 * ------------------------------------------------------------------ */

/** The turn that established nothing but the thing to be explained: a measured outcome, no causes,
 *  no links. A world with NO nodes at all is not writable — `outcomeId` names the node the world
 *  explains, and with an empty roster it can only dangle — so this is the floor of the contract. */
const NOTHING_ESTABLISHED: WorldSpec = {
  title: 'Why did the pilot batch fail?',
  outcomeId: 'batch-failed',
  provenance: { notes: ['A measured failure, and not one cause established against it.'] },
  nodes: [
    measured(
      'batch-failed',
      'Units passing final test',
      'outcome',
      0,
      0,
      'units',
      'Units passing final test',
      on('2026-02-10'),
    ),
  ],
  edges: [],
};

/** One node, no edges, no figure — strictly less than the corpus's existing one-node world, which
 *  at least carries a measured outcome. */
const LONE_UNKNOWN: WorldSpec = {
  title: 'Why is the well water cloudy?',
  outcomeId: 'cloudy',
  provenance: { notes: ['One observation. No number, no cause, no link.'] },
  nodes: [bare('cloudy', 'The well water runs cloudy', 'outcome', 0)],
  edges: [],
};

/** Two nodes, one link, and a two-point history on each: the smallest input a chart or a timeline
 *  can be asked to draw a LINE from. */
const PAIR_TWO_POINTS: WorldSpec = {
  title: 'Why does the kettle trip the breaker?',
  outcomeId: 'breaker',
  provenance: { notes: ['Two nodes, one receipted link, two points of history each.'] },
  nodes: [
    measured('kettle-draw', 'Kettle draw at switch-on', 'root', 0, 13, 'A', 'Kettle draw', {
      series: measuredSeries('Kettle draw', 'A', [
        ['2026-01', 12.6],
        ['2026-02', 13],
      ]),
    }),
    measured('breaker', 'Peak current on the ring', 'outcome', 1, 17, 'A', 'The peak current', {
      series: measuredSeries('The peak current', 'A', [
        ['2026-01', 16],
        ['2026-02', 17],
      ]),
    }),
  ],
  edges: [
    weighed(
      'kettle-draw',
      'breaker',
      'pushes',
      'causes',
      0.9,
      'Every peak in the log followed the kettle switching on.',
    ),
  ],
};

/* ------------------------------------------------------------------ *
 * Degenerate topology — self-reference, loops, rings
 * ------------------------------------------------------------------ */

/** A breakdown that reproduces its own parent, plus a child whose label is a single emoji. */
const SELF_PARENT: WorldSpec = {
  title: 'Why does pump 3 keep tripping?',
  outcomeId: 'trips',
  provenance: { notes: ['The breakdown of a unit contains the unit again.'] },
  nodes: [
    container(
      'pump',
      'Pump 3',
      'root',
      0,
      'Pump 3 is logged as one unit; its faults are recorded against its parts.',
      {
        ...on('2026-01-04'),
        children: [
          // The child IS the parent, restated: id, label and role all repeat it.
          bare('pump.pump', 'Pump 3', 'root', 0),
          measured('pump.seal', 'Mechanical seal', 'root', 0, 3, 'faults', 'Seal faults'),
          bare('pump.restart', '🔁', 'root', 0),
        ],
      },
    ),
    bare('trips', 'Pump 3 trips on overload', 'outcome', 1, on('2026-01-11')),
  ],
  edges: [link('pump', 'trips', 'trips', 'causes')],
};

/** A self-sustaining process, which is what a model reaches for a self-link to describe. Written as
 *  the second pass of the loop being its own node, because a link from a node to itself is refused
 *  on both sides of the contract: world/validate cuts it (and says so in provenance.notes) and the
 *  morph adapter will not draw one, so a spec carrying it describes a world nothing can hold. */
const SELF_SUSTAINING: WorldSpec = {
  title: 'Why does the alarm keep re-arming itself?',
  outcomeId: 'desensitised',
  provenance: {
    notes: ['The loop unrolled: each re-arm is the node after the alarm it followed.'],
  },
  nodes: [
    bare('reset', 'The controller clears and re-arms the alarm', 'root', 0, on('2026-04-06')),
    bare('alarm', 'The alarm sounds again', 'mechanism', 1, on('2026-04-06')),
    bare('re-arm', 'The controller re-arms it once more', 'mechanism', 2, on('2026-04-07')),
    bare('desensitised', 'The night shift stopped acknowledging alarms', 'outcome', 3, {
      date: { t: '2026-04-07', until: '2026-04-21' },
    }),
  ],
  edges: [
    link('reset', 'alarm', 're-arms', 'causes'),
    link('alarm', 're-arm', 'cleared into', 'causes'),
    link('re-arm', 'desensitised', 'dulled', 'contributes'),
    link('alarm', 'desensitised', 'dulled', 'contributes'),
  ],
};

/** A feedback ring, unrolled: the same three mechanisms, with the second turn of the loop written
 *  as its own node. A literal ring cannot be held — see the scenario note. */
const FEEDBACK_LOOP: WorldSpec = {
  title: 'Why does permafrost thaw feed itself?',
  outcomeId: 'more-warming',
  provenance: {
    illustrative: true,
    notes: ['A textbook feedback loop — the mechanism, with no measurement of any site.'],
  },
  nodes: [
    bare('warming', 'The air over the tundra warms', 'root', 0, {
      date: { t: '1990', until: '2010' },
    }),
    bare('thaw', 'Frozen ground thaws and drains', 'mechanism', 1, {
      date: { t: '2000', until: '2020' },
    }),
    bare('methane', 'Thawed peat releases methane', 'mechanism', 2, {
      date: { t: '2005', until: '2025' },
    }),
    bare('more-warming', 'The air over the tundra warms further', 'outcome', 3, {
      date: { t: '2010', until: '2030' },
    }),
  ],
  edges: [
    link('warming', 'thaw', 'thaws', 'causes'),
    link('thaw', 'methane', 'releases', 'causes'),
    link('methane', 'more-warming', 'warms', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Degenerate extents — very deep, very wide, fully connected
 * ------------------------------------------------------------------ */

/** Twenty-seven handoffs which, with the outcome behind them, make 28 depths. A parcel's journey is
 *  the honest home for a chain this long: each leg really is caused by the one before it. */
const PARCEL_LEGS: readonly string[] = [
  'The seller marked the parcel ready for collection',
  'The pick list was released to the wrong bay',
  'The pick was re-run on the late round',
  'Packing missed the last cage of the day',
  'The cage stood overnight in the yard',
  'The courier collected a day late',
  'The parcel scanned into the local depot after the sweep',
  'The linehaul trailer had already left full',
  'The parcel rolled to the following trailer',
  'It reached the national hub after the sort cut-off',
  'The hub sorted it into the wrong outbound lane',
  'A re-sort added another shift',
  'The outbound trailer waited for a driver',
  'Driver hours ran out mid-route',
  'The trailer parked overnight at a services',
  'The regional depot received it after loading',
  'The delivery round was already loaded and gone',
  'It waited a day for the next round',
  'The address failed the automatic check',
  'The manual check queued behind the weekend backlog',
  'The first delivery attempt found nobody in',
  'A card was left and the parcel returned to the depot',
  'Redelivery was booked into the next free slot',
  'That slot fell on a public holiday',
  'The depot ran a skeleton round that day',
  'The parcel missed the skeleton round as well',
  'It went out on the following working round',
];

/** The ribbon case taken past anything the corpus has: 28 depths, one node each. Every leg is
 *  scanned, so every leg is dated — a handoff chain is the case a timeline was made for. */
const PARCEL_DAY_ONE = Date.UTC(2026, 2, 2);
const parcelDay = (i: number): string =>
  new Date(PARCEL_DAY_ONE + i * 86_400_000).toISOString().slice(0, 10);

function deepParcelChain(): WorldSpec {
  const nodes: WorldNode[] = PARCEL_LEGS.map((label, i) =>
    bare(`leg-${i + 1}`, label, i === 0 ? 'root' : 'mechanism', i, on(parcelDay(i))),
  );
  const outcome = measured(
    'arrived-late',
    'The parcel arrived three weeks late',
    'outcome',
    PARCEL_LEGS.length,
    21,
    'days',
    'The delay against the promised date',
    on(parcelDay(PARCEL_LEGS.length)),
  );
  nodes.push(outcome);
  const edges = nodes.slice(1).map((n, i) => link(nodes[i].id, n.id, 'delayed', 'causes'));
  return {
    title: 'Why did the parcel arrive three weeks late?',
    outcomeId: outcome.id,
    provenance: { notes: ['One handoff per depth; only the delay at the end was measured.'] },
    nodes,
    edges,
  };
}

/** Thirty inbound connections, all landing on one departure. */
const INBOUND_CITIES: readonly string[] = [
  'lisbon',
  'dublin',
  'porto',
  'madrid',
  'seville',
  'bilbao',
  'nantes',
  'lyon',
  'nice',
  'geneva',
  'zurich',
  'basel',
  'milan',
  'turin',
  'naples',
  'palermo',
  'vienna',
  'graz',
  'prague',
  'brno',
  'krakow',
  'gdansk',
  'riga',
  'tallinn',
  'oslo',
  'bergen',
  'aarhus',
  'malmo',
  'tampere',
  'cork',
];

const titleCase = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Thirty roots → one outcome: the widest fan-in the corpus holds. */
function wideFanIn(): WorldSpec {
  const nodes: WorldNode[] = INBOUND_CITIES.map((city) =>
    bare(city, `The inbound from ${titleCase(city)} landed late`, 'root', 0),
  );
  // Only the departure is dated: the turn established WHEN the flight slipped, and not one of the
  // thirty inbound landing times. The timeline holds the rest aside, which is what the shelf is for.
  const outcome = measured(
    'departure',
    'The departure slipped',
    'outcome',
    1,
    96,
    'min',
    'The delay against the scheduled departure',
    on('2026-05-14'),
  );
  nodes.push(outcome);
  return {
    title: 'Why did the flight leave an hour and a half late?',
    outcomeId: outcome.id,
    provenance: { notes: ['Thirty late connections; one measured, dated departure delay.'] },
    nodes,
    edges: INBOUND_CITIES.map((city) => link(city, outcome.id, 'held', 'contributes')),
  };
}

/** Twenty-nine services behind one certificate; checkout is the thirtieth leaf. */
const DEPENDENT_SERVICES: readonly string[] = [
  'auth',
  'session',
  'cart',
  'catalog',
  'search',
  'pricing',
  'promo',
  'tax',
  'inventory',
  'warehouse',
  'shipping',
  'address',
  'payments',
  'wallet',
  'refunds',
  'invoices',
  'ledger',
  'fraud',
  'risk',
  'identity',
  'profile',
  'prefs',
  'notify',
  'email',
  'sms',
  'images',
  'reviews',
  'recommendations',
  'support',
];

/** One root → thirty leaves, only one of which is the outcome. The other twenty-nine are real
 *  findings that lead nowhere, which is what a blast radius actually looks like. */
function wideFanOut(): WorldSpec {
  // The certificate's expiry is the one time anything here is stamped with — it is written into the
  // certificate. When each of the thirty services first failed was never established.
  const root = bare(
    'certificate',
    'The internal CA certificate expired overnight',
    'root',
    0,
    on('2026-06-19'),
  );
  const leaves = DEPENDENT_SERVICES.map((svc, i) =>
    sketched(
      svc,
      `${titleCase(svc)} could not verify the certificate`,
      'mechanism',
      1,
      // Share of that service's calls that failed: high everywhere, but never uniform — a cache or
      // a retry carried some of them through.
      ((i * 3) % 38) + 61,
      '%',
    ),
  );
  const outcome = sketched(
    'checkout',
    'Checkout returned an error to every shopper',
    'outcome',
    1,
    100,
    '%',
  );
  return {
    title: 'Why did checkout stop working?',
    outcomeId: outcome.id,
    provenance: {
      illustrative: true,
      notes: ['Illustrative failure rates — the shape of a blast radius, not one incident.'],
    },
    nodes: [root, ...leaves, outcome],
    edges: [...leaves, outcome].map((n) => link(root.id, n.id, 'broke', 'causes')),
  };
}

/** Six factors, every pair linked. */
const KITCHEN_FACTORS: readonly (readonly [string, string])[] = [
  ['fryers', 'Two of the four fryers were down'],
  ['prep', 'The prep list was written for a quiet night'],
  ['burst', 'Orders arrived in one twenty-minute burst'],
  ['plates', 'The pass ran out of clean plates'],
  ['runners', 'Runners were pulled back to wash up'],
  ['late-tickets', 'Every ticket left the pass late'],
];

/** The densest small web there is: every pair of nodes is connected. Written as a one-directional
 *  tournament so it stays a DAG — see the scenario note. */
function fullyConnected(): WorldSpec {
  // One service, so every factor carries the same date: six entries stacked on one instant is the
  // honest timeline for a night that went wrong all at once.
  const nodes = KITCHEN_FACTORS.map(([id, label], i) =>
    bare(
      id,
      label,
      i === 0 ? 'root' : i === KITCHEN_FACTORS.length - 1 ? 'outcome' : 'mechanism',
      i,
      on('2026-05-15'),
    ),
  );
  const edges: WorldEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      edges.push(link(nodes[i].id, nodes[j].id, 'compounded', 'contributes'));
    }
  }
  return {
    title: 'Why was every order late on Friday?',
    outcomeId: nodes[nodes.length - 1].id,
    provenance: { notes: ['Every factor made every later one worse; nothing was measured.'] },
    nodes,
    edges,
  };
}

/* ------------------------------------------------------------------ *
 * Degenerate identity — the same label, over and over
 * ------------------------------------------------------------------ */

/** Ten nodes that share one label. A pumping station with ten identical pumps really does log
 *  every alarm under the same words, so nothing but the id distinguishes them. */
function duplicateLabels(): WorldSpec {
  const alarm = 'Pump failure';
  const linked = Array.from({ length: 9 }, (_, i) =>
    bare(`pump-${i + 1}`, alarm, 'root', 0, on('2026-07-21')),
  );
  const orphan = bare('pump-10', alarm, 'root', 0, {
    ...on('2026-07-21'),
    detail: 'Logged in the same hour, but no edge has been established to the shutdown.',
  });
  const outcome = measured(
    'station-stopped',
    'The station stopped pumping',
    'outcome',
    1,
    0,
    'ML/d',
    'Station output during the stoppage',
    on('2026-07-21'),
  );
  return {
    title: 'Why did the pumping station stop?',
    outcomeId: outcome.id,
    provenance: { notes: ['Ten alarms, one wording — only the ids tell them apart.'] },
    nodes: [...linked, orphan, outcome],
    edges: linked.map((n) => link(n.id, outcome.id, 'stopped', 'contributes')),
  };
}

/* ------------------------------------------------------------------ *
 * Degenerate data — no variance, zero, negative, the integer limit
 * ------------------------------------------------------------------ */

/** One flat number on every node and in every history: a stuck telemetry gateway serving one cached
 *  reading all the way down to the bill. Every link is provisional, so the world is measured but
 *  its causes are only asserted. */
const NO_VARIANCE: WorldSpec = {
  title: 'Why does every meter report the same reading?',
  outcomeId: 'billing',
  provenance: { notes: ['Every figure is 42 kWh — the reading the gateway cached.'] },
  nodes: (
    [
      ['gateway', 'The gateway serves a cached reading', 'The gateway', 'root', 0],
      ['meter-a', 'Meter A', 'Meter A', 'mechanism', 1],
      ['meter-b', 'Meter B', 'Meter B', 'mechanism', 1],
      ['rollup', 'The nightly roll-up', 'The roll-up', 'mechanism', 2],
      ['billing', 'Every billed line', 'The billed line', 'outcome', 3],
    ] as const
  ).map(([id, label, subject, role, depth]) =>
    measured(id, label, role, depth, 42, 'kWh', subject, {
      series: measuredSeries(subject, 'kWh', [
        ['2026-02-09', 42],
        ['2026-02-10', 42],
        ['2026-02-11', 42],
        ['2026-02-12', 42],
      ]),
    }),
  ),
  edges: [
    link('gateway', 'meter-a', 'served', 'causes'),
    link('gateway', 'meter-b', 'served', 'causes'),
    link('meter-a', 'rollup', 'fed', 'causes'),
    link('meter-b', 'rollup', 'fed', 'causes'),
    link('rollup', 'billing', 'billed', 'causes'),
  ],
};

/** Every figure is exactly zero — a night shift on which nothing at all happened. Fully receipted
 *  and fully weighted, so the exact ladder is open and every delta it can produce is zero. */
const ALL_ZERO: WorldSpec = {
  title: 'Why did the night shift ship nothing?',
  outcomeId: 'lines-shipped',
  provenance: { notes: ['Every counter read zero; the links are receipted and weighted.'] },
  nodes: [
    measured(
      'inbound',
      'Inbound trailers booked in',
      'root',
      0,
      0,
      'trailers',
      'Inbound trailers',
      on('2026-02-17'),
    ),
    measured(
      'alarms',
      'Alarms raised on the pick line',
      'root',
      0,
      0,
      'alarms',
      'Alarms raised',
      on('2026-02-17'),
    ),
    measured(
      'picks',
      'Orders picked',
      'mechanism',
      1,
      0,
      'orders',
      'Orders picked',
      on('2026-02-17'),
    ),
    measured(
      'lines-shipped',
      'Lines shipped',
      'outcome',
      2,
      0,
      'lines',
      'Lines shipped',
      on('2026-02-18'),
    ),
  ],
  edges: [
    weighed(
      'inbound',
      'picks',
      'supplied',
      'causes',
      0.6,
      'Nothing was booked in, so nothing was available to pick.',
    ),
    weighed(
      'alarms',
      'picks',
      'interrupted',
      'dampens',
      0.1,
      'Alarm minutes are logged against picking time on every shift.',
      -1,
    ),
    weighed(
      'picks',
      'lines-shipped',
      'fed',
      'causes',
      0.9,
      'Every shipped line is a picked order.',
    ),
  ],
};

/** Every figure is below zero, and the outcome is the least negative of them. A cold chain is the
 *  honest home for it: nothing here is a magnitude that can be read as a share. */
const ALL_NEGATIVE: WorldSpec = {
  title: 'Why did the ice cream arrive soft?',
  outcomeId: 'arrival',
  provenance: { notes: ['Temperatures only — one from the customer’s own trailer log.'] },
  nodes: [
    uploaded(
      'setpoint',
      'Trailer setpoint on the run sheet',
      'root',
      0,
      -24,
      '°C',
      'The trailer setpoint',
      2,
      on('2026-08-03'),
    ),
    measured(
      'door',
      'Air temperature at the door',
      'mechanism',
      1,
      -6,
      '°C',
      'Door-line air',
      on('2026-08-03'),
    ),
    bare('door-open', 'The rear door stood open through two drops', 'root', 0, on('2026-08-03')),
    measured(
      'spare',
      'Spare trailer standing in the yard',
      'mechanism',
      1,
      -18.5,
      '°C',
      'The spare trailer',
      {
        ...on('2026-08-03'),
        detail: 'Recorded the same night. No edge ties it to this load either way.',
      },
    ),
    measured(
      'arrival',
      'Core temperature on arrival',
      'outcome',
      2,
      -3.2,
      '°C',
      'Core on arrival',
      on('2026-08-04'),
    ),
  ],
  edges: [
    link('setpoint', 'door', 'held', 'dampens', -1),
    link('door-open', 'door', 'warmed', 'causes'),
    weighed(
      'door',
      'arrival',
      'warmed',
      'causes',
      0.7,
      'The core followed the door-line air with a lag.',
    ),
  ],
};

/** Figures at the largest integer a double holds exactly, and one adjacent to it. */
const INTEGER_LIMIT: WorldSpec = {
  title: 'Why did the synthetic ingest run stall?',
  outcomeId: 'written',
  provenance: {
    notes: ['A limits test on a scratch cluster — dialled to the integer ceiling, not observed.'],
  },
  nodes: [
    measured(
      'batch',
      'Rows in a single batch',
      'root',
      0,
      1,
      'rows',
      'The batch size',
      on('2026-09-01'),
    ),
    measured(
      'dialled',
      'Rows dialled into the run',
      'mechanism',
      1,
      9007199254740991,
      'rows',
      'The run',
      on('2026-09-01'),
    ),
    measured(
      'written',
      'Rows written before the stall',
      'outcome',
      2,
      9007199254740990,
      'rows',
      'The writer',
      on('2026-09-02'),
    ),
  ],
  edges: [
    weighed(
      'batch',
      'dialled',
      'sized',
      'causes',
      0.5,
      'One row per batch is what made the run this long.',
    ),
    weighed(
      'dialled',
      'written',
      'fed',
      'causes',
      0.5,
      'The writer stalled one row short of the dialled total.',
    ),
  ],
};

/** Magnitudes outside the window a receipt can hold: nanograms at one end, a sensor's overflow
 *  reading at the other. */
const UNQUOTABLE_MAGNITUDES: WorldSpec = {
  title: 'Why did the tracer dashboard spike?',
  outcomeId: 'spike',
  provenance: {
    illustrative: true,
    notes: ['Illustrative magnitudes — the shape of an overflowed reading, not a real assay.'],
  },
  nodes: [
    sketched('dose', 'Tracer dose injected', 'root', 0, 1e-9, 'g', on('2026-10-05')),
    sketched('floor', 'Detector noise floor', 'root', 0, 2.5e-9, 'g', on('2026-10-05')),
    bare('overflow', 'The detector reported its overflow value', 'mechanism', 1, on('2026-10-05')),
    sketched('spike', 'Concentration on the dashboard', 'outcome', 2, 1e308, 'g', {
      // The history is clock times inside one morning, which no date scale can place on its own —
      // the node's own date is what puts this on the timeline at all.
      ...on('2026-10-05'),
      series: sketchedSeries('g', [
        ['09:00', 1.2e-9],
        ['09:01', 1.4e-9],
        ['09:02', 1e308],
        ['09:03', 1.3e-9],
      ]),
      detail: 'One point is the overflow reading; the rest are ordinary nanogram readings.',
    }),
  ],
  edges: [
    link('dose', 'overflow', 'saturated', 'causes'),
    link('floor', 'overflow', 'set', 'enables'),
    link('overflow', 'spike', 'reported', 'causes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Degenerate histories — very long, very flat, sub-day
 * ------------------------------------------------------------------ */

/** Four hundred daily gauge readings: neither flat nor monotone, because a real record is neither. */
function gaugeDays(): ReadonlyArray<readonly [string, number]> {
  const points: Array<readonly [string, number]> = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < 400; i++) {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const level = Math.round((1.8 + Math.sin(i / 29) * 0.6 + Math.sin(i / 3) * 0.15) * 10) / 10;
    points.push([day, level]);
  }
  return points;
}

/** A history ten times longer than anything the corpus holds. */
const LONG_SERIES: WorldSpec = {
  title: 'Why does the river alarm fire so often?',
  outcomeId: 'alerts',
  provenance: { notes: ['Four hundred receipted daily readings against a fixed threshold.'] },
  nodes: [
    measured('gauge', 'Gauge level at the weir', 'root', 0, 1.8, 'm', 'Gauge level', {
      series: measuredSeries('Gauge level', 'm', gaugeDays()),
    }),
    bare('threshold', 'The alarm threshold has not moved since it was set', 'root', 0),
    measured('alerts', 'Alerts raised in the year', 'outcome', 1, 118, 'alerts', 'Alerts raised'),
  ],
  edges: [
    link('gauge', 'alerts', 'crossed', 'causes'),
    link('threshold', 'alerts', 'set off', 'enables'),
  ],
};

/** Forty-five minutes of one lunchtime: every date in the world falls inside a single day. */
const SAME_DAY: WorldSpec = {
  title: 'Why did the lunchtime queue build up?',
  outcomeId: 'queue',
  provenance: { notes: ['Every reading is from one 45-minute window on one day.'] },
  nodes: [
    measured('tills', 'Tills staffed', 'root', 0, 3, 'tills', 'Tills staffed', {
      // Every history here is clock times inside one lunchtime, and a clock time is not a date: the
      // node's own date is the only thing that puts this world on a time axis.
      ...on('2026-11-12'),
      series: measuredSeries('Tills staffed', 'tills', [
        ['12:00', 6],
        ['12:15', 5],
        ['12:30', 3],
        ['12:45', 3],
      ]),
    }),
    measured('arrivals', 'Shoppers joining per minute', 'root', 0, 12, 'per min', 'Arrivals', {
      ...on('2026-11-12'),
      series: measuredSeries('Arrivals', 'per min', [
        ['12:00', 6],
        ['12:15', 11],
        ['12:30', 14],
        ['12:45', 12],
      ]),
    }),
    measured('service', 'Service rate per till', 'mechanism', 1, 2, 'per min', 'Service rate', {
      ...on('2026-11-12'),
      series: measuredSeries('Service rate', 'per min', [
        ['12:00', 3],
        ['12:15', 2],
        ['12:30', 2],
        ['12:45', 2],
      ]),
    }),
    measured('queue', 'Shoppers waiting', 'outcome', 2, 22, 'people', 'The queue', {
      ...on('2026-11-12'),
      series: measuredSeries('The queue', 'people', [
        ['12:00', 2],
        ['12:15', 9],
        ['12:30', 18],
        ['12:45', 22],
      ]),
    }),
  ],
  edges: [
    link('tills', 'service', 'set', 'causes'),
    link('arrivals', 'queue', 'lengthened', 'causes'),
    link('service', 'queue', 'shortened', 'dampens', -1),
  ],
};

/* ------------------------------------------------------------------ *
 * Degenerate evidence and labels
 * ------------------------------------------------------------------ */

/** Every link receipted for AND against: two consultants' reports that agree on nothing. The
 *  outcome was never measured, so no amount of edge evidence opens the exact ladder. */
const ALL_CONTESTED: WorldSpec = {
  title: 'Why did the fish die in the mill pond?',
  outcomeId: 'fish-died',
  provenance: { notes: ['Every link carries a receipt on each side; the outcome has no figure.'] },
  nodes: [
    measured(
      'runoff',
      'Runoff from the yard',
      'root',
      0,
      34,
      'mg/L',
      'Suspended solids in runoff',
      on('2026-06-07'),
    ),
    measured(
      'temperature',
      'Pond temperature',
      'root',
      0,
      24,
      '°C',
      'Pond temperature',
      on('2026-06-07'),
    ),
    bare('oxygen', 'Dissolved oxygen fell overnight', 'mechanism', 1, on('2026-06-07')),
    bare('fish-died', 'The fish died', 'outcome', 2, on('2026-06-08')),
  ],
  edges: [
    weighed(
      'runoff',
      'oxygen',
      'stripped',
      'dampens',
      0.5,
      'Oxygen fell fastest on the days the yard drained.',
      -1,
      'Oxygen fell as far on the two dry days, when the yard drained nothing.',
    ),
    weighed(
      'temperature',
      'oxygen',
      'lowered',
      'dampens',
      0.4,
      'Warmer water holds less oxygen, and the pond ran warm all week.',
      -1,
      'The upstream pond ran warmer still and held its oxygen.',
    ),
    weighed(
      'oxygen',
      'fish-died',
      'suffocated',
      'causes',
      0.8,
      'The die-off followed the overnight oxygen minimum.',
      1,
      'The die-off was found upstream of the minimum, hours before it.',
    ),
  ],
};

/** A 111-character instrument tag with NO break opportunity in it — no space, and no hyphen either,
 *  since a hyphen is where the line breaker would have got out. Underscored point names like this
 *  are what a plant historian actually exports. */
const INSTRUMENT_TAG =
  'PLANTA_LINE3_OVEN2_BURNER4_THERMOCOUPLE7_CHANNEL2_RAW_MILLIVOLTS_CALIBRATED_20260211_REVC_CHECKSUM_9F3A0071B2E4';

/** Labels that are barely labels: an invisible one, a single glyph, an unbreakable tag, a
 *  right-to-left sentence with Latin embedded in it, and an emoji-led line. */
const LABEL_DEGENERATES: WorldSpec = {
  title: 'Why could the shift log not be handed over?',
  outcomeId: 'handover',
  provenance: { notes: ['Label stress: invisible, single-glyph, unbreakable, RTL, emoji.'] },
  nodes: [
    // A zero-width space: a label that passes every non-empty check and paints nothing.
    bare('blank', '\u200B', 'root', 0, on('2026-04-29')),
    bare('ohm', 'Ω', 'root', 0, on('2026-04-29')),
    bare('tag', INSTRUMENT_TAG, 'root', 0, on('2026-04-29')),
    bare('arabic', 'مضخة Pump-3 توقفت عن العمل', 'root', 0, on('2026-04-29')),
    bare('emoji', '🚨 Line 4 halted 🚨', 'root', 0, on('2026-04-29')),
    bare('handover', 'The oncoming shift could not read the log', 'outcome', 1, on('2026-04-30')),
  ],
  edges: [
    link('blank', 'handover', 'obscured', 'contributes'),
    link('ohm', 'handover', 'obscured', 'contributes'),
    link('tag', 'handover', 'obscured', 'contributes'),
    link('arabic', 'handover', 'obscured', 'contributes'),
    link('emoji', 'handover', 'obscured', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * Degenerate breakdowns
 * ------------------------------------------------------------------ */

/** A breakdown on every node, and one node whose breakdown outnumbers the whole top level. */
const CHILDREN_EVERYWHERE: WorldSpec = {
  title: 'Why did the morning bake come out burnt?',
  outcomeId: 'burnt',
  provenance: { notes: ['Three top-level nodes; one of them has four parts on its own.'] },
  nodes: [
    container(
      'oven',
      'The deck oven',
      'root',
      0,
      'The oven is logged per deck; there is no single oven temperature.',
      {
        ...on('2026-05-06'),
        children: [
          measured('oven.deck1', 'Deck 1', 'root', 0, 241, '°C', 'Deck 1'),
          measured('oven.deck2', 'Deck 2', 'root', 0, 238, '°C', 'Deck 2'),
          measured('oven.deck3', 'Deck 3', 'root', 0, 262, '°C', 'Deck 3'),
          measured('oven.deck4', 'Deck 4', 'root', 0, 259, '°C', 'Deck 4'),
        ],
      },
    ),
    measured('dough', 'Dough temperature at loading', 'root', 0, 26, '°C', 'Dough at loading', {
      ...on('2026-05-06'),
      children: [
        measured('dough.white', 'White dough', 'root', 0, 25, '°C', 'White dough'),
        measured('dough.rye', 'Rye dough', 'root', 0, 27, '°C', 'Rye dough'),
      ],
    }),
    measured('burnt', 'Trays sent back', 'outcome', 1, 18, 'trays', 'Trays sent back', {
      ...on('2026-05-06'),
      children: [
        measured('burnt.tops', 'Burnt on top', 'outcome', 1, 12, 'trays', 'Trays burnt on top'),
        measured(
          'burnt.bases',
          'Burnt underneath',
          'outcome',
          1,
          6,
          'trays',
          'Trays burnt beneath',
        ),
      ],
    }),
  ],
  edges: [
    link('oven', 'burnt', 'over-baked', 'causes'),
    link('dough', 'burnt', 'sped up', 'contributes'),
  ],
};

/* ------------------------------------------------------------------ *
 * The batch
 * ------------------------------------------------------------------ */

/**
 * Twenty-one worlds that attack the shape rather than the subject. Ordered smallest-first: a
 * failure in a world with no nodes is far easier to read than the same failure inside a 31-node
 * fan, and they usually fail together.
 */
export const EDGE_CASE_SCENARIOS: readonly WorldScenario[] = [
  {
    id: 'edge-no-causes',
    label: 'An outcome and nothing else',
    note: 'The zero case: a turn that established the thing to be explained and not one cause of it. SOFTENED — a world with NO nodes at all is not writable: `outcomeId` names the node the world explains, so on an empty roster it can only dangle, which is a spec no gate should accept and no surface should be handed. The floor of the contract is this instead: one measured outcome, no causes, no links. coerceWorldSpec still refuses it (it needs two nodes), so the product can never build it; it exists to prove the surface degrades instead of throwing, and that an edgeless web never reads as fully grounded.',
    spec: NOTHING_ESTABLISHED,
  },
  {
    id: 'edge-lone-node',
    label: 'One node, no number',
    note: 'A single T0 node with no edges — strictly less than the corpus’s existing one-node world, which at least carries a measured outcome. Probes every "first/last/only" path in a layout at once, and the coercer refuses it for the same two-node reason.',
    spec: LONE_UNKNOWN,
  },
  {
    id: 'edge-pair-two-points',
    label: 'Two nodes, two points each',
    note: 'The smallest input a chart or timeline can draw a LINE from: two nodes, one receipted link, a two-point history on each. Also the smallest fully grounded world in the batch, so the exact ladder is open on a two-node web.',
    spec: PAIR_TWO_POINTS,
  },
  {
    id: 'edge-self-parent',
    label: 'A node inside itself',
    note: 'A breakdown that reproduces its own parent (`pump.pump`, same label, same role). SOFTENED — a WorldNode is a value tree, so genuine self-parenting is not representable; a child that restates its parent is what a model actually emits when it recurses, and it survives coercion intact. The 🔁 child probes the other half: an emoji-ONLY label would slug to the empty string and be dropped, so it carries an ASCII id.',
    spec: SELF_PARENT,
  },
  {
    id: 'edge-self-sustaining',
    label: 'A process that re-triggers itself',
    note: 'The self-link case, unrolled: each re-arm is its own node after the alarm it followed. SOFTENED — a link from a node to itself is refused on BOTH sides now (world/validate cuts it and records the cut in provenance.notes; the morph adapter will not draw one), so a spec carrying a literal self-link describes a world nothing in the product can hold. The raw payload is exercised against the gate in tests/world-acyclic.test.ts, which is where model output belongs.',
    spec: SELF_SUSTAINING,
  },
  {
    id: 'edge-feedback-loop',
    label: 'A ring, unrolled',
    note: 'A closed feedback loop written the only way a DAG can hold one: the second turn of the ring is its own node. SOFTENED — a literal ring is cut by the coercer’s acyclic guard (the back-edge is dropped and named in provenance.notes) because why/engine’s topoOrder refuses a cycle rather than resolving it, which would leave every lever dead with nothing on screen saying why. tests/world-acyclic.test.ts feeds the ring through the gate and asserts the cut.',
    spec: FEEDBACK_LOOP,
  },
  {
    id: 'edge-deep-chain-28',
    label: 'Twenty-eight depths',
    note: 'A parcel’s 28 handoffs, one node per depth — nearly three times the corpus’s deepest ribbon. Probes reading-band wrapping and the camera’s zoom floor. The coercer keeps only the first 16 nodes (NODE_CAP) and the edges between them, so half the chain is a render-only case.',
    spec: deepParcelChain(),
  },
  {
    id: 'edge-fan-in-30',
    label: 'Thirty roots, one outcome',
    note: 'The widest fan-in the corpus holds: 30 late inbound connections converging on one measured departure delay. Probes root-lane wrapping and the one-column shelf. Over NODE_CAP, so the coerced world keeps 16 roots and — because the outcome falls outside the cap — none of the edges.',
    spec: wideFanIn(),
  },
  {
    id: 'edge-fan-out-30',
    label: 'One root, thirty leaves',
    note: 'The mirror image: one expired certificate breaking 30 services, only one of which is the outcome. Twenty-nine dead-end leaves are what a blast radius really looks like, and they are the case where a layout that assumes every branch reaches the outcome falls over. Illustrative, so its failure rates are captioned as shape, not measurement.',
    spec: wideFanOut(),
  },
  {
    id: 'edge-fully-connected',
    label: 'Every pair linked',
    note: 'Six factors and all 15 pairs — edge density n(n−1)/2, where an edge-router that is fine on a sparse web piles every line into one channel. SOFTENED to a one-directional tournament: a truly complete graph is bidirectional, which is a cycle, and the coercer now cuts the back-edge before the cascade ever sees it (edge-feedback-loop is the unrolled ring, and tests/world-acyclic.test.ts is where the raw cycle is exercised).',
    spec: fullyConnected(),
  },
  {
    id: 'edge-duplicate-labels',
    label: 'Ten nodes, one label',
    note: 'A pumping station whose ten identical pumps all log "Pump failure" — only the ids tell them apart. Probes anything keyed on the label rather than the id, and pins the honest consequence in mapOntoWorld: its unique-label rescue can never match any of them, so a follow-up turn appends new nodes instead of merging. One of the ten is an orphan, and the outcome is a receipted zero.',
    spec: duplicateLabels(),
  },
  {
    id: 'edge-no-variance',
    label: 'The same number everywhere',
    note: 'A stuck gateway serving one cached reading: 42 kWh on every node, and a flat four-point history on each, so max === min on both axes and any (v − min)/(max − min) normalisation divides by zero. Every link is provisional T0 — measured nodes, asserted causes — which is also the batch’s "no receipted link anywhere" regime.',
    spec: NO_VARIANCE,
  },
  {
    id: 'edge-all-zero',
    label: 'Every figure is zero',
    note: 'A night shift on which nothing happened: every counter is a receipted 0, and every link is weighted and receipted, so this is the batch’s fully grounded world. Probes share/percentage maths against a zero total and an exact outcome delta that is legitimately 0 — a "no effect" answer that must not read as "no answer".',
    spec: ALL_ZERO,
  },
  {
    id: 'edge-all-negative',
    label: 'Every figure is negative',
    note: 'A cold chain: −24 °C to −3.2 °C, where no value can be read as a share and a bar drawn from a zero baseline points the wrong way. Mixed tiers (T1 from the customer’s own run sheet, T2, T0) with one orphan and one qualitative link, so the exact ladder stays closed.',
    spec: ALL_NEGATIVE,
  },
  {
    id: 'edge-integer-limit',
    label: 'At Number.MAX_SAFE_INTEGER',
    note: 'A synthetic limits test dialled to 9007199254740991 rows, with an adjacent value one below it: two figures a double holds exactly but whose DIFFERENCE is one part in 9e15, so any ratio, tick or share computed from them loses it. Fully grounded on purpose — the exact delta it produces is the number the UI has to be able to print.',
    spec: INTEGER_LIMIT,
  },
  {
    id: 'edge-unquotable-magnitudes',
    label: 'Nanograms and an overflow',
    note: 'FINDING — the receiptable window is [1e-6, 1e21). Outside it JavaScript stringifies in exponent form ("1e-9", "1e+308"), digitsOf() reads "19"/"1308", and valueInQuote can never match the quote’s own number: a T1/T2 node at 1e-9 is silently DEMOTED to T0 and a series point at 1e308 is silently DROPPED. So the honest home for both is T3 inside an illustrative world, which is what this is. The 1e308 point is also the NaN-adjacent case: one more decade and any sum of it is Infinity.',
    spec: UNQUOTABLE_MAGNITUDES,
  },
  {
    id: 'edge-series-400',
    label: 'Four hundred points',
    note: 'A year and a bit of daily gauge readings, each with its own receipt — ten times the longest series in the corpus, and the size at which a per-point path build or a per-point DOM node stops being free. The coercer keeps the first 40 (SERIES_POINT_CAP), so the other 360 are a render-only case.',
    spec: LONG_SERIES,
  },
  {
    id: 'edge-same-day',
    label: 'One lunchtime',
    note: 'Every dated fact in the world falls inside 45 minutes of one day. A timeline that derives its scale by parsing years, or that formats a tick as a date, has nothing to spread here — the whole world collapses onto a single point unless the axis reads the time of day.',
    spec: SAME_DAY,
  },
  {
    id: 'edge-all-contested',
    label: 'Every link disputed',
    note: 'Two consultants’ reports that agree on nothing: every edge carries a receipt FOR and a receipt AGAINST, so every edge derives to "contested" and the surface must show both sides on all of them at once. The outcome itself was never measured, so no weight of edge evidence opens the exact ladder — which is the honest reading of a disputed web.',
    spec: ALL_CONTESTED,
  },
  {
    id: 'edge-label-degenerates',
    label: 'Labels that are barely labels',
    note: 'A zero-width label that paints nothing, a single glyph (Ω), a 111-character instrument tag with no space and no hyphen to break at, a right-to-left sentence with a Latin part number inside it, and an emoji-led line. SOFTENED twice — LABEL_MAX is 120, so a 200-character tag is truncated to 120 by the coercer and ~120 is the real worst case; and a genuinely EMPTY label makes the coercer drop the node without a word, so the invisible label here is U+200B, which survives every non-empty check and is the same problem the layout actually has to face.',
    spec: LABEL_DEGENERATES,
  },
  {
    id: 'edge-children-everywhere',
    label: 'A breakdown on every node',
    note: 'Every top-level node carries a breakdown, and the oven’s four decks outnumber the three top-level nodes — so the expanded pass lays out more children than parents and the separation relaxation runs on a world that is mostly children. SOFTENED: CHILD_CAP is 4 and grandchildren are dropped at the gate, so "outnumber the top level" is only reachable at three top-level nodes.',
    spec: CHILDREN_EVERYWHERE,
  },
];

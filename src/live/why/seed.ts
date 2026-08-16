// why/seed.ts — the hand-authored webs the QA route (#/whylab) mounts: one per rung of the honesty
// ladder, so all three readouts can be judged side by side without a live turn.
//
//   WHY_SEED_GROUNDED    receipted and fully weighted → exact pp deltas and "% explained".
//   WHY_SEED             the same machine on an ILLUSTRATIVE web → every exact figure withheld,
//                        because a textbook explanation measured nothing (why/engine's rule), so
//                        the conclusion moves in relative strength only.
//   WHY_SEED_STRUCTURAL  no figures to withhold in the first place → relative strength only.
//
// None of them is a user's data. The illustrative one says so in its provenance and wears the
// banner; the grounded one is grounded against the sample text bundled below it, and its receipts
// name that sample as their source rather than pointing at any real private or web document.
import type { WhyDag } from './types';

// A STRUCTURE-ONLY web (the default a real document explode produces before any data is attached or
// search is on): every node/edge is T0 (model-read, no receipts) and no edge carries a weight. This
// is the case that used to sit dead at "—" — the engine's relative pass now lets levers and prunes
// still move the conclusion's *relative* strength here, clearly labelled "relative, not measured".
// Mirrors the shape of the real "why does this paper reach its conclusion?" webs.
export const WHY_SEED_STRUCTURAL: WhyDag = {
  center: 'Why does this design reach its conclusion?',
  outcomeId: 'concl',
  provenance: {}, // not illustrative → shows the "Structure only — no grounded figures" banner
  nodes: [
    {
      id: 'scale',
      label: 'Massive-scale platform, many datacenters',
      role: 'root',
      depth: 0,
      tier: 'T0',
    },
    { id: 'fail', label: 'Components fail continuously', role: 'root', depth: 0, tier: 'T0' },
    {
      id: 'reqs',
      label: 'Strict performance & reliability requirements',
      role: 'root',
      depth: 0,
      tier: 'T0',
    },
    {
      id: 'rdbms',
      label: 'Relational DBs limit scale & availability',
      role: 'root',
      depth: 0,
      tier: 'T0',
    },
    {
      id: 'always',
      label: 'Need for always-available storage',
      role: 'mechanism',
      depth: 1,
      tier: 'T0',
    },
    {
      id: 'partition',
      label: 'Partitioning via consistent hashing',
      role: 'mechanism',
      depth: 2,
      tier: 'T0',
    },
    {
      id: 'versioning',
      label: 'Object versioning + app-assisted conflict resolution',
      role: 'mechanism',
      depth: 2,
      tier: 'T0',
    },
    {
      id: 'gossip',
      label: 'Gossip-based failure detection & membership',
      role: 'mechanism',
      depth: 2,
      tier: 'T0',
    },
    {
      id: 'concl',
      label: 'A highly available, scalable key-value store',
      role: 'outcome',
      depth: 3,
      tier: 'T0',
    },
  ],
  edges: [
    { from: 'scale', to: 'always', sign: 1, tier: 'T0' },
    { from: 'fail', to: 'always', sign: 1, tier: 'T0' },
    { from: 'reqs', to: 'always', sign: 1, tier: 'T0' },
    { from: 'rdbms', to: 'always', sign: 1, tier: 'T0' },
    { from: 'always', to: 'partition', sign: 1, tier: 'T0' },
    { from: 'always', to: 'versioning', sign: 1, tier: 'T0' },
    { from: 'always', to: 'gossip', sign: 1, tier: 'T0' },
    { from: 'partition', to: 'concl', sign: 1, tier: 'T0' },
    { from: 'versioning', to: 'concl', sign: 1, tier: 'T0' },
    { from: 'gossip', to: 'concl', sign: 1, tier: 'T0' },
  ],
};

// An ILLUSTRATIVE web: a textbook churn story, weighted and receipted so the machinery all runs,
// but declared `illustrative` — which is the web saying it measured nothing. why/engine fails
// closed on that declaration whatever tiers the nodes wear, so this rung shows the SHAPE of a
// causal web with every exact figure withheld: no pp delta, no "% explained", just the relative
// readout under the illustrative banner. (It reached the screen as the pre-turn placeholder, hence
// the sample-report receipts: they are the bundled example text, never a real source.)
// WHY_SEED_GROUNDED is the rung where the numbers are real.
export const WHY_SEED: WhyDag = {
  center: 'Why did churn spike in March?',
  outcomeId: 'churn',
  provenance: {
    illustrative: true,
    notes: ['Illustrative example — not your data. Ask about your own “why” to build a real one.'],
  },
  nodes: [
    {
      id: 'price',
      label: 'Price raised 18%',
      role: 'root',
      depth: 0,
      tier: 'T2',
      receipt: { quote: 'List price rose 18% effective Feb 28.', host: 'sample report' },
    },
    {
      id: 'onboard',
      label: 'Onboarding email broke',
      role: 'root',
      depth: 0,
      tier: 'T2',
      receipt: {
        quote: 'The day-1 onboarding email stopped sending on Mar 3.',
        host: 'sample report',
      },
    },
    {
      id: 'comp',
      label: 'Competitor free tier',
      role: 'root',
      depth: 0,
      tier: 'T2',
      receipt: {
        quote: 'A competitor launched a free tier in early March.',
        host: 'sample report',
      },
    },
    {
      id: 'sticker',
      label: 'Renewal sticker shock',
      role: 'mechanism',
      depth: 1,
      tier: 'T2',
      receipt: { quote: 'Renewing cohorts saw the new price at renewal.', host: 'sample report' },
    },
    {
      id: 'inactive',
      label: 'Never activated',
      role: 'mechanism',
      depth: 1,
      tier: 'T2',
      receipt: {
        quote: 'New signups who missed onboarding never activated.',
        host: 'sample report',
      },
    },
    {
      id: 'churn',
      label: 'Churn +6.2pp',
      role: 'outcome',
      depth: 2,
      tier: 'T2',
      value: 6.2,
      unit: 'pp',
      receipt: { quote: 'Monthly churn rose 6.2 points in March.', host: 'sample report' },
    },
  ],
  edges: [
    {
      from: 'price',
      to: 'sticker',
      verb: 'caused',
      weight: 1,
      sign: 1,
      tier: 'T2',
      receipt: { quote: 'Renewing cohorts saw the new price at renewal.', host: 'sample report' },
    },
    {
      from: 'sticker',
      to: 'churn',
      verb: 'drove',
      weight: 0.45,
      sign: 1,
      tier: 'T2',
      receipt: {
        quote: 'Renewal cohorts churned at over double the prior rate.',
        host: 'sample report',
      },
    },
    {
      from: 'onboard',
      to: 'inactive',
      verb: 'caused',
      weight: 1,
      sign: 1,
      tier: 'T2',
      receipt: {
        quote: 'New signups who missed onboarding never activated.',
        host: 'sample report',
      },
    },
    {
      from: 'inactive',
      to: 'churn',
      verb: 'drove',
      weight: 0.31,
      sign: 1,
      tier: 'T2',
      receipt: {
        quote: 'Never-activated accounts made up a third of the lift.',
        host: 'sample report',
      },
    },
    {
      from: 'comp',
      to: 'churn',
      verb: 'added',
      weight: 0.24,
      sign: 1,
      tier: 'T2',
      receipt: {
        quote: 'Win-back surveys cited the competitor for ~a quarter of losses.',
        host: 'sample report',
      },
    },
  ],
};

// ── The GROUNDED rung ────────────────────────────────────────────────────────────────────────
//
// Every sentence the grounded web cites, held once and used twice: the corpus below is built FROM
// these lines, and each receipt quotes the same constant — so a receipt can never drift out of the
// text it claims to come from, and a figure can never drift from the sentence carrying its digits.
// (The same trick world/seed.ts uses to keep a series point and its receipt honest.)
const OPS = {
  late: 'Late deliveries rose 7.4 points in June, from 5.1% of parcels to 12.5%.',
  drivers: 'Driver cover ended June 12% below the May roster.',
  routing: 'The new routing engine shipped on 3 June and stayed on for the rest of the month.',
  queue: 'Parcels queued at the north depot on 14 of the month’s 21 working days.',
  misroute: 'Misrouted parcels had to be re-scanned at the sorting belt.',
  heatShare: 'The heatwave drove 70% of the depot queue.',
  driverShare: 'Thin driver cover added the remaining 30% of the queue.',
  routingShare: 'The routing release caused 80% of the misroutes.',
  queueShare: 'Hub queueing accounted for 52% of June’s late deliveries.',
  misrouteShare: 'Re-scanned misroutes accounted for another 24%.',
  driverDirect: 'Thin driver cover put a further 12% of late deliveries on the road.',
} as const;

const BULLETIN = {
  heat: 'A four-day heatwave closed the north route on 9 June.',
} as const;

/** The sample grounding corpus, in the shape assembleWhyCorpus builds one: the attached file's
 *  text first, then the search snippets. Pass this beside WHY_SEED_GROUNDED to why/validate and
 *  the web survives whole — which is exactly what makes it a demonstration of the grounded rung
 *  rather than an assertion of one. */
export const WHY_SEED_GROUNDED_CORPUS: string = [
  ['June operations note — north depot.', ...Object.values(OPS)].join('\n'),
  ['Regional transport bulletin.', ...Object.values(BULLETIN)].join('\n'),
].join('\n\n');

const OPS_HOST = 'sample ops note';
const BULLETIN_HOST = 'sample bulletin';

/**
 * A fully GROUNDED web: not illustrative, every node and edge receipted at T1/T2, every edge
 * weighted — the one state in which why/engine may report an exact delta, so this is the rung
 * where the honesty ladder pays off. Pruning the heatwave takes the outcome from 7.4pp to 4.7pp,
 * and the baseline reads "83% explained" — 88 points of attributed share, less the fifth of the
 * misroutes the routing release does not account for.
 *
 * The figures are the sample note's own, never a real person's data: the receipts name the sample
 * as their host and carry no URL, since there is no real page to send a reader to.
 */
export const WHY_SEED_GROUNDED: WhyDag = {
  center: 'Why did late deliveries jump in June?',
  outcomeId: 'late',
  provenance: {
    notes: [
      'Read from the bundled sample ops note and bulletin — a worked example of a fully grounded web.',
    ],
  },
  nodes: [
    {
      id: 'heat',
      label: 'Heatwave closed the north route',
      role: 'root',
      depth: 0,
      tier: 'T2',
      receipt: { quote: BULLETIN.heat, host: BULLETIN_HOST },
    },
    {
      id: 'drivers',
      label: 'Driver cover down 12%',
      role: 'root',
      depth: 0,
      tier: 'T1',
      value: 12,
      unit: '%',
      receipt: { quote: OPS.drivers, host: OPS_HOST },
    },
    {
      id: 'routing',
      label: 'New routing engine shipped',
      role: 'root',
      depth: 0,
      tier: 'T1',
      receipt: { quote: OPS.routing, host: OPS_HOST },
    },
    {
      id: 'queue',
      label: 'Parcels queued at the depot',
      role: 'mechanism',
      depth: 1,
      tier: 'T1',
      value: 14,
      unit: 'days',
      receipt: { quote: OPS.queue, host: OPS_HOST },
    },
    {
      id: 'misroute',
      label: 'Misrouted parcels re-scanned',
      role: 'mechanism',
      depth: 1,
      tier: 'T1',
      receipt: { quote: OPS.misroute, host: OPS_HOST },
    },
    {
      id: 'late',
      label: 'Late deliveries +7.4pp',
      role: 'outcome',
      depth: 2,
      tier: 'T1',
      value: 7.4,
      unit: 'pp',
      receipt: { quote: OPS.late, host: OPS_HOST },
    },
  ],
  edges: [
    {
      from: 'heat',
      to: 'queue',
      verb: 'closed',
      weight: 0.7,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.heatShare, host: OPS_HOST },
    },
    {
      from: 'drivers',
      to: 'queue',
      verb: 'thinned',
      weight: 0.3,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.driverShare, host: OPS_HOST },
    },
    {
      from: 'routing',
      to: 'misroute',
      verb: 'caused',
      weight: 0.8,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.routingShare, host: OPS_HOST },
    },
    {
      from: 'queue',
      to: 'late',
      verb: 'delayed',
      weight: 0.52,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.queueShare, host: OPS_HOST },
    },
    {
      from: 'misroute',
      to: 'late',
      verb: 'added',
      weight: 0.24,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.misrouteShare, host: OPS_HOST },
    },
    {
      from: 'drivers',
      to: 'late',
      verb: 'slowed',
      weight: 0.12,
      sign: 1,
      tier: 'T1',
      receipt: { quote: OPS.driverDirect, host: OPS_HOST },
    },
  ],
};

// why/seed.ts — a hand-authored, clearly-illustrative causal web shown before a real explode (and in
// the gallery/QA route). It demonstrates the grounded experience — weighted edges + receipts + a live
// counterfactual — WITHOUT pretending to be the user's data: provenance.illustrative is true, so the
// overlay shows the "illustrative — shows the shape, not your numbers" banner (the Ripple SEED_SHIP
// example precedent). Every receipt points at the bundled sample text, never a real private source.
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

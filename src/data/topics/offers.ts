// offers.ts, "Compare these two job offers" (content.md §2.3, id 'offers').
// New spec. Components: ComparisonMatrix + BreakdownCard + InsightCard + SlidePreview.
import type { ConversationSpec } from '../conversation';

export const offers: ConversationSpec = {
  id: 'offers',
  workspace: 'Job offers',
  title: 'The two offers, side by side',
  sub: "They're close on salary, but one wins once you count everything.",
  opener: "They're close on salary, but one wins once you count everything. Let me lay it out.",
  switchSay: "Let's put those two offers side by side.",
  tint: '#7d8cff',
  context: [
    { name: 'Offer · Northwind.pdf', color: 'var(--presence-soft)' },
    { name: 'Offer · Brightline.pdf', color: 'var(--insight)' },
    { name: 'Your priorities', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'verdict',
      num: '1',
      delay: 0,
      props: {
        title: 'Brightline wins on total comp and time',
        conf: 'inferred',
        summary: 'Lower base, but the bonus, match, and shorter commute tip it.',
        sources: [{ file: 'Your priorities' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'cash',
      num: '2',
      delay: 90,
      props: {
        title: 'Northwind pays $8k more in base',
        stat: '$8,000',
        delta: 'higher base',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'But it ends roughly even once benefits are counted.',
        sources: [{ file: 'Both offers' }],
      },
    },
    {
      type: 'breakdown',
      col: 4,
      delay: 180,
      props: {
        title: 'True yearly value',
        icon: 'table',
        rows: [
          { name: 'Base salary', val: 'Brightline $112k', pct: 93 },
          { name: 'Bonus (target)', val: '$14k', pct: 78, tag: 'swing' },
          { name: '401k match', val: '$5.6k', pct: 40 },
          { name: 'Commute cost', val: '−$2.4k', pct: 20, hot: true },
        ],
      },
    },
    {
      type: 'kpi',
      col: 4,
      delay: 260,
      props: {
        title: 'Total comp, side by side',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        cols: 2,
        kpis: [
          { val: '$126k', label: 'Northwind' },
          { val: '$131k', label: 'Brightline', color: 'var(--insight)' },
        ],
        footer: 'Base + bonus + 401k match − commute cost. Brightline leads by ~$5k.',
      },
    },
    {
      type: 'gauge',
      col: 4,
      delay: 320,
      props: {
        title: 'Which one wins',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: 64,
        max: 100,
        band: 'Brightline',
        color: 'var(--insight)',
        driver: 'Tilted by <b>total comp + a 35-min shorter commute</b>.',
        footer: 'Northwind only pulls ahead on base pay and three vacation days.',
      },
    },
    {
      type: 'donut',
      col: 4,
      delay: 380,
      props: {
        title: "Brightline's comp, broken down",
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Base', pct: 73, color: 'var(--presence)' },
          { label: 'Bonus (target)', pct: 11, color: 'var(--insight)' },
          { label: '401k match', pct: 12, color: 'var(--presence-soft)' },
          { label: 'Equity (est.)', pct: 4, color: 'var(--warning)' },
        ],
        footer: 'Bonus is the swing line, it can move total comp $7k either way.',
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 440,
      props: {
        eyebrow: 'What you said matters',
        options: [
          { name: 'Northwind', sub: '$120k base' },
          { name: 'Brightline', sub: '$112k base', pick: true },
        ],
        criteria: [
          { label: 'Total comp', cells: [{ v: '$126k' }, { v: '$131k', win: true }] },
          { label: 'Commute', cells: [{ v: '55 min' }, { v: '20 min', win: true }] },
          { label: 'Growth', cells: [{ v: 'Flat team' }, { v: 'Growing team', win: true }] },
          { label: 'PTO', cells: [{ v: '18 days', win: true }, { v: '15 days' }] },
          { label: 'Stability', cells: [{ v: 'Established', win: true }, { v: 'Series B' }] },
        ],
        recommendation:
          '<b>If take-home time and growth matter more than 15 vacation days, take Brightline.</b> The extra commute at Northwind costs ~120 hours a year.',
      },
    },
    {
      type: 'countdown',
      col: 5,
      delay: 480,
      props: {
        title: 'Time to decide',
        icon: 'clock',
        target: '2026-06-24T17:00:00',
        label: 'Brightline needs your answer by Tuesday 5pm',
        dueWhat: 'A yes or no on the offer (a short email is fine)',
        consequence: 'After this the offer may be released to the next candidate.',
        footer: 'Need longer? Asking for 48 more hours is normal — most teams say yes.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a one-pager to weigh it over.",
      props: {
        kicker: 'JOB OFFER DECISION',
        head: 'Northwind vs. Brightline',
        foot: 'Made by Mavéa · from both offer letters',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Brightline wins on total comp</b> once bonus + match are counted.',
          },
          {
            color: 'var(--warning)',
            text: "<b>Northwind's $8k higher base</b> is offset by a 55-min commute (~120h/yr).",
          },
          {
            color: 'var(--presence)',
            text: '<b>Decide by what you value:</b> stability → Northwind; growth + time → Brightline.',
          },
        ],
      },
    },
  },

  group: 'decide',
  suggests: [
    { label: 'Which should I take?', icon: 'proof', route: 'offers:pick', lead: 'Try' },
    { label: 'Make a one-pager', icon: 'slides', route: 'slide' },
    { label: 'Compare two apartments', icon: 'layers', route: 'topic:decision' },
    { label: 'Back to my money', icon: 'chart', route: 'topic:money' },
  ],
  intents: {
    pick: {
      kind: 'spotlight',
      spotId: 'verdict',
      say: 'Brightline, total comp plus a 35-minute shorter commute. Northwind only wins on base and PTO.',
    },
  },
  keywords: [
    {
      // anchor on the TWO-offer framing + proper nouns so this doesn't collide with the
      // single-offer `career` topic. Word-boundaries avoid 'comp' eating 'compound'.
      test: /\b(brightline|northwind)\b|two offers|both offers|compare.*offers?|offers? side by side/,
      route: 'topic:offers',
      sub: [{ test: /\b(which|pick|take|recommend|better)\b/, route: 'offers:pick' }],
    },
  ],
};

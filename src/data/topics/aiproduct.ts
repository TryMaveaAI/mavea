// "AI product investor pitch" — market sizing, model performance, and business trajectory
// for a Series A AI/ML company pitching to VCs. Showcases tamsam, trainingcurve, burnrunway.
import type { ConversationSpec } from '../conversation';

export const aiproduct: ConversationSpec = {
  id: 'aiproduct',
  workspace: 'Investor briefing',
  title: 'The AI product pitch',
  sub: '$4.2B market, 94 % model accuracy, 18 months of runway.',
  opener:
    "You're chasing 2 % of a $4.2B market — that's $84M ARR at scale. The model is best-in-class. The business just hit $3.2M ARR and the runway is comfortable.",
  switchSay: "Let's walk through the investor brief.",
  gather: 'Pulling the market model + metrics',
  found: 'Strong market position, differentiated model, 18 months of runway.',
  tint: '#6c77f5',
  context: [
    { name: 'Pitch deck.pdf', color: 'var(--insight)' },
    { name: 'Model metrics.csv', color: 'var(--presence-soft)' },
    { name: 'Burn model.xlsx', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'market-opp',
      num: '1',
      delay: 0,
      props: {
        title: '$4.2B serviceable market',
        stat: '$4.2B',
        delta: '22 % CAGR',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Enterprise knowledge management is a $12B TAM with a fast-growing AI-native wedge.',
        sources: [{ file: 'Pitch deck.pdf' }],
      },
    },
    {
      type: 'tamsam',
      col: 8,
      delay: 90,
      props: {
        title: 'Market sizing: TAM → SAM → SOM',
        icon: 'chart',
        iconColor: 'var(--insight)',
        markets: [
          {
            label: 'TAM',
            value: 12,
            unit: 'B',
            cagr: 18,
            description: 'Enterprise knowledge & document management — all companies worldwide.',
          },
          {
            label: 'SAM',
            value: 4.2,
            unit: 'B',
            cagr: 22,
            description:
              'Mid-market & enterprise companies in English-speaking markets with > 500 employees.',
          },
          {
            label: 'SOM',
            value: 0.84,
            unit: 'B',
            cagr: 30,
            description:
              '2 % market capture at scale — 1,400 enterprise accounts at $60k ACV in year 5.',
          },
        ],
        footer:
          'Bottom-up from 68,000 qualifying accounts × $60k ACV. 22 % SAM CAGR from Gartner 2024.',
      },
    },
    {
      type: 'kpi',
      col: 6,
      delay: 160,
      props: {
        title: 'Business metrics today',
        icon: 'spark',
        iconColor: 'var(--presence)',
        cols: 3,
        kpis: [
          { val: '$3.2M', label: 'ARR', color: 'var(--insight)' },
          { val: '41', label: 'Enterprise accounts' },
          { val: '118 %', label: 'Net revenue retention', color: 'var(--insight)' },
          { val: '$78k', label: 'Average ACV' },
          { val: '9 %', label: 'Monthly ARR growth' },
          { val: '< 6 mo', label: 'CAC payback' },
        ],
        footer: 'Trailing 3-month average · as of Q2.',
      },
    },
    {
      type: 'chart',
      col: 6,
      delay: 230,
      props: {
        title: 'ARR growth',
        unit: '$k',
        labels: ["Q3 '23", "Q4 '23", "Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24", "Q1 '25", "Q2 '25"],
        series: [
          {
            name: 'ARR ($k)',
            color: 'var(--presence)',
            data: [280, 510, 830, 1200, 1680, 2200, 2780, 3200],
          },
        ],
        footer: "Consistent 9 % month-over-month since the enterprise pivot in Q4 '23.",
      },
    },
    {
      type: 'trainingcurve',
      col: 8,
      delay: 310,
      props: {
        title: 'Model learning curve — enterprise Q&A',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        epochs: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 18, 20],
        trainLoss: [1.82, 1.41, 1.12, 0.89, 0.72, 0.6, 0.51, 0.44, 0.35, 0.28, 0.21, 0.17, 0.15],
        valLoss: [1.94, 1.52, 1.23, 1.01, 0.84, 0.71, 0.63, 0.58, 0.52, 0.49, 0.47, 0.46, 0.46],
        trainAcc: [0.51, 0.62, 0.71, 0.78, 0.83, 0.87, 0.9, 0.92, 0.94, 0.96, 0.97, 0.98, 0.98],
        valAcc: [0.47, 0.58, 0.67, 0.74, 0.8, 0.84, 0.87, 0.89, 0.91, 0.92, 0.93, 0.94, 0.94],
        bestEpoch: 18,
        footer:
          '94 % validation accuracy on 1,200 held-out enterprise Q&A pairs. Best checkpoint at epoch 18.',
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'model-edge',
      num: '2',
      delay: 380,
      props: {
        title: '94 % accuracy, +8 pp vs. GPT-4o baseline',
        stat: '94 %',
        delta: '+8 pp vs. baseline',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Fine-tuned on 2.4M proprietary enterprise Q&A pairs. Customers see 40 % fewer escalations.',
        sources: [{ file: 'Model metrics.csv' }],
      },
    },
    {
      type: 'burnrunway',
      col: 8,
      delay: 450,
      props: {
        title: 'Cash burn & runway',
        icon: 'chart',
        iconColor: 'var(--warning)',
        currency: '$',
        initialCash: 8400000,
        months: [
          { label: 'Aug', burn: 440000 },
          { label: 'Sep', burn: 455000 },
          { label: 'Oct', burn: 460000 },
          { label: 'Nov', burn: 470000 },
          { label: 'Dec', burn: 480000 },
          { label: 'Jan', burn: 490000 },
          { label: 'Feb', burn: 495000 },
          { label: 'Mar', burn: 505000 },
        ],
        footer:
          '18.4 months at current burn · well past the next product milestone. Headcount is 62 % of spend.',
      },
    },
    {
      type: 'kpi',
      col: 4,
      delay: 530,
      props: {
        title: 'The raise',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        cols: 2,
        kpis: [
          { val: '$12M', label: 'Series A ask', color: 'var(--insight)' },
          { val: '24 mo', label: 'Runway post-close', color: 'var(--insight)' },
          { val: '50 %', label: 'Goes to GTM' },
          { val: '30 %', label: 'R&D · model' },
          { val: '15 %', label: 'Infra & ops' },
          { val: '5 %', label: 'Reserve' },
        ],
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a slide',
      say: "Here's a one-slide summary for the deck.",
      props: {
        kicker: 'AI PRODUCT · SERIES A',
        head: '$4.2B market · 94 % model accuracy · $3.2M ARR',
        foot: 'Made by Mavéa · from the pitch deck and burn model',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>$4.2B SAM, 22 % CAGR</b> — AI-native wedge in enterprise knowledge management.',
          },
          {
            color: 'var(--presence)',
            text: '<b>94 % accuracy, +8 pp vs. GPT-4o</b> on held-out enterprise Q&A pairs.',
          },
          {
            color: 'var(--warning)',
            text: '<b>18 months runway · $3.2M ARR · 118 % NRR</b> — healthy unit economics at this stage.',
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'AI product investor pitch', route: 'topic:aiproduct' },
  suggests: [
    { label: 'Show the burn detail', icon: 'chart', route: 'topic:runway', lead: 'Try' },
    { label: 'How long does the cash last?', icon: 'clock', route: 'topic:runway' },
    { label: 'Pipeline & sales motion', icon: 'layers', route: 'topic:pipeline' },
    { label: 'Back to the board story', icon: 'table', route: 'topic:revenue' },
  ],
  keywords: [
    {
      test: /\b(vc|investor|series [ab]|fundrais|pitch deck|investor demo|ai product pitch|investor brief)\b/i,
      route: 'topic:aiproduct',
    },
  ],
};

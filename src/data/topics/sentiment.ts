// "Customer sentiment", NPS slipped six points, the whole drop lives in SMB after a
// pricing change, and the quotes say the product is loved while the bill stung.
import type { ConversationSpec } from '../conversation';

export const sentiment: ConversationSpec = {
  id: 'sentiment',
  workspace: 'Customer sentiment',
  title: 'How customers feel right now',
  sub: 'NPS, the trend, and what they actually said.',
  opener: 'NPS is at 41, down six since January, and the reason is loud in the quotes.',
  switchSay: "Let's look at customer sentiment.",
  gather: 'Reading the NPS survey + feedback',
  found: 'One number dipped, and the why is clear.',
  tint: '#9a7cff',
  context: [
    { name: 'NPS Survey.pdf', color: 'var(--insight)' },
    { name: 'Customer Feedback.csv', color: 'var(--presence-soft)' },
    { name: 'Support Tickets.csv', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'nps',
      num: '1',
      delay: 0,
      props: {
        title: 'NPS slipped to 41',
        stat: '41',
        delta: '−6 since Jan',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Still in “Good” territory, but the drop is recent and pricing-driven.',
        sources: [{ file: 'NPS Survey.pdf' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'split',
      num: '2',
      delay: 90,
      props: {
        title: 'Detractors are only 11%',
        stat: '11%',
        delta: 'detractors',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Most users are still promoters, the dip is passives sliding, not fans turning.',
        sources: [{ file: 'NPS Survey.pdf' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'love',
      num: '3',
      delay: 180,
      props: {
        title: 'The analytics rebuild is a hit',
        conf: 'inferred',
        summary: 'Promoters keep naming it. The product side of sentiment is genuinely strong.',
        sources: [{ file: 'Customer Feedback.csv' }],
      },
    },
    {
      type: 'gauge',
      col: 4,
      delay: 260,
      props: {
        title: 'Net Promoter Score',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: 41,
        max: 100,
        band: 'Good',
        color: 'var(--insight)',
        driver: 'Down <b>6 points</b> since January, pricing, not product.',
        footer: 'Recover SMB pricing sentiment and this likely rebounds.',
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 320,
      props: {
        title: 'NPS trend',
        unit: '',
        labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
        series: [{ name: 'NPS', color: 'var(--presence)', data: [46, 47, 47, 45, 38, 41] }],
        footer: 'Dipped to 38 in February, recovering to 41, the pricing shock is fading.',
      },
    },
    {
      type: 'donut',
      col: 4,
      delay: 380,
      props: {
        title: 'Promoters / passives / detractors',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Promoters', pct: 52, color: 'var(--insight)' },
          { label: 'Passives', pct: 37, color: 'var(--warning)' },
          { label: 'Detractors', pct: 11, color: 'var(--danger)' },
        ],
        footer: 'A promoter-heavy base, the work is converting passives back.',
      },
    },
    {
      type: 'bars',
      col: 6,
      delay: 440,
      props: {
        title: 'NPS by cohort',
        icon: 'layers',
        iconColor: 'var(--presence-soft)',
        goal: 41,
        goalLabel: 'overall',
        bars: [
          { label: 'Enterprise', value: 58, label2: '58', color: 'var(--insight)' },
          { label: 'Mid-market', value: 47, label2: '47', color: 'var(--insight)' },
          { label: 'SMB', value: 19, label2: '19', hot: true, color: 'var(--danger)' },
          { label: 'New <90d', value: 44, label2: '44' },
        ],
        footer: 'The whole drop lives in SMB, Enterprise and Mid-market are still strong.',
      },
    },
    {
      type: 'scatter',
      col: 6,
      delay: 500,
      props: {
        title: 'Usage vs. satisfaction',
        icon: 'spark',
        iconColor: 'var(--insight)',
        points: [
          { x: 12, y: 28 },
          { x: 24, y: 36 },
          { x: 31, y: 19, hot: true },
          { x: 44, y: 52 },
          { x: 58, y: 61 },
          { x: 72, y: 68 },
        ],
        xLabel: 'Weekly active use (%)',
        yLabel: 'Satisfaction (NPS)',
        xDomain: [0, 80],
        yDomain: [0, 80],
        trend: [
          [0, 18],
          [80, 70],
        ],
        footer:
          'Satisfaction tracks usage tightly, except SMB, the low-usage outlier dragging the line.',
      },
    },
    {
      type: 'heat',
      col: 12,
      delay: 560,
      props: {
        title: 'Sentiment by segment × week',
        icon: 'chart',
        levelColor: 'var(--insight)',
        cols: ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5', 'Wk6'],
        rows: [
          { label: 'Enterprise', cells: [3, 3, 3, 2, 3, 3] },
          { label: 'Mid-market', cells: [2, 3, 2, 2, 3, 3] },
          { label: 'SMB', cells: [3, 2, 1, { lvl: 0, mark: '✕', note: 'price change' }, 1, 1] },
          { label: 'New <90d', cells: [2, 2, 2, 1, 2, 2] },
        ],
        legend: ['Cool', 'Warm'],
        footer: 'SMB sentiment fell off a cliff the week pricing changed, everyone else held.',
      },
    },
    {
      type: 'quotes',
      col: 8,
      delay: 620,
      props: {
        title: 'In their words',
        icon: 'quote',
        iconColor: 'var(--presence-soft)',
        quotes: [
          {
            text: 'The analytics rebuild is genuinely best-in-class now.',
            who: 'Enterprise admin',
            tone: 'pos',
          },
          {
            text: 'Price jump felt abrupt, no warning, no grandfathering.',
            who: 'SMB founder',
            tone: 'neg',
          },
          {
            text: 'Support got back to me in minutes. Big improvement.',
            who: 'Mid-market ops',
            tone: 'pos',
          },
          {
            text: 'Migrating billing was confusing for our finance team.',
            who: 'SMB admin',
            tone: 'warn',
          },
        ],
        footer: 'The praise is product; the pain is pricing and billing.',
      },
    },
    {
      type: 'emotionwheel',
      col: 7,
      id: 'sentiment-feelings',
      delay: 680,
      props: {
        title: 'What the feedback is actually feeling',
        icon: 'quote',
        iconColor: 'var(--presence-soft)',
        highlight: 'anger',
        caption:
          'Praise clusters in trust and joy; the pricing backlash reads as anger, not disgust — fixable, not fatal.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a sentiment summary slide.",
      props: {
        kicker: 'SENTIMENT · Q1',
        head: 'NPS 41, product loved, pricing stung',
        foot: 'Made by Mavéa · from NPS + feedback',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Promoters at 52%</b>, detractors only 11%, a healthy base.',
          },
          {
            color: 'var(--warning)',
            text: '<b>NPS −6 since Jan</b>, driven by the SMB pricing change.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Analytics rebuild is the standout</b>, lean into it in messaging.',
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'How do customers feel?', route: 'topic:sentiment' },
  suggests: [
    { label: 'Make a sentiment slide', icon: 'slides', route: 'slide', lead: 'Try' },
    { label: 'Show the churn deep-dive', icon: 'chart', route: 'topic:churn' },
    { label: 'Back to the board story', icon: 'layers', route: 'topic:revenue' },
    { label: "What's the runway?", icon: 'table', route: 'topic:runway' },
  ],
  keywords: [
    {
      test: /sentiment|nps|net promoter|how do customers|customer feedback|promoters|detractors/,
      route: 'topic:sentiment',
    },
  ],
};

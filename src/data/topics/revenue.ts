// "Your Q1, before the board", enterprise revenue climbing while SMB churn doubles
// after the February pricing change, traced through a timeline and backed by the evidence.
import type { ConversationSpec } from '../conversation';

export const revenue: ConversationSpec = {
  id: 'revenue',
  workspace: 'Q1 board docs',
  title: 'Your Q1, before the board',
  sub: 'Six files, one coherent story, and one thing to flag.',
  opener:
    'Enterprise revenue is up; the churn is all in your small accounts after the pricing change. Start here.',
  switchSay: "Let's get the board docs straight.",
  gather: 'Reading the deck, sales, and feedback',
  found: 'Three things matter, and one needs a decision.',
  tint: '#6e8cff',
  context: [
    { name: 'Q1 Board Deck.pdf', color: 'var(--presence-soft)' },
    { name: 'Sales_Q1.xlsx', color: 'var(--insight)' },
    { name: 'Customer Feedback.csv', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'ent',
      num: '1',
      delay: 0,
      props: {
        title: 'Enterprise revenue grew 19% QoQ',
        stat: '$7.0M',
        delta: '+19%',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Your highest-value segment is accelerating, five straight quarters up.',
        sources: [{ file: 'Q1 Board Deck', loc: 'Revenue' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'smb',
      num: '2',
      delay: 90,
      prove: true,
      props: {
        title: 'SMB churn nearly doubled to 11.4%',
        stat: '11.4%',
        delta: 'up from 6.2%',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'It started right after the February pricing change, concentrated in small teams.',
        sources: [{ file: 'Sales_Q1.xlsx', loc: 'cancellations' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'risk',
      num: '3',
      delay: 180,
      props: {
        title: 'Retention risk is elevated, but contained',
        stat: 'Elevated',
        delta: 'SMB only',
        deltaDir: 'up',
        conf: 'inferred',
        summary:
          'Enterprise held at 2.1%. The risk lives entirely in the segment you can re-price.',
        sources: [{ file: 'Support Tickets.csv' }],
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 260,
      props: {
        title: 'Revenue by segment',
        unit: '$',
        labels: ["Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"],
        series: [
          { name: 'Enterprise', color: 'var(--insight)', data: [4.2, 4.8, 5.3, 6.1, 7.0] },
          { name: 'SMB', color: 'var(--text-muted)', data: [2.1, 2.2, 2.0, 1.9, 1.7], area: false },
        ],
        footer: 'Enterprise +19% QoQ ($M). SMB is slipping, the pricing change is the inflection.',
      },
    },
    {
      type: 'gauge',
      col: 4,
      delay: 320,
      props: {
        title: 'Retention risk',
        icon: 'shield',
        iconColor: 'var(--warning)',
        value: 68,
        max: 100,
        band: 'Elevated',
        color: 'var(--warning)',
        driver: 'Driven by <b>SMB retention</b> after the pricing change.',
        footer: 'Recover SMB and the score drops back toward Moderate.',
      },
    },
    {
      type: 'bars',
      col: 6,
      delay: 380,
      props: {
        title: 'Churn by segment · now vs. last quarter',
        unit: '%',
        bars: [
          { label: 'Ent', value: 2.1, label2: '2.1%' },
          { label: 'Mid', value: 4.8, label2: '4.8%' },
          { label: 'SMB', value: 11.4, label2: '11.4%', hot: true, color: 'var(--danger)' },
        ],
        footer: 'SMB moved 6.2% → 11.4%; Enterprise barely budged.',
      },
    },
    {
      type: 'timeline',
      col: 6,
      delay: 440,
      props: {
        eyebrow: 'What happened, in order',
        events: [
          { time: 'Feb 3', title: 'New pricing published', color: 'var(--text-muted)' },
          {
            time: 'Feb 10',
            title: 'SMB tier price +40%',
            tag: 'the trigger',
            color: 'var(--warning)',
          },
          { time: 'Feb 18', title: 'Support tickets ×2.3', color: 'var(--warning)' },
          { time: 'Mar 2', title: 'SMB churn begins rising', color: 'var(--danger)' },
          { time: 'Mar 20', title: 'Churn peaks at 11.4%', color: 'var(--danger)' },
        ],
      },
    },
    {
      type: 'marimekko',
      col: 6,
      delay: 520,
      props: {
        title: 'ARR by segment × plan',
        icon: 'chart',
        iconColor: 'var(--presence)',
        unit: 'k',
        columns: [
          {
            label: 'Enterprise',
            segments: [
              { label: 'Annual', value: 1280 },
              { label: 'Monthly', value: 220 },
            ],
          },
          {
            label: 'Mid-market',
            segments: [
              { label: 'Annual', value: 540 },
              { label: 'Monthly', value: 360 },
            ],
          },
          {
            label: 'SMB',
            segments: [
              { label: 'Annual', value: 150 },
              { label: 'Monthly', value: 470 },
            ],
          },
        ],
        footer:
          'Enterprise is the widest column and almost all annual; SMB is mostly month-to-month, which is exactly the revenue the price change put at risk.',
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'season',
      num: '4',
      delay: 600,
      props: {
        title: 'Revenue has a reliable quarter-end bump',
        stat: '+$0.35M',
        delta: 'every Mar / Jun / Sep / Dec',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Once the trend is removed, a clean seasonal spike shows up every quarter-close month — deals pulled forward to hit targets.',
        sources: [{ file: 'Sales_Q1.xlsx', loc: 'monthly revenue' }],
      },
    },
    {
      type: 'timeseriesdecomposition',
      col: 8,
      delay: 660,
      props: {
        title: 'Monthly revenue, decomposed',
        icon: 'layers',
        iconColor: 'var(--presence)',
        dates: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        observed: [5.52, 5.63, 6.26, 5.78, 6.07, 6.51, 6.23, 6.42, 7.02, 6.52, 6.8, 7.25],
        trend: [5.62, 5.71, 5.83, 5.95, 6.08, 6.22, 6.35, 6.48, 6.6, 6.71, 6.83, 6.95],
        seasonal: [-0.15, -0.05, 0.35, -0.15, -0.05, 0.35, -0.15, -0.05, 0.35, -0.15, -0.05, 0.35],
        residual: [0.05, -0.03, 0.08, -0.02, 0.04, -0.06, 0.03, -0.01, 0.07, -0.04, 0.02, -0.05],
        footer:
          'The trend explains the steady climb; the seasonal component isolates the quarter-close bump so the residual noise left over is small and unpatterned — no hidden driver left on the table.',
      },
    },
    {
      type: 'financialstatement',
      col: 8,
      id: 'pnl',
      delay: 260,
      props: {
        title: 'Quarterly P&L',
        icon: 'chart',
        currency: 'USD',
        caption: 'Unaudited · consolidated',
        periods: ['Q1 FY26', 'Q2 FY26', 'Q3 FY26'],
        rows: [
          { label: 'Revenue', values: [4180000, 4720000, 5310000] },
          { label: 'Cost of revenue', values: [-1380000, -1510000, -1650000], indent: 1 },
          { label: 'Gross profit', values: [2800000, 3210000, 3660000], kind: 'subtotal' },
          { label: 'Sales & marketing', values: [-1120000, -1240000, -1330000], indent: 1 },
          { label: 'Research & development', values: [-860000, -910000, -980000], indent: 1 },
          { label: 'General & administrative', values: [-540000, -560000, -590000], indent: 1 },
          { label: 'Operating income', values: [280000, 500000, 760000], kind: 'total' },
        ],
        footer:
          'Operating margin expands from <b>6.7%</b> to <b>14.3%</b> as revenue outpaces fixed opex.',
      },
    },
  ],
  proof: {
    spotId: 'smb',
    say: "Here's the evidence behind the churn claim, three files line up.",
    claim: 'SMB churn rose to 11.4% after the February pricing change.',
    conf: 'strong',
    file: { label: 'Sales_Q1.xlsx', type: 'xls', loc: 'Rows 220–312 · “SMB cancellations”' },
    rows: [
      { a: 'Sales_Q1.xlsx', b: 'SMB cancellations', c: '6.2% → 11.4%', hot: true },
      { a: 'Customer Feedback.csv', b: '142 rows tagged “pricing”', c: 'moved off', hot: true },
      { a: 'Pricing Memo.docx', b: 'Page 2 · effective Feb 10', c: '+40% / seat', hot: true },
      { a: 'Support Tickets.csv', b: 'volume after Feb 10', c: '×2.3' },
    ],
    note: 'SMB monthly churn moved <mark>6.2% → 11.4%</mark> across Feb–Mar while Enterprise held at 2.1%. Feedback and the pricing memo (<mark>$25 → $35 / seat, no grandfathering</mark>) point to the same cause.',
    assumptions: [
      '“Churn” = a paid subscription canceled within the quarter.',
      'Free-trial drop-offs are not counted as churn here.',
    ],
  },
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the deck',
      say: "Here's a board-ready summary slide.",
      props: {
        kicker: 'BOARD UPDATE · Q1',
        head: 'SMB churn is our main retention risk',
        foot: 'Made by Mavéa · from 6 of your files',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Enterprise revenue grew 19% QoQ</b>, core momentum is healthy.',
          },
          {
            color: 'var(--warning)',
            text: '<b>SMB churn rose to 11.4%</b> (from 6.2%) after the Feb pricing change.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Recommend a segment-specific pricing test</b> plus a targeted retention offer.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll block time to kick off the SMB pricing test, you confirm before it's added.",
      props: {
        eyebrow: 'Action · reminder',
        icon: 'clock',
        title: 'Schedule the SMB pricing-test kickoff',
        lines: [
          { k: 'Covers', v: '1-page plan + success metric' },
          { k: 'Adds', v: 'One calendar event' },
        ],
        perm: 'Adds one event to your calendar. No invites are sent.',
        cta: 'Add to calendar',
        doneText: 'Added · SMB pricing-test kickoff',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Title', value: 'SMB pricing-test kickoff' },
          { param: 'start', label: 'Start', value: '2026-07-25T14:00' },
          {
            param: 'notes',
            label: 'Agenda',
            value:
              'The segment-specific SMB pricing test: the hypothesis, the success metric, and the guardrail before we ship it wider.',
            multiline: true,
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'Prep my Q1 board docs', route: 'topic:revenue' },
  suggests: [
    { label: 'Prove the churn number', icon: 'proof', route: 'revenue:prove', lead: 'Try' },
    { label: 'Make it board-ready', icon: 'slides', route: 'slide' },
    { label: 'Show the at-risk accounts', icon: 'table', route: 'topic:churn' },
    { label: "What's the pipeline say?", icon: 'layers', route: 'topic:pipeline' },
  ],
  intents: {
    prove: { kind: 'proof' },
  },
  keywords: [
    {
      test: /\bboard\b|q1|board doc|board deck|enterprise revenue|qoq|quarterly|the deck/,
      route: 'topic:revenue',
      sub: [{ test: /prove|evidence|sure|churn number/, route: 'revenue:prove' }],
    },
  ],
};

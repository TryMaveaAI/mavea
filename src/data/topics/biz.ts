// "How the business is doing", MRR, churn, and runway, with a churn proof drill-down,
// a board-ready slide, and a shareable replay.
import type { ConversationSpec } from '../conversation';

export const biz: ConversationSpec = {
  id: 'biz',
  workspace: 'The business',
  title: 'How the business is doing',
  sub: 'Pulled from Stripe, your books, and last quarter.',
  opener: "Revenue's up and to the right, but churn is the real story. Start here.",
  switchSay: "Let's look at the business.",
  gather: 'Reading revenue + churn',
  found: 'Three things, and one needs your attention.',
  tint: '#3ed8a6',
  context: [
    { name: 'Stripe export.csv', color: 'var(--insight)' },
    { name: 'Books · Q2.xlsx', color: 'var(--presence-soft)' },
    { name: 'Cohorts', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'mrr',
      num: '1',
      delay: 0,
      props: {
        title: 'MRR crossed $48k, up 12% this month',
        stat: '$48k',
        delta: '+12%',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Sixth straight month of growth, driven by the team plan.',
        sources: [{ file: 'Stripe export.csv' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'churn',
      num: '2',
      delay: 90,
      prove: true,
      props: {
        title: 'Churn ticked up to 4.2%',
        stat: '4.2%',
        delta: '+0.9pt',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Almost all of it is solo users on the starter plan, teams are sticky.',
        sources: [{ file: 'Cohorts' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'runway',
      num: '3',
      delay: 180,
      props: {
        title: 'You have 18 months of runway',
        stat: '18 mo',
        delta: 'at this burn',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'Enough to hit the next milestone without raising, if churn holds.',
        sources: [{ file: 'Books · Q2.xlsx' }],
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 260,
      props: {
        title: 'Monthly recurring revenue',
        unit: '$',
        labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
        series: [
          {
            name: 'MRR',
            color: 'var(--insight)',
            data: [27000, 31000, 34500, 38000, 43000, 48000],
          },
          {
            name: 'Plan target',
            color: 'var(--text-muted)',
            data: [28000, 32000, 36000, 40000, 44000, 48000],
            area: false,
          },
        ],
        footer: 'Tracking just ahead of plan, the team plan is doing the heavy lifting.',
      },
    },
    {
      type: 'ring',
      col: 4,
      delay: 320,
      props: {
        title: 'Health',
        icon: 'spark',
        iconColor: 'var(--insight)',
        rings: [
          {
            label: 'Gross margin',
            pct: 0.81,
            display: '81%',
            color: 'var(--insight)',
            hint: 'Healthy for SaaS',
          },
        ],
      },
    },
    {
      type: 'stack',
      col: 12,
      delay: 380,
      props: {
        title: 'Where the burn goes · monthly',
        total: '$96k / mo',
        segments: [
          { label: 'Salaries', value: 62, display: '$62k', color: 'var(--presence)' },
          { label: 'Infra / API', value: 14, display: '$14k', color: 'var(--warning)' },
          { label: 'Marketing', value: 10, display: '$10k', color: 'var(--presence-soft)' },
          { label: 'Tools', value: 5, display: '$5k', color: 'var(--text-muted)' },
          { label: 'Other', value: 5, display: '$5k', color: 'var(--presence-deep)' },
        ],
        footer: 'Infra scales with usage, worth watching as the team plan grows.',
      },
    },
    {
      type: 'breakeven',
      col: 8,
      id: 'breakeven',
      delay: 360,
      props: {
        title: 'Break-even on the new team plan',
        icon: 'chart',
        iconColor: 'var(--presence)',
        currency: '$',
        unit: 'seats',
        fixedCost: 18000,
        pricePerUnit: 49,
        costPerUnit: 13,
        footer:
          'Each seat clears <b>$36</b> after the costs that scale with it, so the $18k of fixed monthly cost is covered at <b>500 seats</b> — anything past that is profit. We crossed it last week, which is why this month finally turns black.',
      },
    },
    {
      type: 'depreciationschedule',
      col: 9,
      delay: 420,
      props: {
        title: 'The new server rack, on the books',
        icon: 'table',
        iconColor: 'var(--presence)',
        assetDescription: 'Dell PowerEdge server rack · placed in service Jan 2024',
        cost: 60000,
        method: 'Straight-line',
        usefulLife: '5 years',
        annualDepreciation: 12000,
        rows: [
          {
            period: '2024',
            beginningBasis: 60000,
            depreciationExpense: 12000,
            accumulatedDepreciation: 12000,
            endingBasis: 48000,
          },
          {
            period: '2025',
            beginningBasis: 48000,
            depreciationExpense: 12000,
            accumulatedDepreciation: 24000,
            endingBasis: 36000,
          },
          {
            period: '2026',
            beginningBasis: 36000,
            depreciationExpense: 12000,
            accumulatedDepreciation: 36000,
            endingBasis: 24000,
          },
          {
            period: '2027',
            beginningBasis: 24000,
            depreciationExpense: 12000,
            accumulatedDepreciation: 48000,
            endingBasis: 12000,
          },
          {
            period: '2028',
            beginningBasis: 12000,
            depreciationExpense: 12000,
            accumulatedDepreciation: 60000,
            endingBasis: 0,
          },
        ],
        footer:
          "Fully depreciated by end of 2028 — the same year we'd planned to refresh the hardware anyway.",
      },
    },
    {
      type: 'logicmodel',
      col: 12,
      delay: 440,
      props: {
        title: 'The churn fix, as a logic model',
        icon: 'spark',
        iconColor: 'var(--insight)',
        columns: [
          {
            stage: 'inputs',
            items: ['2 hrs/week of CS time per new account', 'Rebuilt onboarding flow'],
          },
          {
            stage: 'activities',
            items: ['Week-1 welcome call', '3-email onboarding sequence', 'In-app setup checklist'],
          },
          {
            stage: 'outputs',
            items: ['% of new solo accounts completing setup', 'Onboarding calls held per week'],
          },
          {
            stage: 'outcomes',
            items: ['Solo · Starter churn rate, currently 7.8%'],
          },
          {
            stage: 'impact',
            items: ['Retained MRR on the $48k base'],
          },
        ],
        footer:
          'If setup completion and call attendance hold, solo-starter churn is the number that should move first, not price.',
      },
    },
  ],
  proof: {
    spotId: 'churn',
    say: "Here's churn by segment. It's the solo starter users, not teams.",
    claim: 'Churn ticked up to 4.2%, concentrated in solo starter users',
    conf: 'strong',
    file: { label: 'Cohorts', type: 'csv', loc: 'by segment' },
    rows: [
      { a: 'Solo · Starter', b: '142 users', c: '7.8%', hot: true },
      { a: 'Solo · Pro', b: '88 users', c: '3.1%' },
      { a: 'Team · Pro', b: '61 teams', c: '1.4%' },
      { a: 'Team · Business', b: '23 teams', c: '0.6%' },
      { a: 'Annual (any)', b: '97 accounts', c: '0.9%' },
    ],
    note: 'The churn is almost entirely <mark>solo users on Starter</mark> at <mark>7.8%</mark>. Teams and annual plans barely move, the fix is onboarding, not price.',
    assumptions: [
      'Churn = subscriptions cancelled or lapsed in the month.',
      "Free-trial drop-offs aren't counted as churn here.",
    ],
  },
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the deck',
      say: "Here's an investor-ready summary slide.",
      props: {
        kicker: 'INVESTOR UPDATE · Q2',
        head: '$48k MRR, growing 12% MoM',
        foot: 'Made by Mavéa · from Stripe + books',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>$48k MRR, +12% MoM</b>, sixth straight month of growth, ahead of plan.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Churn 4.2%</b>, concentrated in solo Starter users, an onboarding fix, not pricing.',
          },
          {
            color: 'var(--presence)',
            text: '<b>18 months runway at 81% margin</b>, milestone reachable without raising.',
          },
        ],
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second version for the group chat.",
      props: {
        line: '“I asked how the business was doing. Mavéa showed the numbers and proved the churn, in 20 seconds.”',
      },
    },
  },

  group: 'docs',
  tryChip: { label: "How's the business doing?", route: 'topic:biz' },
  suggests: [
    { label: 'Prove the churn number', icon: 'proof', route: 'biz:churn', lead: 'Try' },
    { label: 'Make it board-ready', icon: 'slides', route: 'slide' },
    { label: 'Clip a version for the team', icon: 'play', route: 'replay' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    churn: { kind: 'proof' },
  },
  keywords: [
    {
      // `board`/`churn`/`revenue` are deliberately NOT top-level matches here, they belong
      // to the dedicated `revenue` story and `churn` deep-dive. biz:churn stays reachable as a
      // sub-rule once you're already on this topic.
      test: /business|\bmrr\b|investor update|how.?s the business|metrics this morning|startup metrics/,
      route: 'topic:biz',
      sub: [{ test: /churn|prove|why|sure|evidence|segment/, route: 'biz:churn' }],
    },
  ],
};

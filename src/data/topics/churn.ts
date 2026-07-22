// "The churn deep-dive", the at-risk SMB accounts, why they're leaving (price), and the
// monthly trend, with a retention-offer action ready to draft.
import type { ConversationSpec } from '../conversation';

export const churn: ConversationSpec = {
  id: 'churn',
  workspace: 'Churn deep-dive',
  title: 'Where the churn is coming from',
  sub: 'The at-risk accounts, the reasons, and the trend.',
  opener: "It's a pricing story, not a product one. Here are the accounts to save first.",
  switchSay: "Let's dig into the churn.",
  gather: 'Pulling the at-risk list',
  found: 'Five accounts, one cause, one clear move.',
  tint: '#ff7a85',
  context: [
    { name: 'Sales_Q1.xlsx', color: 'var(--insight)' },
    { name: 'Cancel-flow logs', color: 'var(--presence-soft)' },
    { name: 'Support Tickets.csv', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'rate',
      num: '1',
      delay: 0,
      props: {
        title: 'SMB churn is at 11.4% and rising',
        stat: '11.4%',
        delta: 'up from 6.2%',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'It nearly doubled in two months, every cohort in the small-team tier.',
        sources: [{ file: 'Sales_Q1.xlsx' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'cause',
      num: '2',
      delay: 90,
      props: {
        title: '58% cited the price increase',
        stat: '58%',
        delta: 'top reason',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Far ahead of any product complaint, this is fixable with pricing, not a rebuild.',
        sources: [{ file: 'Cancel-flow logs' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'save',
      num: '3',
      delay: 180,
      props: {
        title: '$4.5k MRR is saveable this week',
        stat: '$4.5k',
        delta: '5 accounts',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'The high-risk SMB accounts are still active, a targeted offer can catch them.',
        sources: [{ file: 'Cancel-flow logs' }],
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 260,
      props: {
        title: 'Monthly churn, SMB vs. Enterprise',
        unit: '%',
        labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
        series: [
          { name: 'SMB', color: 'var(--danger)', data: [5.8, 6.0, 6.2, 6.4, 8.9, 11.4] },
          {
            name: 'Enterprise',
            color: 'var(--text-muted)',
            data: [2.0, 2.1, 2.0, 2.1, 2.0, 2.1],
            area: false,
          },
        ],
        footer: 'The break is Feb, exactly when the new SMB pricing took effect.',
      },
    },
    {
      type: 'donut',
      col: 4,
      delay: 320,
      props: {
        title: 'Why they left',
        icon: 'chart',
        iconColor: 'var(--warning)',
        rows: [
          { label: 'Price increase too steep', pct: 58, color: 'var(--danger)' },
          { label: 'Switched to cheaper tool', pct: 22, color: 'var(--warning)' },
          { label: 'Low usage / onboarding', pct: 13, color: 'var(--presence-soft)' },
          { label: 'Other', pct: 7, color: 'var(--text-muted)' },
        ],
        footer: 'Eight in ten cancellations trace back to price.',
      },
    },
    {
      type: 'pareto',
      col: 8,
      delay: 350,
      id: 'reasons-pareto',
      props: {
        title: 'Cancellation reasons, ranked',
        icon: 'chart',
        iconColor: 'var(--warning)',
        unit: ' tickets',
        bars: [
          { label: 'Price increase', value: 180 },
          { label: 'Cheaper tool', value: 45 },
          { label: 'Onboarding', value: 20 },
          { label: 'Missing feature', value: 12 },
          { label: 'Billing error', value: 8 },
          { label: 'Support delay', value: 4 },
          { label: 'Other', value: 3 },
        ],
        footer:
          'The first two reasons already clear <b>80%</b> of cancellations — pricing is the fix that matters most.',
      },
    },
    {
      type: 'flowchord',
      col: 12,
      delay: 350,
      id: 'movement',
      props: {
        title: 'Where accounts moved this quarter',
        icon: 'share',
        iconColor: 'var(--danger)',
        unit: ' accounts',
        nodes: [
          { id: 'ent', label: 'Enterprise', color: 'var(--insight)' },
          { id: 'mid', label: 'Mid-Market', color: 'var(--presence)' },
          { id: 'smb', label: 'SMB', color: 'var(--warning)' },
          { id: 'churn', label: 'Churned', color: 'var(--danger)' },
        ],
        flows: [
          { from: 'smb', to: 'churn', value: 34 },
          { from: 'mid', to: 'churn', value: 5 },
          { from: 'ent', to: 'churn', value: 1 },
          { from: 'mid', to: 'smb', value: 4 },
          { from: 'smb', to: 'mid', value: 6 },
          { from: 'ent', to: 'mid', value: 3 },
        ],
        footer:
          'Almost all the movement funnels through SMB — some downgrade first, most cancel outright.',
      },
    },
    {
      type: 'list',
      col: 7,
      delay: 380,
      id: 'atrisk',
      props: {
        title: 'At-risk accounts, save these first',
        icon: 'alert',
        iconColor: 'var(--warning)',
        items: [
          '<b>Northwind Labs</b> · SMB · $1.2k MRR, <mark>High</mark>: cited the 40% price jump',
          '<b>Bel Studio</b> · SMB · $0.8k MRR, <mark>High</mark>: downgraded, then canceled',
          '<b>Forma</b> · SMB · $1.6k MRR, <mark>Med</mark>: opened the cancel flow twice',
          '<b>Tidewell</b> · SMB · $0.9k MRR, <mark>Med</mark>: 3 tickets about pricing',
          '<b>Juno Health</b> · Mid · $4.1k MRR, Low: renewal in 60 days',
        ],
      },
    },
    {
      type: 'kpi',
      col: 5,
      delay: 440,
      props: {
        title: 'The saveable picture',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 2,
        kpis: [
          { val: '5', label: 'At-risk accounts' },
          { val: '$4.5k', label: 'MRR in play', color: 'var(--warning)' },
          { val: '58%', label: 'Cite pricing' },
          { val: '2 wks', label: 'Window to act', color: 'var(--insight)' },
        ],
        footer: 'A retention offer now is cheaper than re-acquiring later.',
      },
    },
    {
      type: 'evidencetrace',
      col: 7,
      delay: 1180,
      id: 'why-onboarding',
      props: {
        title: 'Why I flagged onboarding',
        icon: 'proof',
        iconColor: 'var(--presence)',
        claim: 'Confusing onboarding is the <b>top reason</b> first-month accounts churned.',
        summary: '12 of 240 churned accounts',
        items: [
          {
            text: '“I never figured out how to invite my team, so we gave up in week one.”',
            source: 'ticket #4821',
            when: 'Apr 12',
          },
          {
            text: '“The setup wizard kept looping me back to the start. Cancelled.”',
            source: 'cancel survey',
            when: 'Apr 19',
          },
          {
            text: '“Couldn’t connect our calendar — no clear next step after sign-up.”',
            source: 'ticket #4910',
            when: 'Apr 23',
          },
          {
            text: '“Too many empty screens on day one. Didn’t know where to begin.”',
            source: 'exit interview',
            when: 'May 2',
          },
          {
            text: '“Import failed silently and I assumed the product was broken.”',
            source: 'ticket #5033',
            when: 'May 8',
          },
        ],
        caveat:
          'Self-reported in cancellation flows — weighted toward people who chose to explain why they left.',
        footer: 'Each line is a verbatim record from a churned account, not a summary.',
      },
    },
    {
      type: 'cohortgrid',
      col: 10,
      id: 'retention',
      delay: 240,
      props: {
        title: 'Monthly retention by signup cohort',
        icon: 'layers',
        unit: '%',
        caption: '% of cohort still active at the start of each month',
        periods: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
        cohorts: [
          { label: 'Jan', size: 1240, values: [100, 62, 48, 41, 37, 35] },
          { label: 'Feb', size: 1410, values: [100, 64, 51, 44, 40, null] },
          { label: 'Mar', size: 1680, values: [100, 67, 54, 47, null, null] },
          { label: 'Apr', size: 1520, values: [100, 71, 58, null, null, null] },
          { label: 'May', size: 1790, values: [100, 73, null, null, null, null] },
          { label: 'Jun', size: 2050, values: [100, null, null, null, null, null] },
        ],
        footer:
          'Month-1 retention climbs from <b>62%</b> (Jan) to <b>73%</b> (May) — onboarding changes are landing for newer cohorts.',
      },
    },
    {
      type: 'fivewhychain',
      col: 7,
      id: 'why-churn',
      delay: 500,
      props: {
        title: 'Root cause: the SMB churn spike',
        icon: 'eye',
        iconColor: 'var(--danger)',
        problem: 'SMB churn nearly doubled in two months',
        whys: [
          {
            question: 'Why did SMB churn spike?',
            answer: '58% of cancellations cite the February price increase.',
          },
          {
            question: 'Why did the price increase hit so hard?',
            answer: 'It landed as a flat 40% jump with no advance notice.',
          },
          {
            question: 'Why no advance notice or phased rollout?',
            answer: 'The pricing change shipped with the Q1 close, not a customer-comms plan.',
          },
          {
            question: "Why wasn't comms part of the pricing rollout?",
            answer: 'Pricing changes have never needed sign-off from anyone outside finance.',
          },
          {
            question: 'Why is there no cross-team sign-off on pricing?',
            answer:
              "There's no defined process connecting pricing, growth, and support before a change ships.",
          },
        ],
        rootCause: 'Missing cross-team process for pricing changes, not the price itself.',
        footer: 'Fix the process and the next price change stops costing accounts.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll block time to review the at-risk accounts — you confirm before it's added.",
      props: {
        eyebrow: 'Action · retention',
        icon: 'clock',
        title: 'Schedule the at-risk SMB review',
        lines: [
          { k: 'Covers', v: '5 accounts · $4.5k MRR' },
          { k: 'Adds', v: 'One calendar event' },
        ],
        perm: 'Adds one event to your calendar. No invites are sent.',
        cta: 'Add to calendar',
        doneText: 'Added · at-risk account review',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Title', value: 'At-risk SMB retention review' },
          { param: 'start', label: 'Start', value: '2026-07-22T10:00' },
          {
            param: 'notes',
            label: 'Agenda',
            value:
              'Walk the 5 at-risk accounts hit by the pricing change and agree a retention offer for each.',
            multiline: true,
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: 'Show me the churn deep-dive', route: 'topic:churn' },
  suggests: [
    { label: 'Draft a retention offer', icon: 'mail', route: 'send', lead: 'Try' },
    { label: 'Back to the board story', icon: 'chart', route: 'topic:revenue' },
    { label: "How's customer sentiment?", icon: 'quote', route: 'topic:sentiment' },
    { label: "What's the runway?", icon: 'layers', route: 'topic:runway' },
  ],
  keywords: [
    {
      test: /churn deep|at.?risk|retention|cancel|who.?s leaving|save.*account|churn reason/,
      route: 'topic:churn',
    },
  ],
};

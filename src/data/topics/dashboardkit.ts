// "Living dashboard — example" — the showcase + render-coverage demo for the four bespoke dashboard
// widgets (thesis, alignment gauge, standing alerts, sources lineage). It mirrors the shape of a real
// dashboard built from a conversation, so the #/gallery QA surface shows each widget with lifelike
// props and all three alert/lineage states. (Example props are fine here: the real-data-only rule
// governs LIVE answers, not the scripted demo/gallery.)
import type { ConversationSpec } from '../conversation';

export const dashboardkit: ConversationSpec = {
  id: 'dashboardkit',
  workspace: 'Dashboards',
  title: 'A living dashboard, part by part',
  sub: 'The widgets a dashboard is made of.',
  opener: 'This is what Mavéa builds when a conversation becomes something worth tracking.',
  switchSay: "Here's a living dashboard.",
  gather: 'Assembling the dashboard',
  found: 'Your reasoning, your numbers, your tripwires.',
  tint: '#6e8cff',
  context: [{ name: 'Investment Thesis', color: 'var(--presence)' }],
  blocks: [
    {
      type: 'thesis',
      col: 8,
      id: 'thesis',
      delay: 0,
      props: {
        reasoning:
          'Rates come down through Q3, and tech benefits disproportionately — especially AI infrastructure.',
        asOf: 'Jan 14 · Live session',
        reconsiderIf: '10-year yield crosses 4.5% and holds',
        tripwireState: 'watching',
      },
    },
    {
      type: 'alignmentgauge',
      col: 4,
      id: 'align',
      delay: 90,
      props: {
        pct: 82,
        band: 'Tracking well',
        note: 'All three thesis conditions currently met.',
        color: 'var(--insight)',
      },
    },
    {
      type: 'standingalerts',
      col: 4,
      id: 'alerts',
      delay: 160,
      props: {
        alerts: [
          { label: '10Y yield above 4.5%', state: 'watching' },
          { label: 'Tech underperforms 3+ days', state: 'clear' },
          { label: 'Dollar (DXY) crosses 106', state: 'triggered', status: 'TRIGGERED' },
        ],
      },
    },
    {
      type: 'sourceslineage',
      col: 8,
      id: 'sources',
      delay: 220,
      props: {
        rows: [
          {
            kind: 'origin',
            label: 'Jan 14 · Live session',
            contributed: 'Created: thesis, 10Y alert, tech-vs-broad metric',
          },
          {
            kind: 'added',
            label: 'Feb 3 · Live session',
            contributed: 'Added: DXY metric + dollar-headwind alert',
          },
          {
            kind: 'linked',
            label: 'Feb 28 · Market check',
            contributed: 'Linked: NVDA as an AI-infrastructure proxy',
          },
        ],
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'docs',
  tryChip: { label: 'Show a living dashboard', route: 'topic:dashboardkit' },
  suggests: [],
  keywords: [
    { test: /living dashboard|dashboard widgets|dashboard kit/, route: 'topic:dashboardkit' },
  ],
};

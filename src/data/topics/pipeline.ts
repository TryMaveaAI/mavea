// "Your pipeline and forecast", weighted pipeline by stage, forecast-vs-closed trend,
// the two enterprise deals that decide the quarter, and the win-rate/coverage KPIs.
import type { ConversationSpec } from '../conversation';

export const pipeline: ConversationSpec = {
  id: 'pipeline',
  workspace: 'Pipeline outlook',
  title: 'Your pipeline and forecast',
  sub: 'Where the next quarter of revenue is sitting.',
  opener: '$21.6M weighted, and the forecast holds at $8.8M. Two deals decide the quarter.',
  switchSay: "Let's look at the pipeline.",
  gather: 'Weighting the open deals',
  found: 'Healthy coverage, two deals to watch.',
  tint: '#3ed8a6',
  context: [
    { name: 'CRM export.csv', color: 'var(--insight)' },
    { name: 'Forecast model.xlsx', color: 'var(--presence-soft)' },
    { name: 'Deal notes', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'weighted',
      num: '1',
      delay: 0,
      props: {
        title: 'Weighted pipeline is $21.6M',
        stat: '$21.6M',
        delta: '3.2× coverage',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Above the 3× rule of thumb, enough to cover the forecast with room to spare.',
        sources: [{ file: 'CRM export.csv' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'forecast',
      num: '2',
      delay: 90,
      props: {
        title: "Q1'26 forecast lands at $8.8M",
        stat: '$8.8M',
        delta: 'on plan',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'Closed is tracking just under forecast, the gap is two enterprise deals.',
        sources: [{ file: 'Forecast model.xlsx' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'winrate',
      num: '3',
      delay: 180,
      props: {
        title: 'Win rate climbed to 31%',
        stat: '31%',
        delta: 'up',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Average deal size is up to $58k too, bigger deals, closing more often.',
        sources: [{ file: 'CRM export.csv' }],
      },
    },
    {
      type: 'pipeline',
      col: 5,
      delay: 260,
      props: {
        title: 'By stage · weighted',
        icon: 'layers',
        iconColor: 'var(--presence-soft)',
        headline: '$21.6M',
        sub: 'weighted pipeline',
        unit: '$',
        suffix: 'M',
        stages: [
          { k: 'Discovery', v: 8.2 },
          { k: 'Evaluation', v: 6.1 },
          { k: 'Proposal', v: 4.4 },
          { k: 'Commit', v: 2.9 },
        ],
        footer: 'A healthy funnel, narrowing cleanly toward Commit.',
      },
    },
    {
      type: 'chart',
      col: 7,
      delay: 320,
      props: {
        title: 'Forecast vs. closed',
        unit: '$',
        labels: ["Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"],
        series: [
          { name: 'Forecast', color: 'var(--insight)', data: [5.1, 5.9, 6.6, 7.4, 8.8] },
          {
            name: 'Closed',
            color: 'var(--text-muted)',
            data: [4.6, 5.2, 5.9, 6.7, 7.0],
            area: false,
          },
        ],
        footer:
          'Closed ($M) trails forecast by ~$1.8M, the two open enterprise deals close the gap.',
      },
    },
    {
      type: 'list',
      col: 7,
      delay: 380,
      props: {
        title: 'The deals that decide it',
        icon: 'table',
        iconColor: 'var(--insight)',
        items: [
          '<b>Vertex Manufacturing</b> · Enterprise · $420k, Commit · <mark>80%</mark>',
          '<b>Lumen Health System</b> · Enterprise · $310k, Proposal · 60%',
          '<b>Atlas Logistics</b> · Mid-market · $140k, Evaluation · 45%',
          '<b>Bright & Co.</b> · Mid-market · $96k, Commit · <mark>75%</mark>',
        ],
      },
    },
    {
      type: 'kpi',
      col: 5,
      delay: 440,
      props: {
        title: 'Pipeline health',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 1,
        kpis: [
          { val: '31%', label: 'Win rate', color: 'var(--insight)' },
          { val: '$58k', label: 'Avg deal', color: 'var(--insight)' },
          { val: '3.2×', label: 'Coverage' },
        ],
        footer: 'Win rate and deal size both up; coverage is the one to keep building.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a pipeline summary for the team.",
      props: {
        kicker: 'PIPELINE · Q1',
        head: '$8.8M forecast, two deals to close',
        foot: 'Made by Mavéa · from the CRM',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>$21.6M weighted pipeline</b> at 3.2× coverage, above the rule of thumb.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Win rate 31%, avg deal $58k</b>, both trending up.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Vertex + Lumen ($730k)</b> decide whether the quarter hits plan.',
          },
        ],
      },
    },
  },

  group: 'docs',
  tryChip: { label: "What's in the pipeline?", route: 'topic:pipeline' },
  suggests: [
    { label: 'Make a pipeline summary', icon: 'slides', route: 'slide', lead: 'Try' },
    { label: 'Back to the board story', icon: 'chart', route: 'topic:revenue' },
    { label: 'Are we hiring fast enough?', icon: 'layers', route: 'topic:hiring' },
    { label: "What's the runway?", icon: 'table', route: 'topic:runway' },
  ],
  keywords: [
    {
      test: /pipeline|forecast|deals|win rate|coverage|outlook|sales outlook/,
      route: 'topic:pipeline',
    },
  ],
};

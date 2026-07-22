// "How compound interest works", a plain-English lesson: the one idea, the four-beat loop,
// a 30-year growth chart, sources, and a keepable study card.
import type { ConversationSpec } from '../conversation';

export const explain: ConversationSpec = {
  id: 'explain',
  workspace: 'Compound interest',
  title: 'How compound interest works',
  sub: 'The short version, with the one idea that matters.',
  opener: 'Interest earns interest. That loop is the whole magic. Watch it build.',
  switchSay: 'Sure, let me explain it simply.',
  gather: 'Putting it in plain terms',
  found: 'One idea does all the work. Let me show you.',
  tint: '#4fc3e8',
  context: [
    { name: 'Plain-English mode', color: 'var(--presence-soft)' },
    { name: 'Your numbers', color: 'var(--insight)' },
    { name: '30-year horizon', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 12,
      id: 'idea',
      num: '1',
      delay: 0,
      props: {
        title: 'The one idea: your interest earns its own interest',
        conf: 'strong',
        summary:
          'Save a little, it earns a little. Next year, that earning earns too. The snowball is the whole point.',
        sources: [{ file: 'Plain-English mode' }],
      },
    },
    {
      type: 'flow',
      col: 12,
      delay: 120,
      id: 'flow',
      props: {
        title: 'The loop, in four beats',
        icon: 'sparkle',
        steps: [
          { title: 'You add money', sub: 'Say $200 this month.', color: 'var(--presence)' },
          {
            title: 'It earns interest',
            sub: 'A small % is added on top.',
            color: 'var(--presence-soft)',
          },
          {
            title: 'Interest joins the pile',
            sub: 'Now your balance is bigger.',
            color: 'var(--insight)',
          },
          {
            title: 'Next round earns more',
            sub: 'Same %, bigger base, repeat.',
            color: 'var(--insight)',
          },
        ],
        footer: 'Nothing fancy, the same loop, running quietly for years.',
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 220,
      id: 'grow',
      props: {
        title: '$200 / month at 7%, what time does',
        unit: '$',
        labels: ['Now', 'Yr 5', 'Yr 10', 'Yr 20', 'Yr 30'],
        series: [
          {
            name: 'With compounding',
            color: 'var(--insight)',
            data: [0, 14000, 35000, 104000, 244000],
          },
          {
            name: 'Just your deposits',
            color: 'var(--text-muted)',
            data: [0, 12000, 24000, 48000, 72000],
            area: false,
          },
        ],
        footer:
          'You put in $72k. Compounding turns it into ~$244k, the gap is interest on interest.',
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'time',
      num: '2',
      delay: 300,
      props: {
        title: 'Time matters more than amount',
        stat: '30 yrs',
        delta: 'is the lever',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'Starting earlier beats saving more later. The early years do the heavy lifting.',
        sources: [{ file: '30-year horizon' }],
      },
    },
    {
      type: 'list',
      col: 12,
      delay: 360,
      props: {
        title: "Where you've already seen this",
        icon: 'layers',
        items: [
          'A savings account that grows faster each year',
          'Your retirement fund snowballing',
          'Debt working the same way, in reverse, against you',
        ],
      },
    },
    {
      type: 'web',
      col: 12,
      delay: 420,
      props: {
        title: 'If you want the source',
        live: false,
        results: [
          {
            domain: 'investopedia.com',
            color: 'var(--presence)',
            title: 'Compound interest, explained',
            excerpt:
              '“Interest calculated on the initial principal <mark>and the accumulated interest</mark> of prior periods.”',
          },
          {
            domain: 'sec.gov',
            path: ' · investor.gov',
            color: 'var(--insight)',
            title: 'Compound interest calculator',
            excerpt:
              'Official calculator to plug in <mark>your own numbers</mark> and see the curve.',
          },
        ],
      },
    },
    {
      type: 'plot',
      col: 7,
      delay: 480,
      props: {
        title: 'Why it runs away: linear vs. squared vs. exponential',
        icon: 'chart',
        iconColor: 'var(--presence)',
        xLabel: 'years',
        yLabel: 'growth',
        xDomain: [0, 4],
        yDomain: [0, 16],
        origin: true,
        curves: [
          {
            label: 'y = x  (simple)',
            color: 'var(--text-muted)',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
              { x: 2, y: 2 },
              { x: 3, y: 3 },
              { x: 4, y: 4 },
            ],
          },
          {
            label: 'y = x²',
            color: 'var(--insight)',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
              { x: 2, y: 4 },
              { x: 3, y: 9 },
              { x: 4, y: 16 },
            ],
          },
          {
            label: 'y = 2ˣ  (compounding)',
            color: 'var(--presence)',
            points: [
              { x: 0, y: 1 },
              { x: 1, y: 2 },
              { x: 2, y: 4 },
              { x: 3, y: 8 },
              { x: 4, y: 16 },
            ],
          },
        ],
        markers: [{ x: 2, y: 4, label: '(2, 4)' }],
        footer:
          'All three pass through <b>(2, 4)</b>, but past it, 2ˣ pulls away. Compounding is exponential, which is why it eventually beats any fixed rate.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Making a study card',
      say: "Here's a study card you can keep.",
      props: {
        kicker: 'STUDY CARD',
        head: 'Compound interest, in one card',
        foot: 'Made by Mavéa · plain-English mode',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Interest earns interest</b>, your balance grows on top of past growth.',
          },
          {
            color: 'var(--presence)',
            text: '<b>$200/mo at 7% → ~$244k in 30 years</b>, from just $72k deposited.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Start early</b>: time matters more than the amount you put in.',
          },
        ],
      },
    },
  },

  group: 'learn',
  tryChip: { label: 'Explain compound interest', route: 'topic:explain' },
  suggests: [
    { label: 'Show me how $200/mo grows', icon: 'chart', route: 'explain:grow', lead: 'Try' },
    { label: 'Make me a study card', icon: 'slides', route: 'slide' },
    { label: 'How should I budget?', icon: 'sparkle', route: 'topic:money' },
    { label: "How's the business?", icon: 'layers', route: 'topic:biz' },
  ],
  intents: {
    grow: {
      kind: 'spotlight',
      spotId: 'grow',
      say: 'Watch the gap: you put in $72k, compounding makes it ~$244k.',
    },
  },
  keywords: [
    {
      test: /\bexplain\b|teach me|eli5|understand how|compound interest|how (do|does).*(work|compound|grow)/,
      route: 'topic:explain',
      sub: [{ test: /grow|example|how much|show me how|\$/, route: 'explain:grow' }],
    },
  ],
};

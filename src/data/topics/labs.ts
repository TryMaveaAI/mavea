// labs.ts, "Explain my blood test" (content.md §2.2).
// Enriched: insight + kpi (key numbers) + ring (per-marker in-range gauges) + chart + list + EvidenceDrawer.
// Honesty discipline: non-diagnosis assumption, inferred/strong confidence kept honest.
import type { ConversationSpec } from '../conversation';

export const labs: ConversationSpec = {
  id: 'labs',
  workspace: 'Your lab results',
  title: 'Your blood test, in plain words',
  sub: 'Most of it looks healthy. One number is worth a small change.',
  opener:
    "Most of it looks healthy. One number is worth a small change. I'm not a doctor, but here's what your files say.",
  switchSay: "Okay, let's read your lab results together.",
  tint: '#54c7c0',
  context: [
    { name: 'Lab results.pdf', color: 'var(--insight)' },
    { name: "Last year's panel", color: 'var(--text-muted)' },
    { name: 'Reference ranges', color: 'var(--presence-soft)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'overall',
      num: '1',
      delay: 0,
      props: {
        title: 'Most markers are squarely in range',
        stat: '9 of 11',
        conf: 'strong',
        summary: 'Cholesterol, blood sugar, and kidney markers all look normal.',
        sources: [{ file: 'Lab results.pdf' }],
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 90,
      props: {
        title: 'Your headline numbers',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 4,
        kpis: [
          { val: '182', label: 'Cholesterol · mg/dL' },
          { val: '91', label: 'Glucose · mg/dL' },
          { val: '22', label: 'Vitamin D · ng/mL', color: 'var(--warning)' },
          { val: '14.2', label: 'Hemoglobin · g/dL', color: 'var(--insight)' },
        ],
        footer: 'Three of four are comfortably in range, Vitamin D is the one to nudge.',
      },
    },
    {
      type: 'ring',
      col: 5,
      delay: 180,
      props: {
        title: 'How each marker sits in its range',
        icon: 'shield',
        iconColor: 'var(--insight)',
        rings: [
          {
            pct: 0.82,
            display: '182',
            unit: 'mg/dL',
            label: 'Cholesterol',
            hint: 'well under 200',
            color: 'var(--insight)',
          },
          {
            pct: 0.74,
            display: '91',
            unit: 'mg/dL',
            label: 'Glucose',
            hint: 'healthy fasting',
            color: 'var(--presence)',
          },
          {
            pct: 0.44,
            display: '22',
            unit: 'ng/mL',
            label: 'Vitamin D',
            hint: 'below floor',
            color: 'var(--warning)',
          },
        ],
        footer: 'Each ring is how far into the healthy range you sit, fuller is better.',
      },
    },
    {
      type: 'insight',
      col: 3,
      id: 'vitd',
      num: '2',
      delay: 260,
      prove: true,
      props: {
        title: 'Vitamin D is on the low side',
        stat: '22 ng/mL',
        delta: 'range 30–50',
        deltaDir: 'up',
        conf: 'strong',
        summary: "It's been drifting down since last winter, common and usually easy to nudge up.",
        sources: [{ file: 'Lab results.pdf', loc: 'Vit D row' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'trend',
      num: '3',
      delay: 320,
      props: {
        title: 'Iron is fine but trending down',
        stat: '-',
        conf: 'inferred',
        summary: 'Still normal; worth a recheck next panel, not a worry today.',
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 380,
      props: {
        title: 'Vitamin D over the last year',
        unit: '',
        labels: ['Jun', 'Sep', 'Dec', 'Mar'],
        series: [
          { name: 'Your level', color: 'var(--presence)', data: [34, 29, 24, 22] },
          {
            name: 'Healthy floor',
            color: 'var(--text-muted)',
            data: [30, 30, 30, 30],
            area: false,
          },
        ],
        footer:
          'You crossed below the healthy floor over the darker months, a familiar winter dip.',
      },
    },
    {
      type: 'list',
      col: 4,
      delay: 440,
      props: {
        title: 'Gentle, non-medical ideas',
        icon: 'check',
        items: [
          'Ask your doctor before any supplement',
          'A little more midday sunlight',
          'Foods: oily fish, eggs, fortified milk',
          'Recheck on your next routine panel',
        ],
      },
    },
    {
      type: 'doseladder',
      col: 8,
      id: 'doseladder',
      delay: 540,
      props: {
        title: 'Titration schedule',
        icon: 'shield',
        iconColor: 'var(--insight)',
        drug: 'Gabapentin',
        route: 'oral',
        caption: 'Adult · neuropathic pain',
        computed: {
          input: 'Weight 70 kg',
          formula: '300 mg ÷ 3 doses',
          result: '100 mg three times daily',
        },
        ladder: [
          {
            step: 'Day 1',
            dose: '300 mg at bedtime',
            note: 'Start low to limit drowsiness and dizziness.',
          },
          { step: 'Day 2', dose: '300 mg twice daily' },
          {
            step: 'Day 3',
            dose: '300 mg three times daily',
            note: 'Steady the dose before climbing further.',
          },
          {
            step: 'Week 2',
            dose: '600 mg three times daily',
            note: 'Increase as tolerated to control pain.',
          },
          {
            step: 'Maximum',
            dose: '1,200 mg three times daily',
            note: 'Do not exceed 3,600 mg per day.',
            ceiling: true,
          },
        ],
        adjustments: [
          { condition: 'eGFR 30–59', change: 'Max 1,400 mg/day' },
          { condition: 'eGFR 15–29', change: 'Max 700 mg/day' },
          { condition: 'eGFR < 15', change: 'Max 300 mg/day' },
        ],
        footer:
          'Titrate to the lowest effective dose; renal function sets the ceiling, so check eGFR before each step up.',
      },
    },
  ],
  proof: {
    spotId: 'vitd',
    say: "Here's the Vitamin D row against the lab's own range and your past panels.",
    claim: 'Vitamin D is on the low side',
    conf: 'strong',
    file: { label: 'Lab results.pdf', type: 'pdf', loc: 'Vit D row · p2' },
    rows: [
      { a: 'Your result', b: 'this panel', c: '22 ng/mL', hot: true },
      { a: 'Reference low', b: 'lab range', c: '30 ng/mL' },
      { a: 'Last year', b: 'Jun panel', c: '34 ng/mL' },
      { a: 'Six months ago', b: 'Dec', c: '24 ng/mL', hot: true },
    ],
    note: "Your <mark>22 ng/mL</mark> sits below the lab's own <mark>30 ng/mL</mark> floor, and has fallen each panel, that's why it's flagged.",
    assumptions: [
      "This reads your lab's printed reference ranges; a clinician may interpret them differently.",
      'Mavéa is not a medical diagnosis, please confirm anything that matters with your doctor.',
    ],
  },
  extras: {},

  group: 'health',
  tryChip: { label: 'Explain my blood test', route: 'topic:labs' },
  suggests: [
    { label: 'Which number matters?', icon: 'sparkle', route: 'labs:vitd', lead: 'Try' },
    { label: 'Show your sources', icon: 'proof', route: 'labs:prove' },
    { label: "How's my sleep?", icon: 'sparkle', route: 'topic:sleep' },
    { label: 'Back to my money', icon: 'chart', route: 'topic:money' },
  ],
  intents: {
    vitd: {
      kind: 'spotlight',
      spotId: 'vitd',
      say: "Vitamin D, it's drifted below the healthy floor. Everything else reads normal.",
    },
    prove: { kind: 'proof' },
  },
  keywords: [
    {
      // word-boundary anchored; disjoint from the other new topics
      test: /\b(blood|labs?|cholesterol|vitamin|panel)\b|blood test|lab results/,
      route: 'topic:labs',
      sub: [
        { test: /\bworry\b|which.*number|vitamin d|\blow\b/, route: 'labs:vitd' },
        { test: /\bsure\b|\bprove\b|\bsource\b/, route: 'labs:prove' },
      ],
    },
  ],
};

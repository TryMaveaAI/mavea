// Math & stats for majors — showcase topic exercising the new math/stats block library.
// Every block in this topic is a representative demo for the gallery.
import type { ConversationSpec } from '../conversation';

export const math: ConversationSpec = {
  id: 'math',
  workspace: 'Math & Statistics',
  title: 'Advanced math and statistics tools',
  sub: 'Visualizations for university-level math and stats coursework.',
  opener:
    'Here are the advanced math and statistics visualization tools — from distributions to dynamical systems.',
  switchSay: "Let's explore math and stats.",
  gather: 'Reading your topic',
  found: 'Rich visual library for math and statistics',
  tint: '#6c63ff',
  context: [],
  proof: null,
  extras: {},
  group: 'learn',
  suggests: [
    { label: 'Show me a phase portrait', icon: 'chart', route: 'topic:math' },
    { label: 'Explain the Central Limit Theorem', icon: 'sparkle', route: 'topic:math' },
  ],
  keywords: [
    {
      test: /violin\s?plot|stem.?leaf|surface plot|phase portrait|taylor series|polar plot|area model|normal q.?q|sampling distribution|gridtransform|two.?column proof/i,
      route: 'topic:math',
    },
  ],
  blocks: [
    {
      type: 'violinplot',
      col: 8,
      delay: 0,
      props: {
        title: 'Exam score distributions by section',
        icon: 'chart',
        iconColor: 'var(--presence)',
        showBox: true,
        unit: 'points',
        groups: [
          {
            label: 'Section A',
            color: 'var(--presence)',
            values: [62, 68, 71, 74, 75, 76, 78, 79, 80, 81, 82, 84, 85, 87, 89, 91, 93],
          },
          {
            label: 'Section B',
            color: 'var(--insight)',
            values: [55, 60, 63, 67, 70, 72, 73, 74, 75, 77, 80, 82, 83, 85, 88, 92, 95],
          },
          {
            label: 'Section C',
            color: 'var(--warning)',
            values: [70, 72, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
          },
        ],
      },
    },
    {
      type: 'stemleafplot',
      col: 4,
      delay: 60,
      props: {
        title: 'Quiz scores (n=20)',
        values: [42, 55, 58, 61, 63, 67, 68, 71, 74, 75, 76, 78, 79, 82, 84, 85, 87, 91, 93, 97],
        leafUnit: 1,
      },
    },
    {
      type: 'qqplot',
      col: 6,
      delay: 120,
      props: {
        title: 'Normality check — exam residuals',
        icon: 'chart',
        iconColor: 'var(--insight)',
        values: [
          -2.1, -1.8, -1.4, -1.1, -0.9, -0.7, -0.5, -0.3, -0.1, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.3,
          1.6, 1.9, 2.3,
        ],
        xlabel: 'Theoretical quantiles',
        ylabel: 'Sample quantiles',
      },
    },
    {
      type: 'samplingdistribution',
      col: 6,
      delay: 180,
      props: {
        title: 'Central Limit Theorem demo',
        icon: 'chart',
        iconColor: 'var(--presence)',
        population: { shape: 'skewed' },
        sampleSize: 30,
        numSamples: 200,
      },
    },
    {
      type: 'surfaceplot',
      col: 8,
      delay: 240,
      props: {
        title: 'f(x,y) = sin(x)·cos(y) — contour map',
        icon: 'chart',
        iconColor: 'var(--warning)',
        mode: 'contour',
        levels: 8,
        xLabel: 'x',
        yLabel: 'y',
        zLabel: 'z',
        grid: [
          [1.0, 0.54, -0.42, -0.99, -0.65, 0.28, 0.96, 0.75],
          [0.84, 0.45, -0.35, -0.83, -0.54, 0.23, 0.81, 0.63],
          [0.14, 0.08, -0.06, -0.14, -0.09, 0.04, 0.13, 0.1],
          [-0.76, -0.41, 0.32, 0.75, 0.49, -0.21, -0.73, -0.57],
          [-1.0, -0.54, 0.42, 0.99, 0.65, -0.28, -0.96, -0.75],
          [-0.84, -0.45, 0.35, 0.83, 0.54, -0.23, -0.81, -0.63],
          [-0.14, -0.08, 0.06, 0.14, 0.09, -0.04, -0.13, -0.1],
          [0.76, 0.41, -0.32, -0.75, -0.49, 0.21, 0.73, 0.57],
        ],
        caption: 'Color maps z from −1 (blue) to +1 (red); isolines at 8 levels.',
      },
    },
    {
      type: 'phaseportrait',
      col: 6,
      delay: 300,
      props: {
        title: 'Harmonic oscillator: dx/dt=y, dy/dt=−x',
        icon: 'chart',
        iconColor: 'var(--insight)',
        fx: 'y',
        gy: '-x',
        xDomain: [-3, 3],
        yDomain: [-3, 3],
        showNullclines: true,
        trajectories: [
          { x0: 2, y0: 0 },
          { x0: 1, y0: 0 },
        ],
        xlabel: 'x',
        ylabel: 'y',
      },
    },
    {
      type: 'gridtransform',
      col: 6,
      delay: 360,
      props: {
        title: 'Linear transformation [[2,1],[0,1]]',
        icon: 'chart',
        iconColor: 'var(--presence)',
        matrix: [
          [2, 1],
          [0, 1],
        ],
        showEigens: true,
        animated: true,
      },
    },
    {
      type: 'taylorseries',
      col: 6,
      delay: 420,
      props: {
        title: 'Taylor series: sin(x) at x=0',
        icon: 'chart',
        iconColor: 'var(--warning)',
        fn: 'sin',
        center: 0,
        maxTerms: 7,
        showError: true,
      },
    },
    {
      type: 'polarplot',
      col: 6,
      delay: 480,
      props: {
        title: 'Rose curve: r = cos(3θ)',
        icon: 'chart',
        iconColor: 'var(--insight)',
        curves: [{ fn: 'cos(3*t)', label: 'r = cos(3θ)', color: 'var(--presence)' }],
        domain: [0, Math.PI],
      },
    },
    {
      type: 'twocolumnproof',
      col: 8,
      delay: 540,
      props: {
        title: 'Proof: vertical angles are congruent',
        given: '∠1 and ∠2 are vertical angles formed by two intersecting lines',
        prove: '∠1 ≅ ∠2',
        steps: [
          {
            statement: '∠1 and ∠3 are supplementary',
            reason: 'Linear pair postulate (they form a straight line)',
          },
          { statement: '∠2 and ∠3 are supplementary', reason: 'Linear pair postulate' },
          {
            statement: 'm∠1 + m∠3 = 180°',
            reason: 'Definition of supplementary angles',
          },
          {
            statement: 'm∠2 + m∠3 = 180°',
            reason: 'Definition of supplementary angles',
          },
          { statement: 'm∠1 + m∠3 = m∠2 + m∠3', reason: 'Substitution property' },
          { statement: 'm∠1 = m∠2', reason: 'Subtraction property of equality' },
          { statement: '∠1 ≅ ∠2', reason: 'Definition of congruent angles ∎' },
        ],
      },
    },
    {
      type: 'areamodel',
      col: 4,
      delay: 600,
      props: {
        title: 'Area model: (x + 3)(x + 2)',
        icon: 'chart',
        iconColor: 'var(--presence)',
        factorA: [1, 3],
        factorB: [1, 2],
        labelsA: ['x', '3'],
        labelsB: ['x', '2'],
        showSum: true,
      },
    },
    {
      type: 'parallelcoordinates',
      col: 8,
      delay: 660,
      props: {
        title: 'Iris dataset: four measurements, three species',
        icon: 'sliders',
        iconColor: 'var(--insight)',
        axes: [
          { key: 'sepalLength', label: 'Sepal length' },
          { key: 'sepalWidth', label: 'Sepal width' },
          { key: 'petalLength', label: 'Petal length' },
          { key: 'petalWidth', label: 'Petal width' },
        ],
        lines: [
          {
            label: 'setosa',
            color: 'var(--presence)',
            values: { sepalLength: 5.1, sepalWidth: 3.5, petalLength: 1.4, petalWidth: 0.2 },
          },
          {
            label: 'versicolor',
            color: 'var(--insight)',
            values: { sepalLength: 6.4, sepalWidth: 3.2, petalLength: 4.5, petalWidth: 1.5 },
          },
          {
            label: 'virginica',
            color: 'var(--warning)',
            values: { sepalLength: 6.9, sepalWidth: 3.1, petalLength: 5.4, petalWidth: 2.1 },
          },
        ],
      },
    },
    {
      type: 'primefactortree',
      col: 5,
      delay: 660,
      props: {
        title: 'Prime factorization of 360',
        icon: 'share',
        iconColor: 'var(--insight)',
        number: 360,
        nodes: [
          {
            value: 360,
            isPrime: false,
            children: [
              {
                value: 8,
                isPrime: false,
                children: [
                  { value: 2, isPrime: true },
                  {
                    value: 4,
                    isPrime: false,
                    children: [
                      { value: 2, isPrime: true },
                      { value: 2, isPrime: true },
                    ],
                  },
                ],
              },
              {
                value: 45,
                isPrime: false,
                children: [
                  {
                    value: 9,
                    isPrime: false,
                    children: [
                      { value: 3, isPrime: true },
                      { value: 3, isPrime: true },
                    ],
                  },
                  { value: 5, isPrime: true },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      type: 'numbersequence',
      col: 8,
      delay: 660,
      props: {
        title: 'The Fibonacci sequence',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        kind: 'fibonacci',
        terms: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
        rule: 'Each term is the sum of the two terms before it.',
        highlightPattern: true,
      },
    },
    {
      type: 'constantcard',
      col: 4,
      delay: 720,
      props: {
        title: 'Pi',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        symbol: 'π',
        value: '3.14159265358979323846',
        digitsShown: 10,
        significance:
          'The ratio of a circle’s circumference to its diameter — the same for every circle, no matter the size, and it never repeats or terminates.',
        visual: 'circle',
      },
    },
    {
      type: 'constantcard',
      col: 4,
      delay: 780,
      props: {
        title: 'The golden ratio',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        symbol: 'φ',
        value: '1.61803398874989484820',
        digitsShown: 8,
        significance:
          'Two quantities are in the golden ratio when their ratio equals the ratio of their sum to the larger one. It shows up in spirals, art, and architecture.',
        visual: 'spiral',
      },
    },
    {
      type: 'baseconversion',
      col: 6,
      delay: 660,
      props: {
        title: 'Number systems: 210 in base 2, 8, 16',
        icon: 'chart',
        iconColor: 'var(--insight)',
        value: '210',
        bases: [
          { label: 'Binary', radix: 2, digits: '11010010' },
          { label: 'Octal', radix: 8, digits: '322' },
          { label: 'Decimal', radix: 10, digits: '210' },
          { label: 'Hexadecimal', radix: 16, digits: 'D2' },
        ],
        footer: 'Every row is the same value — only the place-value system changes.',
      },
    },
  ],
};

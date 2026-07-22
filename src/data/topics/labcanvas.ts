// labcanvas.ts — showcase for the newest analytical & academic blocks (the 600-block wave).
// A fixture conversation that exercises the science, math, logic, engineering, and civics
// visuals so each renders in #/gallery and seeds a model-facing reference example. Real
// user demos are the baked Live sessions in src/demo/; these specs are coverage fixtures.
import type { ConversationSpec } from '../conversation';

export const labcanvas: ConversationSpec = {
  id: 'labcanvas',
  workspace: 'Lab canvas',
  title: 'Analysis & academics, drawn out',
  sub: 'Stars, soil, seats, proofs, classes, energy, chromosomes, and the math behind them.',
  opener:
    'Here is a spread of analytical visuals — from the Hertzsprung–Russell diagram to a forest plot.',
  switchSay: 'Let me lay out the analysis.',
  tint: '#6f7bd6',
  context: [
    { name: 'Textbook figures', color: 'var(--presence-soft)' },
    { name: 'Worked examples', color: 'var(--insight)' },
    { name: 'Reference data', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'hrdiagram',
      col: 8,
      id: 'lab-hrdiagram',
      delay: 0,
      props: {
        title: 'Bright neighbors on the H–R diagram',
        icon: 'sun',
        stars: [
          { name: 'Rigel', tempK: 12100, luminosity: 120000, stage: 'supergiant' },
          { name: 'Deneb', tempK: 8525, luminosity: 196000, stage: 'supergiant' },
          { name: 'Betelgeuse', tempK: 3600, luminosity: 126000, stage: 'supergiant' },
          { name: 'Spica', tempK: 22400, luminosity: 20500, stage: 'main-sequence' },
          { name: 'Aldebaran', tempK: 3900, luminosity: 439, stage: 'giant' },
          { name: 'Arcturus', tempK: 4286, luminosity: 170, stage: 'giant' },
          { name: 'Pollux', tempK: 4666, luminosity: 43, stage: 'giant' },
          { name: 'Vega', tempK: 9602, luminosity: 40, stage: 'main-sequence' },
          { name: 'Sirius A', tempK: 9940, luminosity: 25.4, stage: 'main-sequence' },
          { name: 'Alpha Centauri A', tempK: 5790, luminosity: 1.52, stage: 'main-sequence' },
          { name: 'Tau Ceti', tempK: 5344, luminosity: 0.52, stage: 'main-sequence' },
          { name: 'Sirius B', tempK: 25200, luminosity: 0.056, stage: 'white-dwarf' },
          { name: "Barnard's Star", tempK: 3134, luminosity: 0.0035, stage: 'main-sequence' },
          { name: 'Proxima Centauri', tempK: 3042, luminosity: 0.0017, stage: 'main-sequence' },
          { name: 'Procyon B', tempK: 7740, luminosity: 0.00049, stage: 'white-dwarf' },
        ],
        highlight: 'Betelgeuse',
        footer:
          'Stars spend ~90% of their lives on the diagonal main sequence fusing hydrogen — Betelgeuse has already left it, swelling into a red supergiant.',
      },
    },
    {
      type: 'ternaryplot',
      col: 6,
      id: 'lab-ternaryplot',
      delay: 80,
      props: {
        title: 'Soil texture triangle',
        icon: 'layers',
        unit: '%',
        axes: { a: 'Clay', b: 'Sand', c: 'Silt' },
        zones: [
          {
            label: 'Clay',
            vertices: [
              { a: 100, b: 0, c: 0 },
              { a: 55, b: 45, c: 0 },
              { a: 40, b: 45, c: 15 },
              { a: 40, b: 20, c: 40 },
              { a: 60, b: 0, c: 40 },
            ],
          },
          {
            label: 'Loam',
            vertices: [
              { a: 27, b: 45, c: 28 },
              { a: 7, b: 52, c: 41 },
              { a: 7, b: 43, c: 50 },
              { a: 27, b: 23, c: 50 },
            ],
          },
          {
            label: 'Sand',
            vertices: [
              { a: 0, b: 100, c: 0 },
              { a: 10, b: 90, c: 0 },
              { a: 0, b: 85, c: 15 },
            ],
          },
          {
            label: 'Silt',
            vertices: [
              { a: 0, b: 20, c: 80 },
              { a: 12, b: 8, c: 80 },
              { a: 0, b: 0, c: 100 },
            ],
          },
        ],
        points: [
          { label: 'Raised bed', a: 18, b: 42, c: 40 },
          { label: 'Backyard subsoil', a: 48, b: 22, c: 30 },
          { label: 'Play sand', a: 3, b: 92, c: 5 },
          { label: 'Riverbank deposit', a: 8, b: 12, c: 80 },
        ],
        footer:
          'Classes simplified from the USDA texture triangle — a mason-jar settling test gives you all three percentages at home.',
      },
    },
    {
      type: 'parliamentseats',
      col: 8,
      id: 'lab-parliamentseats',
      delay: 160,
      props: {
        title: 'German Bundestag — 2021 election',
        icon: 'globe',
        parties: [
          { name: 'Linke', seats: 39, color: 'var(--presence-deep)' },
          { name: 'SPD', seats: 206, color: 'var(--danger)' },
          { name: 'Greens', seats: 118, color: 'var(--insight)' },
          { name: 'SSW', seats: 1, color: 'var(--insight-soft)' },
          { name: 'FDP', seats: 92, color: 'var(--warning)' },
          { name: 'CDU/CSU', seats: 197, color: 'var(--text-muted)' },
          { name: 'AfD', seats: 83, color: 'var(--presence)' },
        ],
        totalLabel: 'seats',
        footer: 'A majority needs 369 of 736 seats — the SPD–Green–FDP coalition combined for 416.',
      },
    },
    {
      type: 'prooftree',
      col: 9,
      id: 'lab-prooftree',
      delay: 240,
      props: {
        title: 'Natural deduction · P → R',
        icon: 'proof',
        steps: [
          { id: 'a1', statement: '[P]' },
          { id: 'p1', statement: 'P → Q' },
          { id: 'p2', statement: 'Q → R' },
          { id: 's1', statement: 'Q', rule: '→E', from: ['a1', 'p1'] },
          { id: 's2', statement: 'R', rule: '→E', from: ['s1', 'p2'] },
          { id: 's3', statement: 'P → R', rule: '→I', from: ['s2'] },
        ],
        conclusionId: 's3',
        footer:
          'Read upward: each bar is one inference, its rule named at the right. The bracketed [P] is an assumption discharged by the final →I step — the shape of every conditional proof.',
      },
    },
    {
      type: 'fishbone',
      col: 10,
      id: 'lab-fishbone',
      delay: 320,
      props: {
        title: 'Why the loaf came out dense',
        icon: 'share',
        effect: 'Dense sourdough loaf',
        categories: [
          { label: 'Starter', causes: ['Not at peak activity', 'Too little inoculation'] },
          { label: 'Flour', causes: ['Low-protein flour', 'Stale whole wheat'] },
          { label: 'Process', causes: ['Underproofed bulk', 'Degassed at shaping'] },
          { label: 'Environment', causes: ['Kitchen below 22 °C', 'Dry air crusts the dough'] },
          { label: 'Baking', causes: ['No steam in the oven', 'Baked before full preheat'] },
          { label: 'Timing', causes: ['Rushed the poke test'] },
        ],
        footer:
          'An Ishikawa fishbone groups candidate causes by category — work each rib tip-to-spine, then test the likeliest twig first.',
      },
    },
    {
      type: 'classdiagram',
      col: 12,
      id: 'lab-classdiagram',
      delay: 400,
      props: {
        title: 'A tiny 2D drawing engine',
        icon: 'layers',
        classes: [
          { name: 'Drawable', stereotype: 'interface', methods: ['+ draw(ctx): void'] },
          {
            name: 'Shape',
            stereotype: 'abstract',
            fields: ['# x: number', '# y: number'],
            methods: ['+ move(dx, dy): void', '+ area(): number'],
          },
          { name: 'Circle', fields: ['- radius: number'], methods: ['+ area(): number'] },
          {
            name: 'Rectangle',
            fields: ['- w: number', '- h: number'],
            methods: ['+ area(): number'],
          },
          {
            name: 'CanvasScene',
            fields: ['- shapes: Shape[]'],
            methods: ['+ add(s: Shape): void', '+ render(): void'],
          },
          { name: 'Viewport', fields: ['- zoom: number', '- panX: number', '- panY: number'] },
        ],
        relations: [
          { from: 'Shape', to: 'Drawable', kind: 'implements' },
          { from: 'Circle', to: 'Shape', kind: 'inheritance' },
          { from: 'Rectangle', to: 'Shape', kind: 'inheritance' },
          { from: 'CanvasScene', to: 'Shape', kind: 'aggregation', label: 'shapes *' },
          { from: 'CanvasScene', to: 'Viewport', kind: 'composition' },
          { from: 'CanvasScene', to: 'Drawable', kind: 'dependency', label: 'renders via' },
        ],
        footer:
          'Five of the six UML relation kinds in one figure: hollow triangle = inheritance (dashed when implementing an interface), filled diamond = composition, hollow diamond = aggregation, dashed open arrow = dependency.',
      },
    },
    {
      type: 'energybarchart',
      col: 8,
      id: 'lab-energybarchart',
      delay: 480,
      props: {
        title: 'Energy of a swinging pendulum',
        icon: 'refresh',
        iconColor: 'var(--presence)',
        unit: 'J',
        system: ['bob', 'Earth'],
        snapshots: [
          {
            label: 'Highest point',
            bars: [
              { kind: 'KE', value: 0 },
              { kind: 'Ug', value: 100 },
            ],
          },
          {
            label: 'Halfway down',
            bars: [
              { kind: 'KE', value: 50 },
              { kind: 'Ug', value: 50 },
            ],
          },
          {
            label: 'Lowest point',
            bars: [
              { kind: 'KE', value: 100 },
              { kind: 'Ug', value: 0 },
            ],
          },
        ],
        footer:
          'With no friction, total mechanical energy stays <strong>100 J</strong> — it just shifts between gravitational (Ug) and kinetic (KE).',
      },
    },
    {
      type: 'karyotype',
      col: 8,
      id: 'lab-karyotype',
      delay: 560,
      props: {
        title: 'Human karyotype — Trisomy 21',
        icon: 'layers',
        iconColor: 'var(--presence)',
        sex: 'XX',
        anomalies: [{ pair: '21', kind: 'trisomy', note: 'Down syndrome' }],
        highlightPairs: ['21'],
        footer:
          'A karyogram arranges the 46 chromosomes into 23 pairs. Three copies of chromosome 21 (<strong>trisomy 21</strong>) underlies Down syndrome.',
      },
    },
    {
      type: 'numberbond',
      col: 5,
      id: 'lab-numberbond',
      delay: 640,
      props: {
        title: 'Number bond for 10',
        icon: 'plus',
        iconColor: 'var(--presence)',
        whole: 10,
        parts: [6, 4],
        factFamily: true,
        label: 'Six and four make ten',
        footer:
          'Number bonds show how a <strong>whole</strong> splits into <strong>parts</strong> — the foundation of addition and subtraction fact families.',
      },
    },
    {
      type: 'posbreakdown',
      col: 6,
      id: 'lab-posbreakdown',
      delay: 720,
      props: {
        title: 'Parts of speech — one sentence, all nine classes',
        icon: 'captions',
        tokens: [
          { word: 'Wow', pos: 'interjection' },
          { word: '!', pos: 'punctuation' },
          { word: 'The', pos: 'determiner' },
          { word: 'curious', pos: 'adjective' },
          { word: 'fox', pos: 'noun', note: 'subject of the sentence' },
          { word: 'quickly', pos: 'adverb', note: "modifies the verb 'jumped'" },
          { word: 'jumped', pos: 'verb', note: 'past tense' },
          { word: 'over', pos: 'preposition' },
          { word: 'its', pos: 'determiner' },
          { word: 'sleeping', pos: 'adjective', note: 'a participle working as an adjective' },
          { word: 'rival', pos: 'noun' },
          { word: ',', pos: 'punctuation' },
          { word: 'and', pos: 'conjunction' },
          { word: 'everyone', pos: 'pronoun', note: 'an indefinite pronoun' },
          { word: 'cheered', pos: 'verb' },
          { word: '.', pos: 'punctuation' },
        ],
        sentence:
          'Wow! The curious fox quickly jumped over its sleeping rival, and everyone cheered.',
        translation:
          '¡Guau! El zorro curioso saltó rápidamente sobre su rival dormido, y todos aplaudieron.',
        footer:
          'All nine word classes in a single sentence — tap a legend chip to spotlight one class.',
      },
    },
    {
      type: 'frayermodel',
      col: 6,
      id: 'lab-frayermodel',
      delay: 800,
      props: {
        title: 'Vocabulary — Photosynthesis',
        icon: 'edit',
        iconColor: 'var(--presence)',
        term: 'Photosynthesis',
        pronunciation: '/ˌfoʊtoʊˈsɪnθəsɪs/',
        definition:
          'The process green plants and algae use to turn sunlight, water, and carbon dioxide into glucose (food) and oxygen.',
        characteristics: [
          'Needs sunlight, water, and CO₂',
          'Takes place in the chloroplasts',
          'Uses the green pigment chlorophyll',
          'Releases oxygen as a by-product',
        ],
        examples: [
          'A fern growing in a shady forest',
          'Algae in a pond',
          'A tomato plant on a windowsill',
        ],
        nonexamples: [
          'A mushroom absorbing nutrients',
          'A dog digesting its food',
          'Rust forming on an iron nail',
          'A candle burning',
        ],
        footer:
          'Non-examples sharpen the boundary: they may involve energy or gases, but none <strong>build sugar from light</strong>.',
      },
    },
    {
      type: 'forestplot',
      col: 8,
      id: 'lab-forestplot',
      delay: 880,
      props: {
        title: 'Reading a forest plot — pooled risk ratio (worked example)',
        icon: 'proof',
        measure: 'RR',
        studies: [
          { label: 'Trial A', year: 2014, effect: 0.62, ciLow: 0.38, ciHigh: 1.02 },
          { label: 'Trial B', year: 2015, effect: 0.85, ciLow: 0.61, ciHigh: 1.19 },
          { label: 'Trial C', year: 2017, effect: 0.44, ciLow: 0.21, ciHigh: 0.92 },
          { label: 'Trial D', year: 2018, effect: 0.71, ciLow: 0.55, ciHigh: 0.91 },
          { label: 'Trial E', year: 2020, effect: 1.08, ciLow: 0.74, ciHigh: 1.58 },
          { label: 'Trial F', year: 2021, effect: 0.58, ciLow: 0.35, ciHigh: 0.96 },
          { label: 'Trial G', year: 2023, effect: 0.77, ciLow: 0.62, ciHigh: 0.95 },
        ],
        heterogeneity: 'I² = 28%',
        favorsLeft: 'Favors intervention',
        favorsRight: 'Favors control',
        footer:
          "A textbook illustration of evidence synthesis: each row is one trial's risk ratio with its 95% CI, the square scales with the trial's inverse-variance weight, and the diamond's width is the pooled interval. Values are illustrative, not from real trials.",
      },
    },
    {
      type: 'cashflowtimeline',
      col: 9,
      id: 'lab-cashflowtimeline',
      delay: 960,
      props: {
        title: 'Should the workshop buy the CNC router?',
        icon: 'chart',
        iconColor: 'var(--presence)',
        flows: [
          { period: 0, amount: -50000, label: 'Purchase & install' },
          { period: 1, amount: 14000, label: 'Net annual savings' },
          { period: 2, amount: 14000, label: 'Net annual savings' },
          { period: 3, amount: 14000, label: 'Net annual savings' },
          { period: 3, amount: -8000, label: 'Mid-life overhaul' },
          { period: 4, amount: 14000, label: 'Net annual savings' },
          { period: 5, amount: 14000, label: 'Net annual savings' },
          { period: 5, amount: 6000, label: 'Salvage value' },
        ],
        periodLabel: 'Year',
        discountRate: 0.08,
        currency: '$',
        footer:
          'A worked textbook example: at an 8% hurdle rate the router clears it with an NPV of about +$3,600 — and the year-5 salvage value is what tips it positive.',
      },
    },
    {
      type: 'businesscanvas',
      col: 12,
      id: 'lab-businesscanvas',
      delay: 1040,
      props: {
        title: 'Ridgeline Coffee Roasters',
        variant: 'bmc',
        keyPartners: [
          'Smallholder farm cooperatives in Huila and Yirgacheffe',
          'Specialty green-bean importer',
          'Compostable-packaging supplier',
        ],
        keyActivities: [
          'Small-batch roasting, three profiles a week',
          'Subscription fulfillment and routing',
          'Cupping and quality control on every lot',
        ],
        keyResources: [
          '25 kg drum roaster',
          "Roastmaster's sensory expertise",
          'Subscriber taste-profile data',
        ],
        valueProposition: [
          'Peak-freshness beans at your door within 48 hours of roasting',
          'A rotating world tour of single origins, matched to your taste profile',
          'Full traceability — every bag names its farm and lot',
        ],
        customerRelationships: [
          'Taste-profile quiz personalizes each shipment',
          'Monthly virtual cupping with the roaster',
          'Pause or swap anytime, no lock-in',
        ],
        channels: [
          'Direct web subscription',
          'Farmers-market stall for tastings and signups',
          'Wholesale to local cafés',
        ],
        customerSegments: [
          'Home brewers upgrading from supermarket beans',
          'Remote workers who treat coffee as a ritual',
          'Gift subscribers',
        ],
        costStructure: [
          'Green beans and import freight',
          'Roastery lease and equipment',
          'Last-mile shipping',
        ],
        revenueStreams: [
          'Monthly subscriptions in two tiers',
          'One-off gift boxes',
          'Wholesale café accounts',
        ],
        footer:
          'Subscriptions cover the fixed roastery costs; wholesale adds the volume that keeps the roaster at capacity.',
      },
    },
  ],
  proof: null,
  extras: {},
  group: 'learn',
  suggests: [
    { label: 'Explain another figure', icon: 'chart', route: 'topic:labcanvas' },
    { label: 'Work an example', icon: 'doc', route: 'topic:study' },
  ],
  keywords: [
    {
      test: /\bh\W?r diagram\b|\bhertzsprung\b|\bternary plot\b|\bforest plot\b|\bnatural deduction\b|\buml class diagram\b|\bkaryotype\b|\bparliament seats?\b|\bnumber bond\b|\bfrayer model\b/,
      route: 'topic:labcanvas',
    },
  ],
};

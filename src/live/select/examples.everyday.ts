// Everyday-finance, glossary, and real-map block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const EVERYDAY_EXAMPLES: Record<string, Record<string, unknown>> = {
  receipt: {
    title: 'Blue Bottle Coffee',
    icon: 'table',
    iconColor: 'var(--presence)',
    merchant: 'Blue Bottle Coffee — Hayes Valley',
    date: 'Jun 9, 2026',
    lines: [
      { item: 'Gibraltar', qty: '1', unit: '$5.50', total: '$5.50' },
      { item: 'Almond croissant', qty: '1', unit: '$4.75', total: '$4.75' },
    ],
    subtotal: '$10.25',
    tax: '$0.92',
    total: '$11.17',
    footer: 'Thank you for visiting · tip not included',
  },
  settleup: {
    title: 'Team dinner — settle up',
    icon: 'table',
    iconColor: 'var(--presence)',
    people: ['Priya', 'Marcus', 'Yuki'],
    expenses: [
      { description: 'Dinner bill', amount: '$132.00', paidBy: 'Priya' },
      { description: 'Dessert & drinks', amount: '$48.00', paidBy: 'Marcus' },
    ],
    settlements: [
      { from: 'Yuki', to: 'Priya', amount: '$44.00' },
      { from: 'Marcus', to: 'Priya', amount: '$28.00' },
    ],
    footer: '$180 total · split 3 ways · 2 transfers to clear',
  },
  bracketbar: {
    title: 'Top programming languages — 2026 popularity',
    icon: 'chart',
    iconColor: 'var(--presence)',
    metric: 'Stack Overflow survey share',
    items: [
      { label: 'Python', value: 51.2, bar: '51.2%', badge: '#1' },
      { label: 'JavaScript', value: 48.7, bar: '48.7%', badge: '#2' },
      { label: 'TypeScript', value: 35.4, bar: '35.4%', badge: '#3' },
    ],
    footer: 'Source: Stack Overflow Developer Survey · multiple-choice allowed',
  },
  gloss: {
    title: 'ML glossary — bias, overfitting, regularization',
    icon: 'doc',
    iconColor: 'var(--insight)',
    domain: 'Machine Learning',
    entries: [
      {
        term: 'Bias',
        definition:
          "Systematic error from incorrect assumptions in the learning algorithm — a high-bias model underfits, missing patterns in training data. Often described as the model's simplifying assumptions.",
        see: 'Overfitting',
      },
      {
        term: 'Overfitting',
        definition:
          'When a model memorises training data too closely and fails to generalise to new examples; it scores high on training set but poorly on the test set.',
        see: 'Regularization',
      },
      {
        term: 'Regularization',
        definition:
          'Techniques (L1/Lasso, L2/Ridge, dropout) that penalise model complexity during training to reduce overfitting and improve generalisation.',
      },
    ],
    footer: '3 foundational ML terms — part of the bias–variance tradeoff framework',
  },
  // (No map/markermap/choropleth example: those fabricated-geography blocks were removed — see
  // FAKE_DATA_TYPES. Every real-world location uses `geomap`; regional data uses bars/breakdown.)
  geomap: {
    title: 'Must-see in Tokyo',
    icon: 'globe',
    iconColor: 'var(--presence)',
    markers: [
      {
        lat: 35.6595,
        lng: 139.7004,
        name: 'Shibuya Crossing',
        detail: "The world's busiest intersection",
        color: 'var(--presence)',
      },
      {
        lat: 35.7148,
        lng: 139.7967,
        name: 'Senso-ji Temple',
        detail: 'Historic temple in Asakusa',
        color: 'var(--warning)',
      },
      {
        lat: 35.6232,
        lng: 139.786,
        name: 'teamLab Planets',
        detail: 'Immersive digital art museum',
        color: 'var(--insight)',
      },
    ],
  },
  embedmap: {
    title: 'Document embeddings',
    icon: 'globe',
    iconColor: 'var(--presence)',
    clusters: [
      {
        name: 'Legal docs',
        color: 'var(--insight)',
      },
      {
        name: 'Financial reports',
        color: 'var(--warning)',
      },
      {
        name: 'Engineering specs',
        color: 'var(--presence)',
      },
      {
        name: 'Marketing materials',
        color: 'var(--presence-soft)',
      },
    ],
    points: [
      {
        x: 0.15,
        y: 0.8,
        label: 'Contract template',
        cluster: 0,
        query: false,
      },
      {
        x: 0.22,
        y: 0.75,
        label: 'IP agreement',
        cluster: 0,
        query: false,
      },
      {
        x: 0.65,
        y: 0.55,
        label: 'Q3 earnings',
        cluster: 1,
        query: false,
      },
      {
        x: 0.72,
        y: 0.5,
        label: 'Budget forecast',
        cluster: 1,
        query: false,
      },
      {
        x: 0.45,
        y: 0.3,
        label: 'API design',
        cluster: 2,
        query: false,
      },
      {
        x: 0.52,
        y: 0.25,
        label: 'Database schema',
        cluster: 2,
        query: false,
      },
      {
        x: 0.35,
        y: 0.65,
        label: 'Your query: company roadmap',
        cluster: 0,
        query: true,
      },
    ],
    footer: 'Hover any point for its title · click a legend chip to focus a cluster',
  },
};

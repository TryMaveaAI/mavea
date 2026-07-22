// "Three gift ideas for your mom", three options compared on fit, price, and delivery,
// landing on the herb garden set she's hinted at, ready to drop in the cart.
import type { ConversationSpec } from '../conversation';

export const gift: ConversationSpec = {
  id: 'gift',
  workspace: 'A gift for Mom',
  title: 'Three gift ideas for your mom',
  sub: "Built from what you've told me she loves.",
  opener: "I think the garden one wins, it fits her best. Here's why.",
  switchSay: "Aw, let's find something for your mom.",
  tint: '#e879c7',
  context: [
    { name: 'Things she loves', color: 'var(--insight)' },
    { name: 'Budget · ~$80', color: 'var(--presence-soft)' },
    { name: 'Her birthday · 9 days', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'pick',
      num: '1',
      delay: 0,
      props: {
        title: 'The garden set fits her best',
        conf: 'inferred',
        summary:
          'She mentioned starting a herb garden twice this spring, this lands on something she already wants.',
        sources: [{ file: 'Things she loves' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'budget',
      num: '2',
      delay: 90,
      props: {
        title: 'All three are within budget',
        stat: '~$80',
        delta: 'on target',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'The garden set is $72, leaves a little room for a card or delivery.',
        sources: [{ file: 'Budget' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'time',
      num: '3',
      delay: 180,
      props: {
        title: 'Order by Thursday to be safe',
        conf: 'partial',
        summary: 'Her birthday is in 9 days; standard shipping is 4–6. Thursday gives a buffer.',
        sources: [{ file: 'Her birthday' }],
      },
    },
    {
      type: 'kpi',
      col: 5,
      delay: 240,
      props: {
        title: 'The pick at a glance',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 3,
        kpis: [
          { val: '$72', label: 'Budget · of ~$80', color: 'var(--insight)' },
          { val: '4.7★', label: 'Rating', color: 'var(--insight)' },
          { val: '4–6d', label: 'Delivery' },
        ],
        footer: 'Inside budget, top-rated, and it lands with days to spare.',
      },
    },
    {
      type: 'scatter',
      col: 7,
      delay: 280,
      props: {
        title: 'Price vs. rating, finding the sweet spot',
        icon: 'spark',
        iconColor: 'var(--insight)',
        points: [
          { x: 48, y: 4.3 },
          { x: 65, y: 4.5 },
          { x: 72, y: 4.7, hot: true },
          { x: 95, y: 4.6 },
          { x: 120, y: 4.8 },
        ],
        xLabel: 'Price ($)',
        yLabel: 'Rating (★)',
        xDomain: [40, 130],
        yDomain: [4.0, 5.0],
        trend: [
          [40, 4.25],
          [130, 4.85],
        ],
        footer:
          "The herb set sits above the line, high rating for the price. That's the sweet spot.",
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 360,
      props: {
        eyebrow: "What she'd actually love",
        options: [
          { name: 'Herb garden set', sub: "$72 · she's mentioned it", pick: true },
          { name: 'Silk scarf', sub: '$65 · safe, classic' },
          { name: 'Cookbook + spices', sub: '$48 · she cooks a lot' },
        ],
        criteria: [
          {
            label: 'Matches what she wants',
            cells: [{ v: 'Exactly', win: true }, { v: 'Maybe' }, { v: 'Probably' }],
          },
          {
            label: 'Personal',
            cells: [{ v: 'Very', win: true }, { v: 'A little' }, { v: 'Somewhat' }],
          },
          {
            label: 'In budget',
            cells: [
              { v: '$72', win: true },
              { v: '$65', win: true },
              { v: '$48', win: true },
            ],
          },
          {
            label: 'Arrives in time',
            cells: [
              { v: 'If ordered Thu', win: true },
              { v: 'Yes', win: true },
              { v: 'Yes', win: true },
            ],
          },
        ],
        recommendation:
          "<b>Go with the herb garden set.</b> It's the one she's actually hinted at, that beats a safer, more generic gift almost every time.",
      },
    },
    {
      type: 'gallery',
      col: 7,
      delay: 440,
      props: {
        eyebrow: 'Options · pulled from the web',
        items: [
          {
            label: 'Indoor herb garden set · $72',
            source: 'shop',
            tag: "Mavéa's pick",
            h1: '#3ed8a6',
            h2: '#1c5a44',
          },
          { label: 'Silk scarf · $65', source: 'shop', h1: '#c46fa0', h2: '#4f2540' },
          { label: 'Cookbook + spices · $48', source: 'shop', h1: '#e0a24a', h2: '#5e3f1e' },
        ],
        footer: 'Images and prices pulled live, tap to open the listing.',
      },
    },
    {
      type: 'web',
      col: 5,
      delay: 500,
      props: {
        title: 'What reviewers say',
        live: true,
        results: [
          {
            domain: 'reviews',
            color: 'var(--insight)',
            title: 'Indoor herb garden set',
            excerpt:
              '<mark>4.7★ · 2,140 reviews.</mark> “Self-watering, looks great on a windowsill.”',
          },
          {
            domain: 'shop',
            color: 'var(--warning)',
            title: 'Delivery to her city',
            excerpt: 'Standard arrives in <mark>4–6 days</mark>, order by Thursday to be safe.',
          },
        ],
      },
    },
    {
      type: 'worthit',
      col: 6,
      delay: 640,
      props: {
        title: 'Is the premium one worth the splurge?',
        product: 'The cashmere wrap (option 1)',
        verdict: 'worth-it',
        price: '$140',
        priceNote: 'vs ~$45 for the acrylic look-alike',
        worthItIf: [
          'She wears scarves often and keeps them for years',
          'You want it to feel like a real occasion gift',
        ],
        skipIf: ['She rarely layers', 'A thoughtful card matters more than the label'],
        dealBreaker:
          'Cashmere needs hand-washing — if she would not fuss over it, the merino blend is the smarter pick.',
        forWho: 'someone who notices quality and will actually reach for it',
        bottomLine:
          'For a milestone gift the wrap earns its price; for a casual one, the blend gets 90% of the feel.',
        footer: 'Both ship in time if you order by Thursday.',
      },
    },
    {
      type: 'reviewsynth',
      col: 7,
      delay: 700,
      props: {
        title: 'What buyers say about the cashmere wrap',
        rating: 4.4,
        count: 1842,
        distribution: [1180, 410, 150, 60, 42],
        loves: [
          {
            theme: 'Feels genuinely luxe',
            freq: '68% mention',
            quote: 'Softer than scarves twice the price — it actually feels special.',
          },
          {
            theme: 'Generous, drapey size',
            freq: 'common',
            quote: 'Big enough to wrap up in on a cold flight, not a flimsy little thing.',
          },
        ],
        complaints: [
          {
            theme: 'Sheds at first',
            freq: '1 in 5',
            quote: 'Lost a few fibers the first week, then it settled down.',
          },
          {
            theme: 'Hand-wash only',
            freq: 'occasional',
            quote: 'Wish I could toss it in the machine — the care is fussy.',
          },
        ],
        dealbreaker:
          'It must be hand-washed and laid flat — if she would not fuss over it, the machine-washable merino blend is the safer gift.',
        footer: 'Synthesized from 1,842 verified-purchase reviews.',
      },
    },
    {
      type: 'sizechart',
      col: 7,
      id: 'gift-sizechart',
      delay: 120,
      props: {
        title: 'Running shoe size guide',
        icon: 'cart',
        iconColor: 'var(--presence)',
        caption: 'Unisex · true to size · measure both feet, use the larger',
        columns: ['US', 'UK', 'EU', 'cm'],
        unit: 'Foot length',
        highlight: '9.5',
        guide:
          'Stand on paper, mark heel to longest toe, and measure in centimetres — then match the cm column. If you are between sizes, size up for running.',
        rows: [
          { size: '7', values: ['7', '6', '40', '25.0'] },
          { size: '7.5', values: ['7.5', '6.5', '40.5', '25.4'] },
          { size: '8', values: ['8', '7', '41', '25.7'] },
          { size: '8.5', values: ['8.5', '7.5', '42', '26.0'] },
          { size: '9', values: ['9', '8', '42.5', '26.7'] },
          { size: '9.5', values: ['9.5', '8.5', '43', '27.0'] },
          { size: '10', values: ['10', '9', '44', '27.3'] },
          { size: '10.5', values: ['10.5', '9.5', '44.5', '27.9'] },
          { size: '11', values: ['11', '10', '45', '28.3'] },
        ],
        footer:
          'EU sizing runs a touch narrow — if your feet are wide, consider the next half size up.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Getting it ready',
      say: "I'll get the herb garden set ready to buy, you check out.",
      props: {
        eyebrow: 'Action · shopping',
        icon: 'link',
        title: 'Get the herb garden set ready to buy',
        lines: [
          { k: 'Item', v: 'Indoor herb garden set · $72' },
          { k: 'Where', v: 'You complete checkout yourself' },
        ],
        perm: 'Mavéa has no store connection, it only prepares the link. It will never buy anything for you.',
        cta: 'Get the link',
        doneText: 'Link ready — you buy',
      },
    },
  },

  group: 'decide',
  tryChip: { label: 'Find a gift for my mom', route: 'topic:gift' },
  suggests: [
    { label: 'Which one should I get?', icon: 'proof', route: 'gift:pick', lead: 'Try' },
    { label: 'Get it ready to buy', icon: 'link', route: 'send' },
    { label: 'Help me pick an apartment', icon: 'layers', route: 'topic:decision' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    pick: {
      kind: 'spotlight',
      spotId: 'pick',
      say: "The herb garden set, it's the one she's actually hinted at.",
    },
  },
  keywords: [
    {
      test: /\bgift\b|\bpresent\b|birthday|\bmom\b|mother|her birthday|for my (mom|mother)/,
      route: 'topic:gift',
      sub: [{ test: /which|pick|recommend|best|cart|order|buy/, route: 'gift:pick' }],
    },
  ],
};

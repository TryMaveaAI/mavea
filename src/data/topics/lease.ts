// lease.ts, "Did the lease change from last year?" (content.md §2.4, id 'lease').
// Enriched: insight + compare (clause diff) + breakdown (cost changes) + timeline (new key dates) + ListCard + EvidenceDrawer (pdf).
// FIX: factual diff, no `pick` on the compare (it is not a recommendation). extras:{} (no extra).
import type { ConversationSpec } from '../conversation';

export const lease: ConversationSpec = {
  id: 'lease',
  workspace: 'Lease changes',
  title: "This year's lease vs last year's",
  sub: 'Three clauses changed, two routine, one to ask about.',
  opener: "Three clauses changed. Two are routine, one I'd ask about before signing.",
  switchSay: "Let's diff this year's lease against last year's.",
  tint: '#5e9bff',
  context: [
    { name: 'Lease 2026.pdf', color: 'var(--insight)' },
    { name: 'Lease 2025.pdf', color: 'var(--text-muted)' },
    { name: 'Your highlights', color: 'var(--presence-soft)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'rent',
      num: '1',
      delay: 0,
      props: {
        title: 'Rent rose 6%, within the legal cap',
        stat: '+$108/mo',
        delta: '+6%',
        deltaDir: 'up',
        conf: 'strong',
        summary: "Last year's clause allowed up to 8%, so this is on the lower end.",
        sources: [{ file: 'Lease 2026.pdf', loc: '§4' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'pet',
      num: '2',
      delay: 90,
      prove: true,
      props: {
        title: 'A new pet fee appeared',
        stat: '$45/mo',
        conf: 'strong',
        summary: 'This clause is new this year, worth confirming it applies to you.',
        sources: [{ file: 'Lease 2026.pdf', loc: '§9' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'notice',
      num: '3',
      delay: 180,
      props: {
        title: 'Move-out notice doubled to 60 days',
        delta: '30 → 60 days',
        deltaDir: 'up',
        conf: 'strong',
        summary: "You'll need to decide earlier about renewing.",
        sources: [{ file: 'Lease 2026.pdf', loc: '§12' }],
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 260,
      props: {
        eyebrow: '2025 vs 2026, clause by clause',
        options: [{ name: 'Last year' }, { name: 'This year' }],
        criteria: [
          { label: 'Monthly rent', cells: [{ v: '$1,800' }, { v: '$1,908' }] },
          { label: 'Pet fee', cells: [{ v: 'None', win: true }, { v: '$45/mo' }] },
          { label: 'Notice to leave', cells: [{ v: '30 days', win: true }, { v: '60 days' }] },
          { label: 'Late fee', cells: [{ v: '$50' }, { v: '$50' }] },
          { label: 'Parking', cells: [{ v: 'Included' }, { v: 'Included' }] },
        ],
        recommendation:
          '<b>Two changes are routine; the new $45 pet fee is the one to question.</b> Ask whether it applies if you have no pet.',
      },
    },
    {
      type: 'breakdown',
      col: 7,
      delay: 320,
      props: {
        title: 'What changes in your monthly cost',
        icon: 'chart',
        iconColor: 'var(--warning)',
        rows: [
          {
            name: 'Rent',
            val: '+$108',
            pct: 100,
            hot: true,
            tag: '+6%',
            tagColor: 'var(--warning)',
          },
          { name: 'Pet fee (new)', val: '+$45', pct: 42, tag: 'new', tagColor: 'var(--danger)' },
          { name: 'Parking', val: '$0', pct: 0, tag: 'unchanged', tagColor: 'var(--text-muted)' },
          { name: 'Late fee', val: '$0', pct: 0, tag: 'unchanged', tagColor: 'var(--text-muted)' },
        ],
      },
    },
    {
      type: 'timeline',
      col: 5,
      delay: 380,
      props: {
        eyebrow: 'Dates the new lease puts on your calendar',
        title: 'Key dates this year',
        events: [
          {
            time: 'Now',
            title: 'Ask about the pet fee',
            tag: 'before signing',
            detail: 'Confirm whether §9 applies if you have no pet.',
            color: 'var(--warning)',
          },
          {
            time: 'Jun 30',
            title: 'Lease term begins',
            detail: 'New rent of $1,908/mo takes effect.',
            color: 'var(--presence)',
          },
          {
            time: 'Apr 30',
            title: 'Renewal decision due',
            tag: '60-day notice',
            detail: 'Notice doubled to 60 days, decide two months earlier than before.',
            color: 'var(--insight)',
          },
          {
            time: 'Jun 30',
            title: 'Lease term ends',
            detail: 'Move-out or renewal completes here.',
            color: 'var(--presence-soft)',
          },
        ],
      },
    },
    {
      type: 'list',
      col: 5,
      delay: 440,
      props: {
        title: 'Before you sign',
        icon: 'check',
        items: [
          'Confirm the pet fee applies to your unit',
          'Note the new 60-day notice on your calendar',
          'Keep both PDFs together',
          'Renewal decision is due 2 months earlier now',
        ],
      },
    },
    {
      type: 'floorplan',
      col: 8,
      delay: 540,
      props: {
        title: 'Unit 4B, floor plan',
        scale: '1 unit ≈ 1 ft',
        rooms: [
          { name: 'Living / Dining', x: 2, y: 2, w: 55, h: 45, note: '22×18 ft' },
          { name: 'Kitchen', x: 60, y: 2, w: 38, h: 28, note: '15×11 ft' },
          { name: 'Bedroom', x: 2, y: 52, w: 48, h: 44, note: '19×17 ft' },
          { name: 'Bathroom', x: 53, y: 52, w: 24, h: 44, note: '9×17 ft' },
          { name: 'Closet', x: 80, y: 52, w: 18, h: 44, note: '7×17 ft' },
        ],
      },
    },
    {
      type: 'howtosteps',
      col: 8,
      delay: 600,
      props: {
        title: 'Fix a running toilet yourself',
        icon: 'check',
        iconColor: 'var(--insight)',
        time: '15 min',
        difficulty: 'easy',
        warning: 'Turn off the water at the shutoff valve behind the toilet before you start.',
        tools: ['Adjustable pliers', 'A towel', 'Replacement flapper (~$6)'],
        steps: [
          {
            action: 'Take off the tank lid and watch a flush',
            detail:
              'See whether the flapper fails to seal or the water keeps rising past the overflow tube.',
            check: 'you can tell which part is leaking',
          },
          {
            action: 'If the flapper looks warped, swap it',
            detail:
              'Unhook the old flapper from the flush valve and clip the new one on in its place.',
            tip: 'Bring the old flapper to the store to match the size.',
            check: 'the new flapper drops flat and seals the opening',
          },
          {
            action: 'Adjust the float so the water stops below the overflow tube',
            detail: 'Turn the adjustment screw or pinch-clip down about half an inch.',
            caution: 'Set it too low and the flush goes weak — aim for ~1 inch below the tube top.',
            check: 'the tank fills, then the valve shuts off on its own',
          },
          {
            action: 'Turn the water back on and test two flushes',
            check: 'the tank refills and goes silent within a minute',
          },
        ],
        footer:
          'If it still runs after a new flapper, the flush valve seat may be worn — that one is worth a call to the landlord.',
      },
    },
    {
      type: 'spacefit',
      col: 7,
      id: 'spf-living',
      delay: 600,
      props: {
        title: 'Living room — will it fit?',
        icon: 'layers',
        iconColor: 'var(--presence)',
        room: { w: 4.8, d: 3.6, unit: 'm' },
        items: [
          { label: 'Sofa', w: 2.2, d: 0.95, x: 0.3, y: 2.5 },
          { label: 'Coffee table', w: 1.1, d: 0.6, x: 1.55, y: 1.55 },
          { label: 'TV unit', w: 1.8, d: 0.45, x: 1.5, y: 0.1 },
          { label: 'Armchair', w: 0.85, d: 0.9, x: 3.7, y: 2.55, rot: -20 },
        ],
        clearances: [
          { label: 'Sofa to coffee table', gap: 0.5 },
          { label: 'Walkway past the TV unit', gap: 1.45 },
          { label: 'Armchair to wall', gap: 0.95 },
        ],
        caption: 'Everything fits, but the sofa-to-table gap is tighter than comfortable.',
        footer:
          'The layout works, but the <b>0.5&nbsp;m sofa-to-table gap</b> is flagged — below the ~0.9&nbsp;m you want for an easy path; nudge the table forward 0.3&nbsp;m.',
      },
    },
  ],
  proof: {
    spotId: 'pet',
    say: "Here's clause §9 in both PDFs, it only exists in the 2026 file.",
    claim: 'A new pet fee appeared',
    conf: 'strong',
    file: { label: 'Lease 2026.pdf', type: 'pdf', loc: '§9 · p3' },
    rows: [
      { a: '2025 §9', b: 'Pets', c: 'not present' },
      { a: '2026 §9', b: 'Pet fee', c: '$45/mo', hot: true },
      { a: '2026 §9', b: 'applies to', c: 'all units', hot: true },
      { a: '2025 §4', b: 'Rent', c: '$1,800' },
      { a: '2026 §4', b: 'Rent', c: '$1,908' },
    ],
    note: "Clause <mark>§9</mark> exists only in the 2026 PDF and reads <mark>$45/month, all units</mark>, that's why it's flagged as new.",
    assumptions: [
      'Matching is by clause number; renumbered clauses may map imperfectly.',
      'Mavéa compares the text it can read, confirm anything binding with the landlord.',
    ],
  },
  extras: {},

  group: 'docs',
  suggests: [
    { label: "What's the new fee?", icon: 'layers', route: 'lease:pet', lead: 'Try' },
    { label: 'Show me in the lease', icon: 'proof', route: 'lease:prove' },
    { label: 'Compare two job offers', icon: 'layers', route: 'topic:offers' },
    { label: 'Back to my money', icon: 'chart', route: 'topic:money' },
  ],
  intents: {
    pet: {
      kind: 'spotlight',
      spotId: 'pet',
      say: "The new one's a $45-a-month pet fee in §9, ask whether it applies if you've no pet.",
    },
    prove: { kind: 'proof' },
  },
  keywords: [
    {
      // anchored on lease-diff proper nouns; avoids bare 'lease'/'compare' which the frozen
      // `decision` topic already owns (decision runs first, deterministic order)
      test: /\b(clause|renew|landlord|tenancy)\b|my lease|lease change|lease from last/,
      route: 'topic:lease',
      sub: [
        { test: /\b(fee|pet)\b|new clause|what changed/, route: 'lease:pet' },
        { test: /\bprove\b|show.*document|\bwhere\b/, route: 'lease:prove' },
      ],
    },
  ],
};

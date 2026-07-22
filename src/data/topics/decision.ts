// "The two apartments, side by side", Mission vs. Noe Valley scored on rent, commute,
// light, and quiet, with a map and a shareable one-pager.
import type { ConversationSpec } from '../conversation';

export const decision: ConversationSpec = {
  id: 'decision',
  workspace: 'Apartment choice',
  title: 'The two apartments, side by side',
  sub: "You sent me both listings, here's how they really compare.",
  opener: "They're close, but one fits your life better. Let me show you.",
  switchSay: "Okay, let's compare those two places.",
  tint: '#5e9bff',
  context: [
    { name: 'Mission listing.pdf', color: 'var(--presence-soft)' },
    { name: 'Noe Valley listing.pdf', color: 'var(--insight)' },
    { name: 'Your commute', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'verdict',
      num: '1',
      delay: 0,
      props: {
        title: 'Noe Valley edges it, on the things you said matter',
        conf: 'inferred',
        summary: 'You ranked light, commute, and quiet highest. Noe wins two of three.',
        sources: [{ file: 'Your notes' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'money',
      num: '2',
      delay: 90,
      props: {
        title: 'Mission saves you $300 a month',
        stat: '$300',
        delta: 'cheaper',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'But the commute costs ~45 more minutes a day, about 9 hours a month.',
        sources: [{ file: 'Both listings' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'feel',
      num: '3',
      delay: 180,
      props: {
        title: 'Mission is livelier; Noe is calmer',
        conf: 'inferred',
        summary: 'Depends on the week you picture, going out, or winding down.',
        sources: [{ file: 'Your notes' }],
      },
    },
    {
      type: 'ring',
      col: 4,
      delay: 260,
      props: {
        title: 'How well each fits you',
        icon: 'spark',
        iconColor: 'var(--insight)',
        rings: [
          {
            pct: 0.82,
            display: '82%',
            label: 'Noe Valley',
            color: 'var(--insight)',
            hint: 'light · commute · quiet',
          },
          {
            pct: 0.64,
            display: '64%',
            label: 'Mission',
            color: 'var(--presence)',
            hint: 'price · nightlife',
          },
        ],
        footer: 'Scored on the four things you said matter most.',
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 320,
      props: {
        title: 'The three numbers that decide it',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        cols: 3,
        kpis: [
          { val: '+$300/mo', label: 'Noe costs more', color: 'var(--warning)' },
          { val: '−22 min', label: 'Noe commute (each way)', color: 'var(--insight)' },
          { val: 'South-facing', label: 'Noe morning light', color: 'var(--insight)' },
        ],
        footer: 'The extra $300 buys back ~9 hours a month, about $33 an hour of your time.',
      },
    },
    {
      type: 'geomap',
      col: 8,
      delay: 380,
      props: {
        title: 'Both places + your commute',
        icon: 'share',
        iconColor: 'var(--presence-soft)',
        markers: [
          {
            lat: 37.7599,
            lng: -122.4148,
            name: 'Mission',
            detail: '1BR · $2,700/mo',
            color: 'var(--presence)',
          },
          {
            lat: 37.7502,
            lng: -122.4337,
            name: 'Noe Valley',
            detail: '1BR · $3,000/mo',
            color: 'var(--insight)',
          },
          {
            lat: 37.7785,
            lng: -122.3972,
            name: 'Your office · SoMa',
            detail: 'Where you commute to',
            color: 'var(--warning)',
          },
        ],
        footer: 'Noe sits closer to your line into SoMa, a 16-minute hop vs. 38 from the Mission.',
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 440,
      props: {
        eyebrow: 'What you told me matters',
        options: [
          { name: 'Mission', sub: '1BR · $2,700/mo' },
          { name: 'Noe Valley', sub: '1BR · $3,000/mo', pick: true },
        ],
        criteria: [
          { label: 'Rent', cells: [{ v: '$2,700', win: true }, { v: '$3,000' }] },
          { label: 'Commute', cells: [{ v: '38 min' }, { v: '16 min', win: true }] },
          {
            label: 'Morning light',
            cells: [{ v: 'North-facing' }, { v: 'South-facing', win: true }],
          },
          { label: 'Quiet', cells: [{ v: 'Busy street' }, { v: 'Calm block', win: true }] },
          { label: 'Nightlife', cells: [{ v: 'At your door', win: true }, { v: '15 min away' }] },
        ],
        recommendation:
          '<b>If quiet mornings and a short commute win, take Noe Valley.</b> The extra $300 buys back about 9 hours a month, roughly $33 an hour of your time.',
      },
    },
    {
      type: 'quadrant',
      col: 7,
      delay: 480,
      props: {
        title: 'Decision factors by impact vs. effort',
        icon: 'chart',
        iconColor: 'var(--presence)',
        xLabel: 'Effort →',
        yLabel: 'Impact →',
        topRight: 'High impact, high effort',
        topLeft: 'High impact, low effort',
        bottomLeft: 'Low impact, low effort',
        bottomRight: 'Low impact, high effort',
        items: [
          { label: 'Commute time', quadrant: 'topLeft', note: '9 hrs/mo saved' },
          { label: 'Morning light', quadrant: 'topLeft', note: 'south-facing' },
          { label: 'Nightlife access', quadrant: 'topRight', note: 'Mission only' },
          { label: 'Rent delta', quadrant: 'topRight', note: '+$300/mo' },
          { label: 'Street noise', quadrant: 'bottomLeft', note: 'minor factor' },
          { label: 'Parking', quadrant: 'bottomRight', note: 'neither is great' },
        ],
        footer: 'Commute and light are quick wins, low effort, high daily impact.',
      },
    },
    {
      type: 'venn',
      col: 5,
      delay: 520,
      props: {
        title: 'Unique perks vs. shared',
        icon: 'layers',
        iconColor: 'var(--presence)',
        sets: [
          { label: 'Mission', value: 8, color: 'var(--warning)' },
          { label: 'Noe Valley', value: 6, color: 'var(--insight)' },
        ],
        overlaps: [{ sets: [0, 1], value: 5 }],
        footer:
          'Both cover the essentials (the 5 in the middle); the real choice is nightlife-at-your-door vs. a calm, sunlit morning.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a one-pager to talk it over with someone.",
      props: {
        kicker: 'APARTMENT DECISION',
        head: 'Mission vs. Noe Valley',
        foot: 'Made by Mavéa · from both listings',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>Noe Valley wins on commute, light, and quiet</b>, the three you ranked highest.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Mission is $300/mo cheaper</b> but adds ~9 hours of commuting a month.',
          },
          {
            color: 'var(--presence)',
            text: '<b>Pick by lifestyle:</b> nights out → Mission; calm mornings → Noe Valley.',
          },
        ],
      },
    },
  },

  group: 'decide',
  tryChip: { label: 'Help me pick an apartment', route: 'topic:decision' },
  suggests: [
    { label: 'Which one again?', icon: 'proof', route: 'decision:pick', lead: 'Try' },
    { label: 'Make a one-pager', icon: 'slides', route: 'slide' },
    { label: 'Help me find a gift for Mom', icon: 'sparkle', route: 'topic:gift' },
    { label: 'Back to my money', icon: 'chart', route: 'topic:money' },
  ],
  intents: {
    pick: {
      kind: 'spotlight',
      spotId: 'verdict',
      say: "Noe Valley, it wins commute, light, and quiet. Mission's just cheaper.",
    },
  },
  keywords: [
    {
      // Apartment-specific terms only, bare 'compare/decide/lease/vs' verbs are left out
      // so they don't swallow the offers/lease/career topics.
      test: /apartment|\bapt\b|noe valley|the mission|two places|both listings|which apartment/,
      route: 'topic:decision',
      sub: [{ test: /which|pick|recommend|better|should i/, route: 'decision:pick' }],
    },
  ],
};

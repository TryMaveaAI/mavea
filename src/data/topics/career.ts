// "Should you take the offer?", current role vs. the new one compared on pay, growth, and
// risk, with a side-by-side breakdown and a one-pager to sleep on.
import type { ConversationSpec } from '../conversation';

export const career: ConversationSpec = {
  id: 'career',
  workspace: 'The job offer',
  title: 'Should you take the offer?',
  sub: 'Your current role and the new one, honestly compared.',
  opener: "It's not just the money, and the money's closer than it looks. Let me show you.",
  switchSay: "Big one. Let's think through the offer together.",
  tint: '#7d8cff',
  context: [
    { name: 'Offer letter.pdf', color: 'var(--insight)' },
    { name: 'Current pay + equity', color: 'var(--presence-soft)' },
    { name: 'What you want', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'verdict',
      num: '1',
      delay: 0,
      props: {
        title: 'The offer wins on growth, not just pay',
        conf: 'inferred',
        summary:
          "You said learning and scope matter most right now, that's where the new role pulls ahead.",
        sources: [{ file: 'What you want' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'pay',
      num: '2',
      delay: 90,
      props: {
        title: 'The raise is smaller than it sounds',
        stat: '+$14k',
        delta: 'after equity',
        deltaDir: 'up',
        conf: 'strong',
        summary: "The base jumps $25k, but you'd walk away from equity vesting next year.",
        sources: [{ file: 'Current pay + equity' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'risk',
      num: '3',
      delay: 180,
      props: {
        title: 'The risk is real but bounded',
        conf: 'partial',
        summary: 'Newer company, less certainty, but the role itself is a clear step up.',
        sources: [{ file: 'Offer letter.pdf' }],
      },
    },
    {
      type: 'gauge',
      col: 4,
      delay: 260,
      props: {
        title: 'Fit for what you want now',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: 78,
        max: 100,
        band: 'Strong fit',
        color: 'var(--insight)',
        driver: 'Scored on <b>growth, scope, and remote</b>, the three you ranked highest.',
        footer: 'Stability is the one axis where staying still wins.',
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 320,
      props: {
        title: 'What actually changes',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        cols: 3,
        kpis: [
          { val: '+$14k', label: 'Net first-year gain', color: 'var(--insight)' },
          { val: 'Step up', label: 'Scope & growth', color: 'var(--insight)' },
          { val: '−4 hrs/wk', label: 'Commute (now remote)', color: 'var(--presence)' },
        ],
        footer:
          "The headline raise is $25k base; the honest number is +$14k after equity you'd leave.",
      },
    },
    {
      type: 'bars',
      col: 6,
      delay: 380,
      props: {
        title: 'Total first-year value, side by side',
        icon: 'table',
        iconColor: 'var(--insight)',
        unit: 'k',
        bars: [
          { label: 'Stay', value: 149, label2: '$149k' },
          { label: 'Offer', value: 163, label2: '$163k', hot: true, color: 'var(--insight)' },
        ],
        goal: 149,
        goalLabel: 'today',
        footer: 'Base + bonus + equity value. The offer leads by ~$14k once everything is counted.',
      },
    },
    {
      type: 'compare',
      col: 12,
      delay: 440,
      props: {
        eyebrow: 'Side by side, honestly',
        options: [
          { name: 'Stay', sub: 'Current role' },
          { name: 'Take the offer', sub: 'New role', pick: true },
        ],
        criteria: [
          { label: 'Base salary', cells: [{ v: '$135k' }, { v: '$160k', win: true }] },
          {
            label: 'Net first-year gain',
            cells: [{ v: 'Equity vests', win: true }, { v: '+$14k' }],
          },
          {
            label: 'Scope & growth',
            cells: [{ v: 'Plateauing' }, { v: 'Clear step up', win: true }],
          },
          {
            label: 'Stability',
            cells: [{ v: 'Known, steady', win: true }, { v: 'Newer, less certain' }],
          },
          { label: 'Commute / remote', cells: [{ v: 'Hybrid' }, { v: 'Fully remote', win: true }] },
        ],
        recommendation:
          '<b>If this is a growth year, take it.</b> The pay is closer than it looks, but the scope and remote flexibility are the real upgrade. If stability matters most right now, staying is defensible.',
      },
    },
    {
      // "The Blank Space" — the parts of this decision only you can answer. Rather than guess your
      // dealbreaker or your timeline, Mavéa leaves them as glowing holes for you to fill.
      type: 'blanks',
      col: 12,
      delay: 500,
      props: {
        title: 'The parts only you can answer',
        icon: 'spark',
        iconColor: 'var(--presence)',
        intro: "I've weighed everything I can. Two or three things are yours to fill in.",
        slots: [
          {
            key: 'dealbreaker',
            label: 'Your hard no',
            prompt: 'What would make this offer an automatic no?',
            kind: 'text',
            placeholder: 'e.g. no relocation help',
          },
          {
            key: 'decide_by',
            label: 'Decide by',
            prompt: 'When do you actually have to give an answer?',
            kind: 'date',
            accent: 'var(--warning)',
          },
          {
            key: 'energy',
            label: 'Energy for a change',
            prompt: 'How much capacity do you have for a job change right now?',
            kind: 'choice',
            options: ['Low', 'Some', 'Plenty'],
          },
        ],
      },
    },
    {
      type: 'reframecard',
      col: 7,
      delay: 600,
      props: {
        title: 'A gentler take',
        thought: 'I bombed that interview, so I am clearly not cut out for this role.',
        distortion: 'all-or-nothing',
        reframe:
          'One hard interview is a single data point, not a verdict on your whole career — you answered three of the five questions well, and that is something to build on.',
        footer:
          'Notice the jump from <b>one moment</b> to <b>a whole identity</b> — that is the part worth questioning.',
      },
    },
    {
      type: 'talktrack',
      col: 6,
      delay: 520,
      props: {
        title: 'How to open the resignation call',
        icon: 'mic',
        totalTime: '~60s',
        lines: [
          {
            say: 'Thanks for making time, I wanted to tell you this directly rather than over email.',
            beat: 'warm, steady',
            note: 'Sets the tone before the news lands.',
          },
          {
            say: 'I have decided to move on, and my last day will be two weeks from today.',
            beat: 'pause here',
            note: 'Say the date plainly, then stop talking.',
          },
          {
            say: 'This was a hard call. I have learned a lot here and I am grateful for it.',
            beat: 'sincere',
          },
          {
            say: 'I want the handover to go smoothly, so let us plan the next two weeks together.',
            beat: '~15s',
            note: 'Ends on partnership, not apology.',
          },
        ],
        footer:
          'Let the silences sit. You do not owe a full explanation, only a clear decision and a clean exit.',
      },
    },
    {
      type: 'resume',
      col: 12,
      delay: 680,
      props: {
        name: 'John Smith',
        title: 'Senior Product Manager',
        icon: 'doc',
        iconColor: 'var(--presence)',
        // A demo résumé is the one fixture that can accidentally describe a REAL person, so the
        // identifying fields use reserved-for-documentation forms only: example.com can never be
        // registered (RFC 2606), and a real linkedin.com/in/… slug would point at somebody.
        contact: ['john.smith@example.com', 'Austin, TX', 'example.com/in/johnsmith'],
        summary:
          'Product leader with eight years in B2B SaaS, the last three managing a team of five. Led the usage-based pricing rework that lifted net revenue retention 18 points.',
        experience: [
          {
            role: 'Senior Product Manager',
            org: 'Meridian Analytics',
            start: '2022',
            location: 'Austin, TX',
            bullets: [
              'Led the pricing-model rework that took net revenue retention from 96% to 114%.',
              'Grew the team from two to five PMs and stood up a quarterly roadmap review.',
              'Owned the platform API surface used by 40+ enterprise integrations.',
            ],
          },
          {
            role: 'Product Manager',
            org: 'Northwind Labs',
            start: '2019',
            end: '2022',
            location: 'Remote',
            bullets: [
              'Shipped the self-serve onboarding flow that cut time-to-first-value from 9 days to 36 hours.',
              'Ran discovery for the mobile app, now 30% of monthly active usage.',
            ],
          },
          {
            role: 'Associate Product Manager',
            org: 'Fieldstone Software',
            start: '2017',
            end: '2019',
            location: 'Chicago, IL',
            bullets: ['Owned the reporting-module roadmap for the mid-market tier.'],
          },
        ],
        education: [
          {
            school: 'University of Illinois at Urbana-Champaign',
            credential: 'B.S. Industrial Engineering',
            start: '2013',
            end: '2017',
            detail: 'Minor in Computer Science',
          },
        ],
        skills: [
          'Product strategy',
          'Pricing & packaging',
          'SQL',
          'Roadmapping',
          'A/B testing',
          'Stakeholder management',
          'API design',
        ],
        footer: 'Kept current from your LinkedIn export, in case the new role wants it this week.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a one-pager to sleep on, or share with someone you trust.",
      props: {
        kicker: 'THE DECISION',
        head: 'Stay vs. take the offer',
        foot: 'Made by Mavéa · from your notes',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>The offer wins on growth, scope, and remote</b>, the things you ranked highest.',
          },
          {
            color: 'var(--warning)',
            text: "<b>Real gain is ~$14k</b>, not $25k, once you account for equity you'd leave behind.",
          },
          {
            color: 'var(--presence)',
            text: "<b>It's a growth-vs-stability call.</b> Name which one this year is for, and the answer follows.",
          },
        ],
      },
    },
  },

  group: 'decide',
  tryChip: { label: 'Should I take the offer?', route: 'topic:career' },
  suggests: [
    { label: 'Which way should I go?', icon: 'proof', route: 'career:pick', lead: 'Try' },
    { label: 'Make a one-pager', icon: 'slides', route: 'slide' },
    { label: "How's my money looking?", icon: 'chart', route: 'topic:money' },
    { label: 'Help me find a gift for Mom', icon: 'sparkle', route: 'topic:gift' },
  ],
  intents: {
    pick: {
      kind: 'spotlight',
      spotId: 'verdict',
      say: "If this is a growth year, take it. The pay's closer than it looks.",
    },
  },
  keywords: [
    {
      test: /job|offer|career|quit|new role|should i take|stay or|raise/,
      route: 'topic:career',
      sub: [{ test: /which|should i|recommend|take it|decide/, route: 'career:pick' }],
    },
  ],
};

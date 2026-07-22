// Language, writing, time/travel, and body-map block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const LANGUAGE_EXAMPLES: Record<string, Record<string, unknown>> = {
  dialogue: {
    title: 'Hiring interview — product sense',
    icon: 'user',
    iconColor: 'var(--presence)',
    context: 'PM screening round, 30 minutes',
    lines: [
      {
        speaker: 'Interviewer',
        text: "Tell me about a product you use every day and how you'd improve it.",
      },
      {
        speaker: 'Candidate',
        text: "I'll use Spotify. The discovery is excellent, but the social layer is buried — I'd surface what friends are listening to in the home feed, not a separate tab.",
        note: 'Structured: pick → pain point → solution',
      },
      {
        speaker: 'Interviewer',
        text: 'Good. How would you measure success of that change?',
      },
    ],
    footer: 'Three turns — interviewer + candidate pattern',
  },
  variants: {
    title: 'Email subject line — 2 rewrites',
    icon: 'edit',
    iconColor: 'var(--presence)',
    prompt: 'Rewrite this subject line for better open rates: "Q3 report attached"',
    variants: [
      {
        label: 'Curiosity hook',
        text: 'One number from Q3 that surprised us',
        note: 'Teases a specific insight; drives opens',
      },
      {
        label: 'Direct value',
        text: 'Q3 results: revenue up 18% — details inside',
        note: 'States the win upfront for busy readers',
      },
    ],
    footer: 'A/B test both and compare open rates over 48 hours',
  },
  verse: {
    title: 'Haiku — first snow',
    icon: 'spark',
    iconColor: 'var(--insight)',
    form: 'Haiku',
    stanzas: [
      {
        lines: [
          { text: 'Silent white morning' },
          { text: 'footprints cross the empty yard' },
          { text: 'the kettle sings once' },
        ],
      },
    ],
    footer: '5 – 7 – 5 syllables',
  },
  slidedeck: {
    title: 'Deck outline — remote-work productivity',
    icon: 'layers',
    iconColor: 'var(--presence)',
    deck: 'Remote Work: Staying Productive in 2026',
    slides: [
      {
        title: 'The Remote Paradox',
        layout: 'title',
        bullets: [
          '74% of workers report higher output at home',
          'Yet 60% also report more loneliness',
          'The gap between output and wellbeing is widening',
        ],
      },
      {
        title: 'Three Practices That Actually Work',
        layout: 'content',
        bullets: [
          'Time-boxed deep work (90-min blocks, no notifications)',
          'Async-first communication with explicit response windows',
          'Weekly in-person or video rituals for social glue',
        ],
        note: 'Reference Stanford WFH study for stat on slide 1',
      },
      {
        title: 'Next Steps',
        layout: 'content',
        bullets: [
          'Pilot 4-day async sprint with one team',
          'Survey team at 30 days',
          'Expand or adjust based on results',
        ],
      },
    ],
    footer: '3-slide overview · expand each into full slides',
  },
  timezones: {
    title: 'Meeting time — New York · London · Tokyo',
    icon: 'clock',
    iconColor: 'var(--presence)',
    baseTime: '3:00 PM ET',
    rows: [
      {
        city: 'New York',
        timezone: 'America/New_York',
        offset: 'UTC−5',
        localTime: '3:00 PM',
        isHome: true,
      },
      {
        city: 'London',
        timezone: 'Europe/London',
        offset: 'UTC+0',
        localTime: '8:00 PM',
      },
      {
        city: 'Tokyo',
        timezone: 'Asia/Tokyo',
        offset: 'UTC+9',
        localTime: '5:00 AM (next day)',
      },
    ],
    footer: 'Tokyo attendees would need an early morning slot',
  },
  transitroute: {
    title: 'SoHo to Grand Central',
    icon: 'globe',
    iconColor: 'var(--presence)',
    origin: 'Spring St & Broadway, SoHo',
    destination: 'Grand Central Terminal, Midtown',
    totalTime: '22 min',
    steps: [
      {
        mode: 'walk',
        instruction: 'Walk north on Broadway to Spring St station',
        duration: '4 min',
        distance: '0.2 mi',
      },
      {
        mode: 'subway',
        instruction: 'Take the 6 train uptown toward Pelham Bay Park',
        duration: '14 min',
        line: '6 Uptown',
        from: 'Spring St',
        to: 'Grand Central – 42 St',
      },
      {
        mode: 'walk',
        instruction: 'Exit to 42nd St and follow signs to the main concourse',
        duration: '4 min',
        distance: '0.2 mi',
      },
    ],
    footer: 'Departing approx. every 4–6 min during rush hour',
  },
  amortization: {
    title: 'Car loan — $28,000 at 5.9% APR',
    icon: 'chart',
    iconColor: 'var(--presence)',
    principal: '$28,000',
    rate: '5.9% APR',
    term: '5 years',
    monthlyPayment: '$539.40',
    rows: [
      {
        period: 'Year 1',
        payment: '$6,472.80',
        principal: '$4,872.01',
        interest: '$1,600.79',
        balance: '$23,127.99',
      },
      {
        period: 'Year 2',
        payment: '$6,472.80',
        principal: '$5,162.01',
        interest: '$1,310.79',
        balance: '$17,965.98',
      },
      {
        period: 'Year 3',
        payment: '$6,472.80',
        principal: '$5,468.13',
        interest: '$1,004.67',
        balance: '$12,497.85',
      },
    ],
    footer: 'Rows show yearly totals; full 60-month schedule available on request',
  },
  quadrant: {
    title: 'Eisenhower matrix — this week',
    icon: 'table',
    iconColor: 'var(--presence)',
    xLabel: 'Urgency →',
    yLabel: 'Importance ↑',
    topRight: 'Do first',
    topLeft: 'Schedule',
    bottomRight: 'Delegate',
    bottomLeft: 'Eliminate',
    items: [
      {
        label: 'Production incident',
        quadrant: 'topRight',
        note: 'Urgent + critical — fix now',
      },
      {
        label: 'Q4 strategy doc',
        quadrant: 'topLeft',
        note: 'High impact, not on fire — block time',
      },
      {
        label: 'Expense report',
        quadrant: 'bottomRight',
        note: 'Deadline driven, low strategic value',
      },
      {
        label: 'Old status email thread',
        quadrant: 'bottomLeft',
        note: 'Neither urgent nor important — unsubscribe',
      },
    ],
    footer: 'One item per quadrant — real prioritization exercise',
  },
  bodymap: {
    title: 'Yoga stretch — hip flexors & lower back',
    icon: 'user',
    iconColor: 'var(--presence)',
    side: 'anterior',
    regions: [
      {
        id: 'leftLeg',
        label: 'Hip flexor (L)',
        color: 'var(--presence)',
        note: 'Hold Crescent Lunge 30 s each side',
      },
      {
        id: 'rightLeg',
        label: 'Hip flexor (R)',
        color: 'var(--presence)',
      },
      {
        id: 'abdomen',
        label: 'Core / lower back',
        color: 'var(--insight)',
        note: 'Engage during Cat-Cow for spinal decompression',
      },
    ],
    footer: 'Highlight turns posterior for glute stretches',
  },
  pronunciation: {
    title: 'How to say "ephemeral"',
    icon: 'speaker',
    iconColor: 'var(--presence)',
    word: 'ephemeral',
    ipa: '/ɪˈfɛm.ər.əl/',
    syllables: 'e·phem·er·al',
    tips: [
      'Stress falls on the second syllable: e-PHEM-er-al',
      "The opening 'e' sounds like the 'i' in 'it', not 'ee'",
    ],
    footer: '4 syllables · adjective · lasting for only a short time',
  },
  dictionary: {
    title: '"sonder"',
    icon: 'doc',
    iconColor: 'var(--insight)',
    word: 'sonder',
    phonetic: '/ˈsɒn.dər/',
    senses: [
      {
        pos: 'noun',
        definition:
          'The profound feeling of realizing that each passerby has a life as vivid and complex as your own.',
        example: 'Standing in the busy terminal, she felt a wave of sonder wash over her.',
        synonyms: ['empathy', 'interconnectedness'],
      },
    ],
    etymology: 'Coined by John Koenig in The Dictionary of Obscure Sorrows, 2012.',
    footer: 'Not in standard dictionaries — from the neologism lexicon',
  },
  translation: {
    title: 'EN → FR — morning greeting',
    icon: 'globe',
    iconColor: 'var(--insight)',
    fromLang: 'English',
    toLang: 'French',
    text: 'Good morning, how are you?',
    result: 'Bonjour, comment allez-vous ?',
    pairs: [
      {
        original: 'Good morning',
        translated: 'Bonjour',
        note: 'Lit. "Good day"; used until midday',
      },
      {
        original: 'how are you?',
        translated: 'comment allez-vous ?',
        note: 'Formal form; "comment tu vas ?" is casual',
      },
    ],
    footer: 'Formal register — use "tu" form with friends',
  },
};

// "Welcome home, Biscuit", a warm get-started kit for a family with a brand-new puppy.
// The first-week supply checklist, a gentle day-one schedule (feed / potty / nap / play),
// the training + vaccine milestones over the first weeks, a vaccine tracker, the first
// wellness-exam chart, vet-approved tips, a "days together" counter, and a photo wall,
// everything new pet-parents need to feel ready. Core blocks +
// checklist/milestones/healthgrid/vetpatientchart/callout/counter/gallery.
import type { ConversationSpec } from '../conversation';

export const puppy: ConversationSpec = {
  id: 'puppy',
  workspace: 'New puppy',
  title: 'Welcome home, Biscuit',
  sub: 'Your first-week kit, supplies, a daily rhythm, and the milestones ahead.',
  opener:
    "Congratulations, Biscuit is home! The first week is mostly love, naps, and a gentle routine. Here's everything to get you started, in one place.",
  switchSay: "Let's get Biscuit settled in.",
  gather: 'Pulling your puppy starter kit together',
  found: "Here's your get-started kit, supplies, a daily rhythm, and what's coming next.",
  tint: '#ffb36b',
  context: [
    { name: 'Biscuit · 9 weeks', color: 'var(--presence)' },
    { name: 'Golden Retriever', color: 'var(--presence-soft)' },
    { name: 'Vet · Maple Animal Care', color: 'var(--insight)' },
    { name: 'Home since today', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative ──
    {
      type: 'insight',
      col: 8,
      id: 'welcome',
      num: '1',
      delay: 0,
      props: {
        title: 'The first week is about safety, routine, and bonding, not training drills',
        stat: 'Week 1',
        delta: 'keep it calm',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Puppies thrive on predictability. A steady rhythm of feed → potty → play → nap teaches Biscuit that home is safe, and most house-training falls into place from there.',
        sources: [{ file: 'AKC puppy guide', loc: 'first week' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'sleep',
      num: '2',
      delay: 80,
      props: {
        title: 'A 9-week pup sleeps a lot',
        stat: '18–20h',
        delta: 'a day',
        deltaDir: 'good',
        conf: 'partial',
        summary:
          'Plenty of naps are normal and healthy. Quiet rest between play sessions keeps Biscuit happy and learning.',
        sources: [{ file: 'Vet handout', loc: 'sleep' }],
      },
    },

    // ── the get-started kit at a glance ──
    {
      type: 'kpi',
      col: 7,
      delay: 160,
      props: {
        title: 'Biscuit at a glance',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 4,
        kpis: [
          { val: '9 wks', label: 'Age' },
          { val: '11 lb', label: 'Weight', color: 'var(--insight)' },
          { val: '4', label: 'Meals/day', color: 'var(--presence)' },
          { val: 'Today', label: 'Gotcha day', color: 'var(--insight)' },
        ],
        footer: 'Golden Retriever · friendly, food-motivated, eager to please.',
      },
    },
    {
      type: 'counter',
      col: 5,
      delay: 240,
      id: 'days',
      props: {
        title: 'Days together',
        icon: 'sun',
        iconColor: 'var(--insight)',
        value: 1,
        suffix: '',
        label: 'Day one of a long friendship',
        delta: 'just started',
        deltaDir: 'up',
        color: 'var(--insight)',
        footer: 'Every day from here is a new little milestone with Biscuit.',
      },
    },

    // ── first-week supply checklist ──
    {
      type: 'checklist',
      col: 7,
      delay: 320,
      id: 'supplies',
      props: {
        title: 'First-week supplies',
        icon: 'cart',
        iconColor: 'var(--presence)',
        rows: [
          { t: 'Crate + soft washable bedding', st: 'done' },
          { t: 'Puppy food (same brand the breeder used)', st: 'done' },
          { t: 'Food + water bowls (stainless or ceramic)', st: 'done' },
          { t: 'Collar, ID tag, and a 6-ft leash', st: 'doing' },
          { t: 'Enzyme cleaner for accidents', st: 'doing' },
          { t: 'Chew toys + a couple of teething toys', st: 'todo' },
          { t: 'Puppy pads for the first nights', st: 'todo' },
          { t: 'Grooming brush + puppy-safe shampoo', st: 'todo' },
        ],
        footer: 'Greens are in the house, ambers are on the way, the rest can wait a few days.',
      },
    },
    {
      type: 'list',
      col: 5,
      delay: 400,
      props: {
        title: 'Puppy-proof before bedtime',
        icon: 'shield',
        iconColor: 'var(--warning)',
        items: [
          'Tuck away <b>cords and chargers</b>, everything is a chew toy right now',
          'Move <mark>houseplants</mark> and cleaning supplies out of reach',
          'Block stairs with a baby gate until Biscuit is steadier',
          'Pick up small objects, socks, and kids&rsquo; toys from the floor',
        ],
      },
    },

    // ── a gentle day-one schedule ──
    {
      type: 'timeline',
      col: 12,
      delay: 480,
      id: 'day',
      props: {
        eyebrow: 'A gentle first day, feed, potty, play, nap, repeat',
        title: 'Biscuit&rsquo;s daily rhythm',
        events: [
          {
            time: '7:00a',
            title: 'Wake + potty',
            detail: 'Straight outside first thing, praise the moment it happens.',
            tag: 'potty',
            color: 'var(--insight)',
          },
          {
            time: '7:30a',
            title: 'Breakfast',
            detail: 'Meal 1 of 4. Potty again 10–15 min after eating.',
            tag: 'feed',
            color: 'var(--presence)',
          },
          {
            time: '9:00a',
            title: 'Play + a little training',
            detail: 'Five fun minutes of name + sit, then a nap.',
            tag: 'play',
            color: 'var(--presence-soft)',
          },
          {
            time: '12:00p',
            title: 'Lunch + nap',
            detail: 'Meal 2, then crate rest in a calm, quiet spot.',
            tag: 'rest',
            color: 'var(--text-muted)',
          },
          {
            time: '4:00p',
            title: 'Walk + sniff time',
            detail: 'Short leash stroll, let the nose lead and explore.',
            tag: 'walk',
            color: 'var(--insight)',
          },
          {
            time: '5:30p',
            title: 'Dinner',
            detail: 'Meal 3, with potty before and after.',
            tag: 'feed',
            color: 'var(--presence)',
          },
          {
            time: '9:00p',
            title: 'Last meal + last potty',
            detail: 'Meal 4, final yard trip, then settle for the night.',
            tag: 'wind down',
            color: 'var(--presence-soft)',
          },
          {
            time: '2:00a',
            title: 'One night potty',
            detail: 'Quiet trip outside, back to the crate, no playtime.',
            tag: 'overnight',
            color: 'var(--text-muted)',
          },
        ],
      },
    },

    // ── donut: how the day splits ──
    {
      type: 'donut',
      col: 4,
      delay: 560,
      props: {
        title: 'How a puppy day splits',
        icon: 'clock',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Sleep & naps', pct: 76, color: 'var(--presence)' },
          { label: 'Play & training', pct: 12, color: 'var(--insight)' },
          { label: 'Meals & potty', pct: 8, color: 'var(--presence-soft)' },
          { label: 'Walks', pct: 4, color: 'var(--warning)' },
        ],
        footer: 'Mostly sleep, that&rsquo;s exactly right for a 9-week-old.',
      },
    },

    // ── milestones: training + growth over the first weeks ──
    {
      type: 'milestones',
      col: 8,
      delay: 640,
      id: 'milestones',
      props: {
        title: 'The weeks ahead',
        icon: 'spark',
        iconColor: 'var(--insight)',
        milestones: [
          {
            label: 'Settle in & learn your home',
            date: 'Week 1',
            status: 'active',
            detail: 'Name, the crate, where to potty, and meeting the family calmly.',
            owner: 'You + Biscuit',
          },
          {
            label: 'First sits, names, and a sleep-through night',
            date: 'Week 2',
            status: 'todo',
            detail: 'Short, happy training games with lots of treats.',
            owner: 'Daily, 5 min',
          },
          {
            label: 'Puppy socialization window opens',
            date: 'Weeks 3–8',
            status: 'todo',
            detail: 'Gentle exposure to people, sounds, and surfaces, the key window.',
            owner: 'Vet-cleared',
          },
          {
            label: 'Leash walks + puppy class',
            date: 'Week 6',
            status: 'todo',
            detail: 'Once vaccines are underway, start a positive-method class.',
            owner: 'Maple Animal Care',
          },
          {
            label: 'Spay/neuter conversation',
            date: 'Month 6',
            status: 'todo',
            detail: 'Discuss timing with your vet based on breed and size.',
            owner: 'Vet visit',
          },
        ],
        footer: 'Nothing is urgent except love and routine, the rest unfolds week by week.',
      },
    },
    {
      type: 'web',
      col: 4,
      delay: 720,
      props: {
        title: 'Tips parents swear by',
        live: true,
        results: [
          {
            domain: 'akc.org',
            color: 'var(--insight)',
            title: 'Take potty trips outside the same door',
            excerpt:
              'Consistency builds the habit fast, go out the <mark>same door</mark> every time.',
          },
          {
            domain: 'reddit.com',
            path: ' · r/puppy101',
            color: 'var(--presence)',
            title: 'A worn t-shirt helps at night',
            excerpt:
              'Tuck a <mark>shirt that smells like you</mark> in the crate to ease the first nights.',
          },
          {
            domain: 'aspca.org',
            color: 'var(--warning)',
            title: 'Keep the toxic-foods list handy',
            excerpt:
              'No <mark>chocolate, grapes, xylitol, or onions</mark>, save the poison-control number.',
          },
        ],
      },
    },

    // ── healthgrid: vaccine + wellness tracker ──
    {
      type: 'healthgrid',
      col: 7,
      delay: 800,
      id: 'vaccines',
      props: {
        title: 'Vaccine & wellness tracker',
        icon: 'shield',
        iconColor: 'var(--insight)',
        cols: 4,
        cells: [
          {
            label: 'DHPP · 1st',
            level: 'ok',
            value: 'Done',
            detail: 'Distemper / hepatitis / parvo / parainfluenza, given at 8 weeks.',
          },
          {
            label: 'Deworming',
            level: 'ok',
            value: 'Done',
            detail: 'First round complete; repeat per vet schedule.',
          },
          {
            label: 'DHPP · 2nd',
            level: 'warn',
            value: 'Wk 12',
            detail: 'Due at 12 weeks, book the booster now to hold the slot.',
          },
          {
            label: 'Bordetella',
            level: 'warn',
            value: 'Wk 12',
            detail: 'Kennel-cough vaccine, needed before puppy class or boarding.',
          },
          {
            label: 'DHPP · 3rd',
            level: 'down',
            value: 'Wk 16',
            detail: 'Final puppy booster, not started yet.',
          },
          {
            label: 'Rabies',
            level: 'down',
            value: 'Wk 16',
            detail: 'Required by law in most areas; given around 16 weeks.',
          },
          {
            label: 'Microchip',
            level: 'warn',
            value: 'Next visit',
            detail: 'Quick and permanent ID, ask at the 12-week appointment.',
          },
          {
            label: 'Flea & tick',
            level: 'ok',
            value: 'Monthly',
            detail: 'Started, set a monthly reminder so it never lapses.',
          },
        ],
        footer:
          'Green is done, amber is coming up, gray is later. Until the series is complete, keep Biscuit away from unknown dogs.',
      },
    },
    {
      type: 'vaxschedule',
      col: 7,
      id: 'vax-timeline',
      delay: 840,
      props: {
        title: 'Shot series, on the age axis',
        icon: 'shield',
        iconColor: 'var(--insight)',
        doses: [
          { vaccine: 'DHPP · 1st', dueAt: '8 weeks', status: 'done' },
          { vaccine: 'Deworming', dueAt: '8 weeks', status: 'done' },
          {
            vaccine: 'DHPP · 2nd',
            dueAt: '12 weeks',
            status: 'due',
            note: 'Book the booster now to hold the slot.',
          },
          { vaccine: 'Bordetella', dueAt: '12 weeks', status: 'due' },
          { vaccine: 'DHPP · 3rd', dueAt: '16 weeks', status: 'due' },
          { vaccine: 'Rabies', dueAt: '16 weeks', status: 'due' },
        ],
        footer: 'Same series as above, laid out by when each shot actually falls due.',
      },
    },
    {
      type: 'callout',
      col: 5,
      delay: 880,
      id: 'vettips',
      props: {
        title: 'From your vet',
        icon: 'proof',
        iconColor: 'var(--presence)',
        tone: 'info',
        kicker: 'Vet tips',
        body: 'Biscuit is healthy and right on track. A few things to keep front of mind in week one:',
        points: [
          'Feed the <b>same food</b> for now, switch brands slowly over a week if you change.',
          'Fresh water always available; watch that gums stay <mark>pink and moist</mark>.',
          'Normal: soft stool the first day or two from the move. <b>Call us</b> if it persists, or for vomiting, lethargy, or no appetite.',
          'Save our after-hours line and the <b>pet poison-control</b> number in your phone.',
        ],
        footer: 'Maple Animal Care · next check-up booked for week 12.',
      },
    },
    {
      type: 'vetpatientchart',
      col: 7,
      delay: 900,
      props: {
        title: "Biscuit's first wellness exam",
        icon: 'doc',
        iconColor: 'var(--presence)',
        species: 'Canine',
        name: 'Biscuit',
        breed: 'Golden Retriever',
        sex: 'Male',
        weightKg: 5.0,
        vitals: [
          { label: 'Temperature', value: 101.8, unit: '°F' },
          { label: 'Heart rate', value: 150, unit: 'bpm' },
          { label: 'Respiratory rate', value: 24, unit: 'bpm' },
          { label: 'Body condition score', value: '5/9' },
          { label: 'Gum color', value: 'Pink' },
          { label: 'Capillary refill', value: '<2s' },
        ],
        problems: ['Transient loose stool — post-adoption stress, monitoring'],
        footer:
          'All vitals normal for a 9-week Golden. The loose stool is expected from the move; call Maple Animal Care if it persists past a couple more days.',
      },
    },

    // ── photo wall ──
    {
      type: 'gallery',
      col: 12,
      delay: 960,
      id: 'photos',
      props: {
        eyebrow: 'Biscuit&rsquo;s first album',
        title: 'The photo wall',
        items: [
          {
            label: 'First nap on the new bed',
            source: 'Family photos',
            tag: 'day 1',
            h1: '#e6a45e',
            h2: '#6e4a22',
          },
          {
            label: 'Meeting the kids',
            source: 'Family photos',
            h1: '#c98a4a',
            h2: '#5e3c1c',
          },
          {
            label: 'First trip to the yard',
            source: 'Family photos',
            h1: '#7aa86a',
            h2: '#33502a',
          },
          {
            label: 'Tiny zoomies',
            source: 'Family photos',
            h1: '#d6b25a',
            h2: '#5e4c20',
          },
        ],
        footer: 'Tap any photo to add a caption, this album grows with Biscuit.',
      },
    },
    {
      type: 'stickerchart',
      col: 6,
      id: 'potty-stickers',
      delay: 1040,
      props: {
        title: 'Potty training chart',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        behavior: 'Went potty outside',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        marks: [
          { day: 'Mon', earned: true },
          { day: 'Tue', earned: true },
          { day: 'Wed', earned: false },
          { day: 'Thu', earned: true },
          { day: 'Fri', earned: true },
          { day: 'Sat', earned: true },
        ],
        rewardAt: 20,
        footer: '5 stars this week — 15 to go before the new chew toy.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll add Biscuit's week-12 booster to your calendar.",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'clock',
        title: 'Add the week-12 vet visit',
        lines: [
          { k: 'Adds', v: 'One event · week-12 booster' },
          { k: 'To', v: 'Family calendar' },
        ],
        perm: 'Adds one event to your calendar. No invites are sent.',
        cta: 'Add reminder',
        doneText: 'Added the week-12 vet visit',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Event title', value: 'Biscuit · week-12 vaccine booster' },
          { param: 'start', label: 'Start', value: '2026-06-30T10:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '30' },
          {
            param: 'notes',
            label: 'Notes',
            value: 'Maple Animal Care. Week-16 booster follows 4 weeks later.',
          },
        ],
      },
    },
  },

  group: 'household',
  tryChip: { label: 'We just got a puppy, help us start', route: 'topic:puppy' },
  suggests: [
    {
      label: 'Track the next vaccines',
      icon: 'shield',
      route: 'puppy:vaccines',
      lead: 'Try',
    },
    { label: 'Add the vet visit to my calendar', icon: 'check', route: 'send' },
    { label: 'Show the first-week supplies', icon: 'cart', route: 'puppy:supplies' },
    { label: 'What does the daily rhythm look like?', icon: 'clock', route: 'puppy:day' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    vaccines: {
      kind: 'spotlight',
      spotId: 'vaccines',
      say: "Here's where Biscuit stands on shots, and what's coming up.",
    },
    supplies: {
      kind: 'spotlight',
      spotId: 'supplies',
      say: "Here's the first-week supply checklist.",
    },
    day: {
      kind: 'spotlight',
      spotId: 'day',
      say: "And here's the gentle daily rhythm for the first days.",
    },
    milestones: {
      kind: 'spotlight',
      spotId: 'milestones',
      say: "Here's what the next few weeks hold.",
    },
  },
  keywords: [
    {
      test: /puppy|new dog|new pup|got a (dog|puppy)|housetrain|house.?train|crate train|vaccin|new pet/i,
      route: 'topic:puppy',
      sub: [
        {
          test: /vaccin|shot|booster|vet|deworm|rabies|microchip/i,
          route: 'puppy:vaccines',
        },
        {
          test: /supply|supplies|checklist|buy|crate|leash|food/i,
          route: 'puppy:supplies',
        },
      ],
    },
  ],
};

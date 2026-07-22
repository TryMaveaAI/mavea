// "What your week looks like", where the calendar is overloaded (Wednesday), where it's open, and the time worth protecting.
import type { ConversationSpec } from '../conversation';

export const week: ConversationSpec = {
  id: 'week',
  workspace: 'Your week',
  title: 'What your week looks like',
  sub: "Pulled from your calendar, and where it's tight.",
  opener: "Wednesday's the crunch. Let's protect the rest before it fills up.",
  switchSay: "Okay, let's look at your week.",
  tint: '#f5b95c',
  context: [
    { name: 'Calendar · 18 events', color: 'var(--presence-soft)' },
    { name: 'Focus blocks', color: 'var(--insight)' },
    { name: 'Your priorities', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'crunch',
      num: '1',
      delay: 0,
      props: {
        title: 'Wednesday is overloaded',
        stat: '7 mtgs',
        delta: 'back-to-back',
        deltaDir: 'up',
        conf: 'strong',
        summary: "Six hours of meetings with no gap. That's where the week will feel hard.",
        sources: [{ file: 'Calendar' }],
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 90,
      props: {
        title: 'Your week, in three numbers',
        icon: 'clock',
        iconColor: 'var(--insight)',
        cols: 3,
        kpis: [
          { val: '18', label: 'Meetings', color: 'var(--warning)' },
          { val: '3h', label: 'Focus time', color: 'var(--insight)' },
          { val: '2', label: 'Free evenings', color: 'var(--insight)' },
        ],
        footer: 'Eighteen meetings is a lot for one week, and only three clean hours to think.',
      },
    },
    {
      type: 'timeline',
      col: 8,
      delay: 180,
      id: 'plan',
      props: {
        eyebrow: 'Your week at a glance',
        events: [
          {
            time: 'Mon',
            title: 'Easy start · 2 meetings',
            detail: 'Room to plan the week. Protect the morning.',
            color: 'var(--insight)',
          },
          {
            time: 'Tue',
            title: 'Focus morning',
            tag: 'protect this',
            detail: 'Your only clean block of deep work, guard it.',
            color: 'var(--presence)',
          },
          {
            time: 'Wed',
            title: 'The crunch · 7 meetings',
            tag: 'overloaded',
            detail: 'Back-to-back from 9 to 3. Move one to Friday?',
            color: 'var(--warning)',
          },
          {
            time: 'Thu',
            title: 'Balanced · 3 meetings',
            detail: 'Catch-up day. A little slack in the afternoon.',
            color: 'var(--insight)',
          },
          {
            time: 'Fri',
            title: 'Open afternoon',
            detail: 'Wind down, or pull a Wednesday meeting here.',
            color: 'var(--insight)',
          },
        ],
      },
    },
    {
      type: 'donut',
      col: 4,
      delay: 260,
      props: {
        title: 'Where the week goes',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Meetings', pct: 46, color: 'var(--warning)' },
          { label: 'Focus & deep work', pct: 14, color: 'var(--insight)' },
          { label: 'Admin & email', pct: 22, color: 'var(--presence-soft)' },
          { label: 'Breaks & buffer', pct: 18, color: 'var(--text-muted)' },
        ],
        footer: 'Nearly half the week is meetings, focus is the thinnest slice.',
      },
    },
    {
      type: 'list',
      col: 4,
      delay: 320,
      props: {
        title: 'Protect this week',
        icon: 'check',
        items: [
          "Tuesday's focus morning",
          "Lunch, it's getting skipped",
          'One Wednesday meeting → Friday',
          '30 min to plan, Monday AM',
        ],
      },
    },
    {
      type: 'heat',
      col: 12,
      delay: 400,
      props: {
        title: 'Where the week is dense',
        icon: 'clock',
        levelColor: 'var(--warning)',
        cols: ['9', '10', '11', '12', '1', '2', '3', '4', '5'],
        rows: [
          { label: 'Mon', cells: [1, 1, 0, 0, 1, 0, 0, 0, 0] },
          { label: 'Tue', cells: [0, 0, 0, 1, 1, 1, 0, 1, 0] },
          { label: 'Wed', cells: [3, 3, 2, 2, 3, 3, 1, 0, 0] },
          { label: 'Thu', cells: [1, 0, 1, 0, 1, 1, 0, 0, 0] },
          { label: 'Fri', cells: [1, 1, 0, 0, 0, 0, 0, 0, 0] },
        ],
        legend: ['Free', 'Packed'],
        footer: 'Wednesday is wall-to-wall; Friday afternoon is wide open.',
      },
    },
    {
      type: 'copingmenu',
      col: 6,
      delay: 760,
      props: {
        title: 'When Wednesday feels like too much',
        icon: 'spark',
        intro: 'Pick whatever feels possible — you don’t have to do all of them.',
        options: [
          {
            label: 'Take three slow breaths before the next call',
            detail: 'Resets your shoulders so the back-to-back stretch starts a little calmer.',
            effort: 'low',
            time: '1 min',
            icon: 'wind',
          },
          {
            label: 'Decline or shorten the one meeting that could move',
            detail: 'Even reclaiming 20 minutes makes the crunch breathable.',
            effort: 'medium',
            time: '5 min',
            icon: 'clock',
          },
          {
            label: 'Step outside for a short walk at lunch',
            detail: 'A change of light and air between blocks, no agenda.',
            effort: 'medium',
            time: '10 min',
            icon: 'walk',
          },
          {
            label: 'Block the first hour tomorrow as protected focus',
            detail: 'Gives the rest of the week one place that stays yours.',
            effort: 'high',
            time: '2 min',
            icon: 'shield',
          },
        ],
        footer: 'None of these have to be perfect — one is plenty for a heavy day.',
      },
    },
    {
      type: 'thoughtrecord',
      col: 8,
      delay: 840,
      props: {
        title: 'Working through Wednesday',
        icon: 'spark',
        situation: 'Looking at Wednesday’s back-to-back schedule Tuesday night.',
        automaticThought:
          'If I drop one thing on Wednesday, everyone will see I can’t actually handle this job.',
        emotion: 'Anxious',
        emotionIntensity: 80,
        evidenceFor: [
          'A meeting conflict slipped through last month and I had to reschedule a client call.',
          'The calendar really is packed, with no buffer between meetings.',
        ],
        evidenceAgainst: [
          'I’ve gotten through weeks this dense before without dropping anything major.',
          'My manager called out the prep work at last sprint’s review.',
          'Back-to-back isn’t overlapping — nothing on Wednesday needs split-second multitasking.',
        ],
        alternativeThought:
          'Wednesday is genuinely packed, but packed isn’t the same as unmanageable — a few minutes of prep Tuesday night turns it into one meeting at a time.',
        outcomeEmotion: 'Anxious',
        outcomeIntensity: 35,
        footer:
          'The intensity dropped once the evidence caught up with the fear — the schedule didn’t change, the story about it did.',
      },
    },
    {
      type: 'habittracker',
      col: 8,
      id: 'habit-week',
      delay: 1280,
      props: {
        title: 'Your habits this week',
        icon: 'check',
        iconColor: 'var(--presence)',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        habits: [
          { name: 'Morning walk', done: [true, true, true, false, true, true, true] },
          { name: 'Read 20 min', done: [true, true, true, true, true, false, true] },
          { name: 'No phone after 10', done: [false, true, false, true, false, true, false] },
          { name: 'Drink 2L water', done: [true, true, true, true, true, true, true] },
        ],
        caption: 'Strong week — phone curfew is the one to nudge',
        footer:
          'The water habit hit 7 of 7; the phone curfew at 3 of 7 is dragging the weekly average.',
      },
    },
    {
      type: 'readinglist',
      col: 6,
      id: 'reading',
      delay: 1360,
      props: {
        title: 'This week’s reading',
        icon: 'doc',
        iconColor: 'var(--presence)',
        books: [
          {
            title: 'Klara and the Sun',
            author: 'Kazuo Ishiguro',
            status: 'reading',
            rating: 4.5,
            discussionQuestions: [
              'Is Klara’s devotion to Josie a form of love, or something else entirely?',
              'What does the book suggest about what makes a person irreplaceable?',
            ],
          },
          {
            title: 'The Overstory',
            author: 'Richard Powers',
            status: 'queued',
          },
          {
            title: 'Educated',
            author: 'Tara Westover',
            status: 'done',
            rating: 5,
            discussionQuestions: [
              'How did you see the definition of "family" shift over the course of the memoir?',
            ],
          },
        ],
        footer: 'Book club meets Thursday — bring a Klara question if you finish it in time.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Setting it up',
      say: "I'll hold Tuesday morning as focus time, okay?",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'clock',
        title: 'Block Tuesday morning for focus',
        lines: [
          { k: 'Holds', v: 'Tue 9:00–11:30, “Focus, do not book”' },
          { k: 'On', v: 'Your work calendar' },
        ],
        perm: "Adds one event to your calendar. It won't message anyone.",
        cta: 'Block the time',
        doneText: 'Tuesday morning is blocked',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Event title', value: 'Focus — do not book' },
          { param: 'start', label: 'Start', value: '2026-06-16T09:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '150' },
        ],
      },
    },
  },

  group: 'home',
  tryChip: { label: "What's my week look like?", route: 'topic:week' },
  suggests: [
    { label: 'Block Tuesday for focus', icon: 'check', route: 'week:focus', lead: 'Try' },
    { label: "What's for dinner tonight?", icon: 'table', route: 'topic:meal' },
    { label: "How's my sleep?", icon: 'sparkle', route: 'topic:sleep' },
    { label: 'Plan my Lisbon trip', icon: 'clock', route: 'topic:trip' },
  ],
  intents: {
    focus: { kind: 'build', key: 'action' },
  },
  keywords: [
    {
      test: /my week|this week|schedule|calendar.*week|week.*look|busy|overload|focus time/,
      route: 'topic:week',
      sub: [{ test: /block|hold|protect|focus time/, route: 'week:focus' }],
    },
  ],
};

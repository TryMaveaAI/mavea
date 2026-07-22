// "How your running's going", six weeks of watch data showing a falling pace, rising
// volume, and the proof that the gains came from easy runs, not race days.
import type { ConversationSpec } from '../conversation';

export const fitness: ConversationSpec = {
  id: 'fitness',
  workspace: 'Your running',
  title: "How your running's going",
  sub: 'Six weeks of runs, straight from your watch.',
  opener: "You're getting faster, and it's not random. Here's why.",
  switchSay: "Nice, let's look at your running.",
  tint: '#3ed8a6',
  context: [
    { name: 'Watch · 23 runs', color: 'var(--presence-soft)' },
    { name: 'Route history', color: 'var(--insight)' },
    { name: 'Resting HR', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'pace',
      num: '1',
      delay: 0,
      prove: true,
      props: {
        title: 'Your pace dropped 38 seconds a mile',
        stat: '8:52',
        delta: '−0:38',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Six weeks ago you averaged 9:30. The gains came from your easy runs, not the hard ones.',
        sources: [{ file: 'Watch', loc: '23 runs' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'volume',
      num: '2',
      delay: 90,
      props: {
        title: "You're running more, but resting enough",
        stat: '14 mi',
        delta: '+5 / wk',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Volume climbed steadily, and your resting heart rate fell, which is the good sign.',
        sources: [{ file: 'Resting HR' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'long',
      num: '3',
      delay: 180,
      props: {
        title: 'Sunday long runs are your breakthrough',
        stat: '6.2 mi',
        delta: 'new best',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'Each long run added about a quarter mile. A 10K is within reach in a month.',
        sources: [{ file: 'Route history' }],
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 260,
      props: {
        title: 'Average pace per mile (lower is faster)',
        unit: '',
        labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6'],
        series: [
          {
            name: 'Your pace (min)',
            color: 'var(--presence)',
            data: [9.5, 9.4, 9.2, 9.1, 8.9, 8.87],
          },
          {
            name: 'Easy-run target',
            color: 'var(--text-muted)',
            data: [9.3, 9.3, 9.3, 9.3, 9.3, 9.3],
            area: false,
          },
        ],
        footer: 'Steady, not spiky, the shape of training that sticks.',
      },
    },
    {
      type: 'ring',
      col: 4,
      delay: 320,
      props: {
        title: "This week's goal",
        icon: 'spark',
        iconColor: 'var(--presence-soft)',
        rings: [
          {
            label: '16.4 / 18 mi',
            pct: 0.91,
            display: '91%',
            color: 'var(--presence)',
            hint: 'One easy run to go',
          },
        ],
      },
    },
    {
      type: 'heat',
      col: 12,
      delay: 380,
      props: {
        title: 'Training calendar · 6 weeks',
        icon: 'chart',
        levelColor: 'var(--presence)',
        cols: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        rows: [
          { label: 'Wk 1', cells: [1, 0, 2, 0, 1, 0, 2] },
          { label: 'Wk 2', cells: [1, 0, 2, 0, 1, 0, 2] },
          { label: 'Wk 3', cells: [1, 0, 3, 0, 1, 0, 2] },
          { label: 'Wk 4', cells: [2, 0, 3, 0, 1, 0, 3] },
          { label: 'Wk 5', cells: [2, 0, 3, 0, 2, 0, 3] },
          { label: 'Wk 6', cells: [2, 0, 3, 0, 2, 0, { lvl: 3, mark: '★' }] },
        ],
        legend: ['Rest', 'Hard'],
        footer: 'Easy days, one hard session a week, long run on Sundays, the shape that sticks.',
      },
    },
    {
      type: 'bodymap',
      col: 6,
      delay: 420,
      props: {
        title: 'Primary muscles worked, marathon training',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        regions: [
          { id: 'leftLeg', label: 'Quads', color: 'var(--presence)', note: 'primary drive' },
          { id: 'rightLeg', label: 'Quads', color: 'var(--presence)', note: 'primary drive' },
          { id: 'leftFoot', label: 'Calf', color: 'var(--insight)', note: 'push-off' },
          { id: 'rightFoot', label: 'Calf', color: 'var(--insight)', note: 'push-off' },
          { id: 'chest', label: 'Core', color: 'var(--warning)', note: 'stabiliser' },
        ],
        footer: 'Quads do the heavy lifting; calves absorb impact on every stride.',
      },
    },
    {
      type: 'calheat',
      col: 12,
      delay: 440,
      props: {
        title: 'Active days · last 13 weeks',
        icon: 'clock',
        iconColor: 'var(--presence)',
        color: 'var(--insight)',
        weekdays: ['', 'Mon', '', 'Wed', '', 'Fri', ''],
        // Same training shape, zoomed out to a quarter: Sun long run, quality Tue/Thu,
        // rest Mon/Sat, with a deliberate two-week taper around weeks 7–8.
        days: Array.from({ length: 91 }, (_, i) => {
          const dow = i % 7;
          const wk = Math.floor(i / 7);
          const base = [3, 0, 2, 1, 2, 1, 0][dow];
          let level = wk === 6 || wk === 7 ? Math.max(0, base - 1) : base;
          if (i % 19 === 0 && base > 0) level = 4;
          return { level };
        }),
        legend: ['Rest', 'Hard'],
        footer:
          'Thirteen weeks at a glance, the streak holds, with a deliberate taper in weeks 7–8.',
      },
    },
    {
      type: 'workoutplan',
      col: 7,
      delay: 660,
      props: {
        title: 'Half-Marathon Build Plan',
        goal: 'Sub-2:00 half marathon',
        weeks: 8,
        sessions: [
          {
            day: 'Tuesday',
            focus: 'Tempo Run',
            exercises: [
              { name: 'Warm-up jog', sets: 1, reps: '10 min easy' },
              { name: 'Tempo pace', sets: 3, reps: '2 km', rest: '90 sec' },
              { name: 'Cool-down', sets: 1, reps: '5 min easy' },
            ],
          },
          {
            day: 'Saturday',
            focus: 'Long Run',
            exercises: [{ name: 'Easy long run', sets: 1, reps: '14–18 km', rest: 'none' }],
          },
        ],
      },
    },
    {
      type: 'macrobreakdown',
      col: 5,
      delay: 750,
      props: {
        title: 'Race-day fuel target',
        calories: 2800,
        protein: 140,
        carbs: 360,
        fat: 70,
        fiber: 30,
        items: [
          { label: 'Morning oats + banana', calories: 520, protein: 18, carbs: 92, fat: 8 },
          { label: 'Mid-run gels (×3)', calories: 300, protein: 0, carbs: 75, fat: 0 },
          { label: 'Post-run chicken + rice', calories: 680, protein: 58, carbs: 70, fat: 14 },
        ],
      },
    },
    {
      type: 'runninglog',
      col: 7,
      id: 'runlog',
      delay: 830,
      props: {
        title: 'Your last six runs',
        icon: 'chart',
        unit: 'mi',
        entries: [
          { date: 'May 27', distance: 3.1, pace: '9:30', route: 'Riverside loop' },
          {
            date: 'May 29',
            distance: 4.0,
            pace: '9:22',
            route: 'Park hill repeats',
            elevationGainM: 62,
          },
          { date: 'Jun 1', distance: 5.0, pace: '9:08', route: 'Riverside loop' },
          { date: 'Jun 4', distance: 4.5, pace: '9:01', route: 'Downtown out-and-back' },
          {
            date: 'Jun 6',
            distance: 6.2,
            pace: '8:52',
            route: 'Ridge trail',
            elevationGainM: 118,
          },
          { date: 'Jun 8', distance: 5.5, pace: '8:52', route: 'Riverside loop' },
        ],
        footer: 'Distance climbed steadily while pace kept dropping — no single spike did this.',
      },
    },
    {
      type: 'zoneladder',
      col: 6,
      id: 'zones',
      delay: 760,
      props: {
        title: 'Your five heart-rate zones',
        icon: 'spark',
        iconColor: 'var(--presence)',
        metric: 'HR',
        current: 1,
        zones: [
          {
            name: 'Zone 1 · Recovery',
            range: '98–117 bpm',
            effort: 'Very easy — you could chat all day',
            purpose: 'Warm-up, cool-down, and active recovery between hard days',
          },
          {
            name: 'Zone 2 · Endurance',
            range: '118–137 bpm',
            effort: 'Comfortable; full sentences with light breathing',
            purpose: 'Builds your aerobic base and fat metabolism — where most miles live',
          },
          {
            name: 'Zone 3 · Tempo',
            range: '138–156 bpm',
            effort: 'Moderately hard; short phrases only',
            purpose: 'Sustained-effort fitness and stamina for race pace',
          },
          {
            name: 'Zone 4 · Threshold',
            range: '157–175 bpm',
            effort: 'Hard; a word or two at a time',
            purpose: 'Raises the pace you can hold before lactate builds up',
          },
          {
            name: 'Zone 5 · VO₂ max',
            range: '176–195 bpm',
            effort: 'All-out; no talking, short intervals only',
            purpose: 'Peak aerobic power — kept to brief, repeated bursts',
          },
        ],
        caption:
          'Zones are from an estimated max of ~195 bpm; a field or lab test gives truer numbers.',
      },
    },
    {
      type: 'streakgrid',
      col: 6,
      id: 'run-streak',
      delay: 1240,
      props: {
        title: 'Run streak',
        icon: 'spark',
        iconColor: 'var(--warning)',
        habit: 'Run',
        current: 12,
        best: 21,
        days: [
          { date: 'May 21', done: true },
          { date: 'May 22', done: true },
          { date: 'May 23', done: false },
          { date: 'May 24', done: true },
          { date: 'May 25', done: true },
          { date: 'May 26', done: true },
          { date: 'May 27', done: false },
          { date: 'May 28', done: true },
          { date: 'May 29', done: true },
          { date: 'May 30', done: true },
          { date: 'May 31', done: true },
          { date: 'Jun 1', done: true },
          { date: 'Jun 2', done: false },
          { date: 'Jun 3', done: true },
          { date: 'Jun 4', done: true },
          { date: 'Jun 5', done: true },
          { date: 'Jun 6', done: false },
          { date: 'Jun 7', done: true },
          { date: 'Jun 8', done: true },
          { date: 'Jun 9', done: true },
          { date: 'Jun 10', done: true },
          { date: 'Jun 11', done: true },
          { date: 'Jun 12', done: true },
          { date: 'Jun 13', done: true },
          { date: 'Jun 14', done: true },
          { date: 'Jun 15', done: true },
          { date: 'Jun 16', done: true },
          { date: 'Jun 17', done: true },
          { date: 'Jun 18', done: true },
          { date: 'Jun 19', done: true },
        ],
        caption: 'Twelve days clean — don’t break the chain',
        footer: 'Twelve straight, nine shy of your all-time best of 21.',
      },
    },
  ],
  proof: {
    spotId: 'pace',
    say: 'Here are your six fastest miles, all on easy days, not race days.',
    claim: 'Your pace dropped 38 seconds a mile',
    conf: 'strong',
    file: { label: 'Watch', type: 'csv', loc: '6 of 23 runs' },
    rows: [
      { a: 'Sun, Wk 6', b: 'long run · mile 4', c: '8:21', hot: true },
      { a: 'Mon, Wk 6', b: 'easy · mile 2', c: '8:34', hot: true },
      { a: 'Fri, Wk 5', b: 'easy · mile 3', c: '8:40' },
      { a: 'Wed, Wk 4', b: 'intervals', c: '7:58' },
      { a: 'Sun, Wk 3', b: 'long run', c: '9:02' },
    ],
    note: 'Your fastest sustained miles came on <mark>easy days in weeks 5–6</mark>, a sign your aerobic base is improving, not just your top speed.',
    assumptions: [
      'Pace is GPS-measured; tunnels or tree cover can add a few seconds.',
      '“Easy” vs “hard” is tagged from your heart-rate zones.',
    ],
  },
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: "Here's a little progress card worth keeping.",
      props: {
        kicker: 'RUNNING · 6 WEEKS',
        head: 'You got measurably faster',
        foot: 'Made by Mavéa · from 23 runs',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>38 seconds faster per mile</b>, from 9:30 down to 8:52 average.',
          },
          {
            color: 'var(--presence)',
            text: "<b>Resting heart rate fell</b> as volume rose, you're adapting, not overreaching.",
          },
          {
            color: 'var(--warning)',
            text: '<b>A 10K is ~4 weeks out</b> if the long run keeps growing a little each Sunday.',
          },
        ],
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second look at six weeks of progress.",
      props: {
        line: '“I asked if I’d actually gotten faster. Mavéa proved it across six weeks of runs, in 20 seconds.”',
      },
    },
  },

  group: 'health',
  tryChip: { label: "How's my running going?", route: 'topic:fitness' },
  suggests: [
    { label: "Prove I've gotten faster", icon: 'proof', route: 'fitness:proof', lead: 'Try' },
    { label: 'Save a progress card', icon: 'slides', route: 'slide' },
    { label: "How's my sleep?", icon: 'sparkle', route: 'topic:sleep' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    proof: { kind: 'proof' },
  },
  keywords: [
    {
      test: /run|running|jog|pace|workout|exercise|fitness|training|10k|marathon|miles?/,
      route: 'topic:fitness',
      sub: [{ test: /prove|how do you know|fastest|sure|evidence/, route: 'fitness:proof' }],
    },
  ],
};

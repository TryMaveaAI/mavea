// trivia.ts, "Family Trivia Night, Round 3", Mavéa runs a live trivia round for the room:
// the score so far (counter), who's leading head-to-head (scoreboard), the category mix
// (badgeset), the three questions to read aloud (radiogroup quizzes), a fun-fact reveal
// after the answer (pullquote), and the final standings when the buzzer goes (leaderboard).
// Playful, lively, fun for all ages. Showcases: insight · counter · scoreboard · badgeset ·
// radiogroup × 3 · pullquote · leaderboard.
import type { ConversationSpec } from '../conversation';

export const trivia: ConversationSpec = {
  id: 'trivia',
  workspace: 'Game night',
  title: 'Family Trivia Night, Round 3',
  sub: 'Four players, three questions, one comeback brewing. Read them out loud.',
  opener:
    "Round 3 is locked and loaded. The Martins are out front, but it's tight, three questions and someone's getting overtaken. Ready? Read the first one aloud.",
  switchSay: "Let's run a trivia round.",
  gather: 'Shuffling the deck · keeping score',
  found: "Buzzers up, here's your round, the scores, and the categories in play.",
  tint: '#ffb24a',
  context: [
    { name: '4 players', color: 'var(--presence)' },
    { name: 'Round 3 of 5', color: 'var(--insight)' },
    { name: 'Family-friendly', color: 'var(--presence-soft)' },
    { name: 'No phones!', color: 'var(--warning)' },
  ],
  blocks: [
    // ── opener narrative: two insight blocks ──
    {
      type: 'insight',
      col: 7,
      id: 'standings',
      num: '1',
      delay: 0,
      props: {
        title: 'The Martins lead, but the Gomez crew is one good round from stealing it',
        stat: '4 pts',
        delta: 'gap is closing',
        deltaDir: 'down',
        conf: 'strong',
        summary:
          "After two rounds it's 18–14–11–9. Each correct answer this round is worth 2 points, so the whole board is still up for grabs.",
        sources: [{ file: 'Scorecard', loc: 'after Round 2' }],
      },
    },
    {
      type: 'insight',
      col: 5,
      id: 'kids',
      num: '2',
      delay: 80,
      props: {
        title: 'The kids picked the categories tonight, expect cartoons and candy',
        stat: '5 topics',
        delta: 'all-ages mix',
        deltaDir: 'good',
        conf: 'partial',
        summary:
          'Animals, Space, Movies, Food, and a Geography curveball. Grandpa requested the Geography one. Good luck, everybody.',
        sources: [{ file: 'House rules', loc: 'kids choose' }],
      },
    },

    // ── the live score (counter) + head-to-head (scoreboard) ──
    {
      type: 'counter',
      col: 4,
      delay: 160,
      props: {
        title: 'Points on the board',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: 52,
        suffix: ' pts',
        label: 'Scored across all teams · Rounds 1–2',
        delta: '+24 this round up for grabs',
        deltaDir: 'up',
        color: 'var(--insight)',
        footer: 'Each right answer in Round 3 is worth <b>2 points</b>, steal the lead.',
      },
    },
    {
      type: 'scoreboard',
      col: 8,
      delay: 240,
      id: 'matchups',
      props: {
        title: 'Head-to-head, after Round 2',
        icon: 'chart',
        iconColor: 'var(--presence)',
        games: [
          {
            away: 'Gomez Crew',
            home: 'Team Martin',
            as: '14',
            hs: '18',
            status: 'LEAD',
            hot: true,
          },
          { away: 'The Aunties', home: 'Kid Squad', as: '11', hs: '9', status: 'CLOSE' },
        ],
        footer: 'Closest race of the night is The Aunties vs the Kid Squad, two points apart.',
      },
    },

    // ── the categories in play (badgeset) ──
    {
      type: 'badgeset',
      col: 5,
      delay: 320,
      props: {
        title: "Tonight's categories",
        icon: 'layers',
        iconColor: 'var(--presence-soft)',
        badges: [
          { label: 'Animals', variant: 'solid', color: 'var(--presence)', icon: 'spark' },
          { label: 'Space', variant: 'soft', color: 'var(--insight)', icon: 'moon' },
          { label: 'Movies', variant: 'soft', color: 'var(--presence-soft)', icon: 'play' },
          { label: 'Food', variant: 'outline', color: 'var(--warning)', icon: 'cart' },
          { label: 'Geography', variant: 'dot', color: 'var(--text-muted)', icon: 'globe' },
        ],
        countIcon: 'bell',
        count: 3,
        countColor: 'var(--warning)',
        footer: 'Three questions queued. Tap the bell when the room is ready.',
      },
    },
    {
      type: 'counter',
      col: 3,
      delay: 380,
      props: {
        title: 'On the clock',
        icon: 'clock',
        iconColor: 'var(--warning)',
        value: 30,
        suffix: 's',
        label: 'Per question · no shouting over each other',
        color: 'var(--warning)',
        footer: 'Half a minute to lock in an answer. Eyes off the phones!',
      },
    },

    // ── the three questions (radiogroup quizzes) ──
    {
      type: 'radiogroup',
      col: 6,
      delay: 460,
      id: 'q1',
      props: {
        title: 'Q1 · Animals, for 2 points',
        icon: 'spark',
        iconColor: 'var(--presence)',
        layout: 'card',
        options: [
          { label: 'A blue whale', caption: 'The biggest animal ever', value: 'A' },
          { label: 'An African elephant', caption: 'Biggest on land', value: 'B' },
          { label: 'A giant squid', caption: 'Mostly tentacles', value: 'C' },
          { label: 'A T. rex', caption: 'Long gone, sorry', value: 'D', disabled: true },
        ],
        selected: 0,
        color: 'var(--presence)',
        footer: 'The biggest animal that has ever lived. <b>Answer: a blue whale.</b>',
      },
    },
    {
      type: 'radiogroup',
      col: 6,
      delay: 540,
      id: 'q2',
      props: {
        title: 'Q2 · Space, for 2 points',
        icon: 'moon',
        iconColor: 'var(--insight)',
        layout: 'card',
        options: [
          { label: 'Mars', caption: 'The red one', value: 'A' },
          { label: 'Jupiter', caption: 'The giant one', value: 'B' },
          { label: 'Saturn', caption: 'The one with rings', value: 'C' },
          { label: 'Mercury', caption: 'Closest to the Sun', value: 'D' },
        ],
        selected: 1,
        color: 'var(--insight)',
        footer:
          'Which planet is the <mark>largest</mark> in our solar system? <b>Answer: Jupiter.</b>',
      },
    },
    {
      type: 'radiogroup',
      col: 12,
      delay: 620,
      id: 'q3',
      props: {
        title: 'Q3 · Geography, the curveball, for 2 points',
        icon: 'globe',
        iconColor: 'var(--text-muted)',
        layout: 'row',
        options: [
          { label: 'Australia', caption: 'It counts as both', value: 'A' },
          { label: 'Greenland', caption: "World's largest island", value: 'B' },
          { label: 'Madagascar', caption: 'Off the coast of Africa', value: 'C' },
          { label: 'Iceland', caption: 'Smaller than it sounds', value: 'D' },
        ],
        selected: 1,
        color: 'var(--presence-soft)',
        footer:
          "Grandpa's pick: the world's <mark>largest island</mark> that isn't a continent. <b>Answer: Greenland.</b>",
      },
    },

    // ── the fun-fact reveal (pullquote) ──
    {
      type: 'pullquote',
      col: 7,
      delay: 700,
      id: 'funfact',
      props: {
        title: 'Fun fact for the reveal',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        quote:
          "A blue whale's heart is about the size of a small car, and you could swim through some of its arteries.",
        author: 'Did you know?',
        role: 'Read this after Q1 for the gasp',
        tone: 'info',
        variants: [
          {
            quote:
              'Jupiter is so big that all the other planets in our solar system could fit inside it, with room to spare.',
            author: 'Did you know?',
            role: 'Save this one for after Q2',
          },
          {
            quote:
              'Despite the name, Greenland is mostly ice, and Iceland is surprisingly green. Whoever named them had a sense of humor.',
            author: 'Did you know?',
            role: "Grandpa's favorite, drop it after Q3",
          },
        ],
        footer: 'Tap to cycle to the next fact as you reveal each answer.',
      },
    },
    {
      type: 'badgeset',
      col: 5,
      delay: 760,
      props: {
        title: 'House rules',
        icon: 'shield',
        iconColor: 'var(--warning)',
        badges: [
          { label: 'No phones', variant: 'solid', color: 'var(--danger)', icon: 'lock' },
          { label: 'First to shout', variant: 'soft', color: 'var(--warning)', icon: 'mic' },
          { label: 'Kids get hints', variant: 'soft', color: 'var(--presence)', icon: 'spark' },
          { label: 'Good sport bonus', variant: 'outline', color: 'var(--insight)', icon: 'check' },
        ],
        footer: 'Break a rule and the point goes to the other team. You know who you are.',
      },
    },

    // ── the final standings (leaderboard) ──
    {
      type: 'leaderboard',
      col: 12,
      delay: 840,
      id: 'ranks',
      props: {
        title: 'Final standings, if the round ended now',
        icon: 'chart',
        iconColor: 'var(--insight)',
        metrics: [
          { key: 'pts', label: 'Points', unit: 'pts' },
          { key: 'streak', label: 'Best streak', unit: 'in a row' },
          { key: 'speed', label: 'Avg buzz', unit: 's' },
        ],
        rows: [
          {
            name: 'Team Martin',
            sub: 'Mom, Dad & the dog',
            values: { pts: 18, streak: 5, speed: 4 },
            move: 0,
          },
          {
            name: 'Gomez Crew',
            sub: 'Surging from behind',
            values: { pts: 14, streak: 4, speed: 5 },
            move: 1,
          },
          {
            name: 'The Aunties',
            sub: 'Quietly dangerous',
            values: { pts: 11, streak: 3, speed: 6 },
            move: -1,
          },
          {
            name: 'Kid Squad',
            sub: 'Crushing the cartoon round',
            values: { pts: 9, streak: 6, speed: 3 },
            move: 1,
          },
        ],
        metric: 0,
        accent: 'var(--insight)',
        footer:
          'Switch the metric, the <b>Kid Squad</b> has the fastest buzzes and the longest streak. Watch out.',
      },
    },
    {
      type: 'livescore',
      col: 5,
      delay: 600,
      props: {
        title: 'Keep score yourself',
        icon: 'spark',
        unit: 'pts',
        step: 1,
        entries: [
          { name: 'The Martins', score: 9, color: 'var(--presence)' },
          { name: 'Gomez crew', score: 7, color: 'var(--warning)' },
          { name: 'Kid Squad', score: 6, color: 'var(--insight)' },
        ],
        footer: 'Tap +/- as each round lands — the ranking updates as you go.',
      },
    },
    {
      type: 'gameboard',
      col: 7,
      id: 'trivia-gameboard',
      delay: 120,
      props: {
        title: 'Ruy López — the opening position',
        icon: 'layers',
        iconColor: 'var(--presence)',
        board: 'chess',
        size: 8,
        pieces: [
          { row: 7, col: 4, glyph: '♔', side: 'a' },
          { row: 7, col: 5, glyph: '♗', side: 'a' },
          { row: 7, col: 6, glyph: '♘', side: 'a' },
          { row: 4, col: 4, glyph: '♙', side: 'a' },
          { row: 6, col: 4, glyph: '♟', side: 'b' },
          { row: 5, col: 2, glyph: '♞', side: 'b' },
          { row: 0, col: 4, glyph: '♚', side: 'b' },
        ],
        highlights: [
          { row: 5, col: 2 },
          { row: 3, col: 1 },
        ],
        moves: [
          { from: [7, 5], to: [3, 1] },
          { from: [7, 6], to: [5, 5] },
        ],
        caption:
          'After 1.e4 e5 2.Nf3 Nc6 3.Bb5, White’s bishop pressures the c6 knight — the Ruy López.',
      },
    },
    {
      type: 'boardgamescore',
      col: 6,
      id: 'wingspan-score',
      delay: 200,
      props: {
        title: 'Wingspan, the side table',
        icon: 'table',
        iconColor: 'var(--insight)',
        game: 'Wingspan',
        players: [
          { name: 'Dana', roundScores: [8, 11, 14, 9], total: 42 },
          { name: 'Marco', roundScores: [10, 9, 15, 12], total: 46 },
          { name: 'Priya', roundScores: [7, 10, 12, 10], total: 39 },
        ],
        footer: 'Round 4 bird-cards bonus still to add once everyone reveals their hand.',
      },
    },
    {
      type: 'tierlist',
      col: 6,
      id: 'trivia-tierlist',
      delay: 920,
      props: {
        title: 'Category tier list, by how the room did',
        icon: 'layers',
        iconColor: 'var(--warning)',
        caption: "Ranked by tonight's hit rate, not difficulty on paper.",
        rows: [
          { tier: 'S', color: 'var(--danger)', items: ['Movie quotes', '90s cartoons'] },
          { tier: 'A', color: 'var(--warning)', items: ['World capitals', 'Music trivia'] },
          { tier: 'B', color: 'var(--insight)', items: ['Sports history'] },
          { tier: 'C', color: 'var(--text-muted)', items: [] },
        ],
        footer: 'Nobody touched a C-tier question tonight — maybe next round.',
      },
    },
    {
      type: 'seatingchart',
      col: 8,
      id: 'trivia-seating',
      delay: 1000,
      props: {
        title: 'Table assignments',
        icon: 'table',
        iconColor: 'var(--presence)',
        venue: "O'Malley's back room",
        tables: [
          { id: 't1', label: 'Team Martin', seats: 4, shape: 'round' },
          { id: 't2', label: 'Gomez Crew', seats: 4, shape: 'round' },
          { id: 't3', label: 'The Aunties', seats: 4, shape: 'round' },
          { id: 't4', label: 'Kid Squad', seats: 6, shape: 'rect' },
        ],
        assignments: [
          { tableId: 't1', seatIndex: 0, guest: 'Dana Martin' },
          { tableId: 't1', seatIndex: 1, guest: 'Rob Martin' },
          { tableId: 't1', seatIndex: 2, guest: 'Pepper (the dog)' },
          { tableId: 't2', seatIndex: 0, guest: 'Elena Gomez' },
          { tableId: 't2', seatIndex: 1, guest: 'Marco Gomez' },
          { tableId: 't3', seatIndex: 0, guest: 'Bev' },
          { tableId: 't3', seatIndex: 1, guest: 'Franny' },
          { tableId: 't3', seatIndex: 2, guest: 'Colleen' },
          { tableId: 't4', seatIndex: 0, guest: 'Theo' },
          { tableId: 't4', seatIndex: 1, guest: 'Priya' },
          { tableId: 't4', seatIndex: 2, guest: 'Sam' },
        ],
        footer: 'A few open seats left at Team Martin and Kid Squad — send stragglers there.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll tally Round 3 and update everyone's totals.",
      props: {
        eyebrow: 'Action · scorekeeper',
        icon: 'check',
        title: 'Lock in Round 3 scores',
        lines: [
          { k: 'Updates', v: '4 teams · 2 pts per correct' },
          { k: 'Then', v: 'Reshuffle for Round 4' },
        ],
        perm: 'Mavéa will update the scorecard for tonight only. Nothing leaves this room.',
        cta: 'Tally the round',
        doneText: 'Round 3 locked, onto Round 4!',
      },
    },
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the reveal',
      say: "Here's a big answer-reveal slide for the TV.",
      props: {
        kicker: 'TRIVIA NIGHT · ROUND 3 ANSWERS',
        head: 'Whale, Jupiter, Greenland',
        foot: 'Made by Mavéa · Family Game Night',
        bullets: [
          {
            color: 'var(--presence)',
            text: '<b>Q1 · Animals:</b> the blue whale, biggest animal ever.',
          },
          { color: 'var(--insight)', text: '<b>Q2 · Space:</b> Jupiter, the largest planet.' },
          {
            color: 'var(--presence-soft)',
            text: "<b>Q3 · Geography:</b> Greenland, world's largest island.",
          },
        ],
      },
    },
  },

  group: 'household',
  tryChip: { label: 'Run a trivia round', route: 'topic:trivia' },
  suggests: [
    { label: 'Reveal the answers', icon: 'sparkle', route: 'trivia:funfact', lead: 'Try' },
    { label: 'Show the final standings', icon: 'chart', route: 'trivia:ranks' },
    { label: 'Put the answers on the TV', icon: 'slides', route: 'slide' },
    { label: 'Tally the round', icon: 'check', route: 'send' },
    { label: 'Plan our game-night snacks', icon: 'cart', route: 'topic:meal' },
  ],
  intents: {
    funfact: {
      kind: 'spotlight',
      spotId: 'funfact',
      say: 'And here come the fun facts, read these as you reveal each answer.',
    },
    ranks: {
      kind: 'spotlight',
      spotId: 'ranks',
      say: "Here's where everyone stands if we called it right now.",
    },
    matchups: {
      kind: 'spotlight',
      spotId: 'matchups',
      say: "And here's the head-to-head, the Aunties and the Kid Squad are neck and neck.",
    },
  },
  keywords: [
    {
      test: /trivia|quiz|game night|board game|family game|round \d|read the question|next question|whose turn/i,
      route: 'topic:trivia',
      sub: [
        {
          test: /answer|reveal|fun fact|what.?s the answer|correct/i,
          route: 'trivia:funfact',
        },
        {
          test: /standing|leaderboard|who.?s winning|final score|ranks?/i,
          route: 'trivia:ranks',
        },
      ],
    },
  ],
};

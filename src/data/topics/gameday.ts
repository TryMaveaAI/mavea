// gameday.ts, "How's my team doing tonight?" Warriors are up 6 on the Lakers with 4:12
// left in the 4th. A live-ish hype board: the scoreboard, the head-to-head team stats
// (comparebars), tonight's top scorers (leaderboard), the West standings, the 7-game win
// streak (trendtile), the quarter-by-quarter game flow (statustimeline), the key-play
// timeline that decided it, and a look ahead at Thursday's opponent (scoutingreport).
// Energetic, fun, fan-first.
// Component keys: insight, scoreboard, comparebars, leaderboard, standings, trendtile,
// statustimeline, timeline, kpi, donut, ring, scoutingreport.
import type { ConversationSpec } from '../conversation';

export const gameday: ConversationSpec = {
  id: 'gameday',
  workspace: 'Game day',
  title: 'Warriors are closing it out',
  sub: 'Up 6 on the Lakers, 4:12 left, Steph has 38 and the building is electric.',
  opener:
    "Your Warriors are up 6 with four to go and Steph just hit his eighth three. They're cooking, here's the whole night at a glance.",
  switchSay: "Let's check the game.",
  gather: 'Pulling the live feed · box score',
  found: "It's tight, but they've got control. Here's where it stands.",
  tint: '#1e6fff',
  context: [
    { name: 'Warriors vs Lakers', color: 'var(--presence)' },
    { name: 'Q4 · 4:12', color: 'var(--warning)' },
    { name: 'Chase Center', color: 'var(--insight)' },
    { name: 'Live box score', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative ──
    {
      type: 'insight',
      col: 8,
      id: 'lead',
      num: '1',
      delay: 0,
      props: {
        title: 'Golden State leads 108–102 with 4:12 to play',
        stat: '+6',
        delta: 'led by as much as 14',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'A 9–0 run out of the third-quarter timeout flipped a one-point game. The defense has held LeBron and AD to 4-of-13 in the second half.',
        sources: [{ file: 'Live box score', loc: 'Q4 splits' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'steph',
      num: '2',
      delay: 80,
      props: {
        title: 'Steph is going off, 38 on 8 threes',
        stat: '38 PTS',
        delta: '8/13 from deep',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'He has 19 in the second half alone. Every time L.A. cut it to one possession, he answered.',
        sources: [{ file: 'Live box score', loc: 'player line' }],
      },
    },

    // ── the live scoreboard ──
    {
      type: 'scoreboard',
      col: 12,
      delay: 160,
      id: 'board',
      props: {
        title: 'Tonight around the league',
        icon: 'chart',
        iconColor: 'var(--presence)',
        games: [
          { away: 'LAL', home: 'GSW', as: '102', hs: '108', status: 'Q4 · 4:12', hot: true },
          { away: 'BOS', home: 'NYK', as: '99', hs: '94', status: 'Q4 · 2:38' },
          { away: 'DEN', home: 'MIN', as: '88', hs: '91', status: 'Q3 · 5:01' },
          { away: 'MIL', home: 'PHI', as: '116', hs: '112', status: 'Final' },
          { away: 'PHX', home: 'DAL', as: '71', hs: '69', status: 'Half' },
        ],
        footer: 'Your game is the close one, Warriors by 6 and pulling away.',
      },
    },

    // ── trendtile: the win streak ──
    {
      type: 'trendtile',
      col: 4,
      delay: 240,
      id: 'streak',
      props: {
        title: 'Win streak',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: '7',
        delta: '+7 straight',
        deltaDir: 'up',
        color: 'var(--insight)',
        bars: [110, 98, 121, 104, 115, 99, 108],
        footer: 'Seven in a row if this holds, longest run of the season.',
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 300,
      props: {
        title: "Tonight's pulse",
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        cols: 4,
        kpis: [
          { val: '108', label: 'GSW points', color: 'var(--presence)' },
          { val: '+6', label: 'Lead', color: 'var(--insight)' },
          { val: '16', label: 'Threes made', color: 'var(--insight)' },
          { val: '4:12', label: 'Time left', color: 'var(--warning)' },
        ],
        footer: 'Sixteen made threes, two off the franchise record with four minutes left.',
      },
    },

    // ── comparebars: head-to-head team stats ──
    {
      type: 'comparebars',
      col: 7,
      delay: 380,
      id: 'h2h',
      props: {
        title: 'Head to head, tonight',
        icon: 'table',
        iconColor: 'var(--presence)',
        series: [
          { name: 'Warriors', color: 'var(--presence)' },
          { name: 'Lakers', color: 'var(--warning)' },
        ],
        highlight: 0,
        rows: [
          { label: 'Points', values: [108, 102], unit: 'pts', higherBetter: true },
          { label: 'FG%', values: [49, 44], unit: '%', higherBetter: true },
          { label: '3-pt made', values: [16, 9], higherBetter: true },
          { label: 'Rebounds', values: [41, 46], higherBetter: true },
          { label: 'Assists', values: [29, 22], higherBetter: true },
          { label: 'Turnovers', values: [9, 14], higherBetter: false },
        ],
        footer:
          'The three-point gap (16 vs 9) is the whole game, L.A. wins the glass but loses the math.',
      },
    },
    {
      type: 'donut',
      col: 5,
      delay: 440,
      props: {
        title: 'Where the 108 came from',
        icon: 'chart',
        iconColor: 'var(--insight)',
        rows: [
          { label: 'Threes', pct: 44, color: 'var(--insight)' },
          { label: 'Twos', pct: 38, color: 'var(--presence)' },
          { label: 'Free throws', pct: 12, color: 'var(--presence-soft)' },
          { label: 'Fast break', pct: 6, color: 'var(--warning)' },
        ],
        footer: 'Nearly half the points are from deep, live by the three, win by the three.',
      },
    },

    // ── leaderboard: top scorers tonight ──
    {
      type: 'leaderboard',
      col: 7,
      delay: 520,
      id: 'scorers',
      props: {
        title: "Tonight's top scorers",
        icon: 'spark',
        iconColor: 'var(--insight)',
        accent: 'var(--presence)',
        metric: 0,
        metrics: [
          { key: 'pts', label: 'PTS' },
          { key: 'reb', label: 'REB' },
          { key: 'ast', label: 'AST' },
        ],
        rows: [
          {
            name: 'Stephen Curry',
            sub: 'GSW · 8 threes',
            values: { pts: 38, reb: 5, ast: 7 },
            move: 1,
          },
          { name: 'LeBron James', sub: 'LAL', values: { pts: 29, reb: 8, ast: 9 }, move: -1 },
          { name: 'Anthony Davis', sub: 'LAL', values: { pts: 24, reb: 13, ast: 2 }, move: 0 },
          { name: 'Jonathan Kuminga', sub: 'GSW', values: { pts: 19, reb: 6, ast: 3 }, move: 2 },
          {
            name: 'Buddy Hield',
            sub: 'GSW · 5 threes',
            values: { pts: 17, reb: 2, ast: 4 },
            move: 1,
          },
        ],
        footer:
          'Tap a column to re-rank by boards or dimes, Steph leads scoring, AD owns the glass.',
      },
    },
    {
      type: 'ring',
      col: 5,
      delay: 580,
      props: {
        title: "Steph's night, by the numbers",
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        rings: [
          { pct: 0.62, display: '8/13', unit: '', label: 'From three', color: 'var(--insight)' },
          { pct: 0.71, display: '12/17', unit: '', label: 'Field goals', color: 'var(--presence)' },
          {
            pct: 1.0,
            display: '6/6',
            unit: '',
            label: 'Free throws',
            color: 'var(--presence-soft)',
          },
        ],
        footer: '62% from deep on 13 attempts, this is a heat check that never cooled off.',
      },
    },

    // ── statustimeline: the game flow, quarter by quarter ──
    {
      type: 'statustimeline',
      col: 12,
      delay: 660,
      id: 'flow',
      props: {
        title: 'How the game has flowed',
        icon: 'clock',
        iconColor: 'var(--presence)',
        events: [
          {
            time: 'Q1',
            label: 'Even start, 28–27 GSW',
            status: 'done',
            detail: 'Traded buckets, neither team led by more than 4.',
          },
          {
            time: 'Q2',
            label: 'Lakers surge, lead by 5 at half',
            status: 'done',
            detail: 'AD bullied the paint; L.A. went up 56–51.',
          },
          {
            time: 'Q3',
            label: '9–0 run flips it',
            status: 'done',
            detail: 'Curry + Kuminga out of the timeout, GSW retakes the lead for good.',
          },
          {
            time: 'Q4 · now',
            label: 'Warriors up 6, closing',
            status: 'progress',
            detail: 'Defense locked in; L.A. is 4-of-13 in the half.',
          },
          {
            time: 'Final',
            label: 'Win probability 88%',
            status: 'pending',
            detail: 'A two-possession lead with the ball and the clock on their side.',
          },
        ],
        footer: 'Filter by status, the green stretch (Q3 run) is where this game turned.',
      },
    },

    // ── key-play timeline ──
    {
      type: 'timeline',
      col: 7,
      delay: 740,
      id: 'plays',
      props: {
        eyebrow: 'The plays that decided it',
        title: 'Key moments',
        events: [
          {
            time: '6:48 Q3',
            title: 'Curry pull-up three',
            detail: 'Ties it at 64 and ignites the Chase Center crowd.',
            tag: 'spark',
            color: 'var(--insight)',
          },
          {
            time: '5:20 Q3',
            title: 'Kuminga slam off the steal',
            detail: 'Caps the 9–0 run, GSW takes the lead 71–64.',
            tag: 'run',
            color: 'var(--presence)',
          },
          {
            time: '0:58 Q3',
            title: 'Hield buzzer-beater three',
            detail: 'Beats the quarter horn from the logo. +8 going to the fourth.',
            tag: 'dagger',
            color: 'var(--insight)',
          },
          {
            time: '5:01 Q4',
            title: 'Green blocks AD at the rim',
            detail: 'Swats the and-1 chance and starts the break.',
            tag: 'D',
            color: 'var(--warning)',
          },
          {
            time: '4:30 Q4',
            title: 'Steph three #8, the dagger',
            detail: 'Pushes it back to +6 and the bench erupts.',
            tag: 'clutch',
            color: 'var(--insight)',
          },
        ],
      },
    },
    {
      type: 'standings',
      col: 5,
      delay: 800,
      id: 'west',
      props: {
        title: 'Western Conference',
        icon: 'table',
        iconColor: 'var(--presence-soft)',
        rows: [
          { team: 'Thunder', rec: '41–9', gb: '-' },
          { team: 'Nuggets', rec: '36–14', gb: '5.0' },
          { team: 'Warriors', rec: '34–16', gb: '7.0' },
          { team: 'Timberwolves', rec: '33–17', gb: '8.0' },
          { team: 'Lakers', rec: '31–19', gb: '10.0' },
          { team: 'Clippers', rec: '30–20', gb: '11.0' },
        ],
        footer: 'A win tonight moves the Warriors within a game of Denver for the 2-seed.',
      },
    },
    {
      type: 'bump',
      col: 7,
      delay: 860,
      props: {
        title: 'West seeding race · by month',
        icon: 'chart',
        iconColor: 'var(--presence)',
        periods: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
        series: [
          { label: 'Thunder', color: 'var(--presence)', ranks: [2, 1, 1, 1, 1] },
          { label: 'Nuggets', color: 'var(--insight)', ranks: [1, 2, 2, 3, 2] },
          { label: 'Warriors', color: 'var(--warning)', ranks: [5, 4, 4, 2, 3] },
          { label: 'Wolves', color: 'var(--presence-soft)', ranks: [3, 3, 3, 4, 4] },
          { label: 'Lakers', color: 'var(--text-muted)', ranks: [4, 5, 6, 5, 5] },
          { label: 'Clippers', color: 'var(--danger)', ranks: [6, 6, 5, 6, 6] },
        ],
        footer:
          'The Thunder seized the top seed in December and never let go; the Warriors’ February surge is the real story.',
      },
    },
    {
      type: 'scoutingreport',
      col: 8,
      delay: 940,
      id: 'scouting',
      props: {
        title: "Up next: scouting Thursday's Nuggets",
        icon: 'chart',
        iconColor: 'var(--presence)',
        opponent: 'Denver Nuggets',
        tendencies: [
          "Run their offense almost entirely through Jokić at the elbow, he's averaging 9 assists a game from the post.",
          "Switch aggressively on the perimeter, which has bothered Golden State's off-ball movement in past meetings.",
          'Struggle to defend in transition, allowing the 4th-most fast-break points in the league.',
          'Lean heavily on their bench trio in the second quarter, often their most vulnerable defensive stretch.',
        ],
        matchupNotes: [
          {
            label: 'Pace',
            note: 'Denver plays slower than Golden State prefers; expect the Warriors to push tempo early rather than get pulled into a half-court grind.',
          },
          {
            label: 'Rebounding',
            note: 'The Nuggets crash the offensive glass hard, Golden State needs to box out or risk giving up second-chance points.',
          },
          {
            label: '3-point defense',
            note: "Denver ranks middle-of-the-pack defending the arc, exactly where Golden State's offense lives.",
          },
        ],
        keyPlayers: [
          {
            name: 'Nikola Jokić',
            role: 'C',
            note: "Reigning MVP-caliber center who doubles as their point guard from the elbow. He's a step slower going left, force him that direction.",
          },
          {
            name: 'Jamal Murray',
            role: 'PG',
            note: 'Streaky scorer who heats up in isolation late in games; live with early clock jumpers rather than switching everything off him.',
          },
          {
            name: 'Aaron Gordon',
            role: 'PF',
            note: 'Their best transition finisher, get back on makes and misses alike.',
          },
        ],
        footer:
          'A win Thursday pulls the Warriors within one game of Denver for the 2-seed, exactly the matchup the West race hinges on.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the recap',
      say: "Here's a one-card recap of the night.",
      props: {
        kicker: 'GAME RECAP · WARRIORS vs LAKERS',
        head: 'Steph drops 38, Warriors take it 108–102',
        foot: 'Made by Mavéa · live box score',
        bullets: [
          {
            color: 'var(--insight)',
            text: '<b>38 points · 8 threes</b>, Curry answered every L.A. run.',
          },
          {
            color: 'var(--presence)',
            text: '<b>16 made threes</b> to the Lakers’ 9, the math won the night.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Win #7 in a row</b>, within a game of the 2-seed in the West.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I can't ping your phone, but I'll flag it here when it's final.",
      props: {
        eyebrow: 'Action · watch',
        icon: 'eye',
        title: 'Flag the Warriors–Lakers final here',
        lines: [
          { k: 'Watching', v: 'Warriors vs Lakers' },
          { k: 'Shows', v: 'Right here on this board when it wraps' },
        ],
        perm: "This only marks the card, Mavéa can't send phone notifications.",
        cta: 'Flag it',
        doneText: 'Flagged — check back here for the final',
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Cutting the highlights',
      say: "Here's a 20-second highlight cut of the run.",
      props: {
        line: '“The Warriors trailed by 5 at the half, ripped off a 9–0 run, and Steph closed it with his eighth three. Twenty seconds, the whole turn.”',
      },
    },
  },

  group: 'home',
  tryChip: { label: "How's my team doing tonight?", route: 'topic:gameday' },
  suggests: [
    { label: 'Show me the key plays', icon: 'play', route: 'gameday:plays', lead: 'Try' },
    { label: 'Prove the head-to-head', icon: 'table', route: 'gameday:h2h' },
    { label: 'Flag it at the final', icon: 'eye', route: 'send' },
    { label: 'Cut the highlights', icon: 'sparkle', route: 'replay' },
    { label: "How's my running going?", icon: 'chart', route: 'topic:fitness' },
  ],
  intents: {
    plays: {
      kind: 'spotlight',
      spotId: 'plays',
      say: 'Here are the plays that turned the game.',
    },
    h2h: {
      kind: 'spotlight',
      spotId: 'h2h',
      say: 'Side by side, the three-point gap is the story.',
    },
    streak: {
      kind: 'spotlight',
      spotId: 'streak',
      say: 'And this would be seven straight.',
    },
    west: {
      kind: 'spotlight',
      spotId: 'west',
      say: "Here's where it puts them in the West.",
    },
  },
  keywords: [
    {
      test: /score|game|tonight|warriors|lakers|my team|who.?s winning|nba|playing|matchup|how.?d (we|they) do/i,
      route: 'topic:gameday',
      sub: [
        { test: /key play|highlight|big play|what happened|the run/i, route: 'gameday:plays' },
        { test: /head.?to.?head|stats|compare|vs|matchup/i, route: 'gameday:h2h' },
        { test: /standing|seed|conference|where.?s? (we|they)/i, route: 'gameday:west' },
      ],
    },
  ],
};

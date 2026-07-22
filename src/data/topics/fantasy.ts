// fantasy.ts, "Who should I start this week?" Your Week 11 lineup, optimized.
// A fantasy-football command center: the full roster as a sortable datatable, projections
// head-to-head (comparebars), a start/sit edge matrix (matrixgrid), the league ladder
// (standings + leaderboard), player form (trendtile), projected-vs-needed (bulletkpi),
// and an injury alert (callout), the projected playoff bracket (tournamentbracket), the
// winning edge, shown not told.
// Component keys: insight · datatable · comparebars · matrixgrid · standings · leaderboard
// · trendtile · bulletkpi · callout · scoreboard · compare · tournamentbracket.
import type { ConversationSpec } from '../conversation';

export const fantasy: ConversationSpec = {
  id: 'fantasy',
  workspace: 'The Gridiron Gurus',
  title: 'Your Week 11 lineup, optimized',
  sub: 'Start the hot hand, sit the smoke screen, you’re projected to win by 9.',
  opener:
    'Start Achane over Pollard and flex Nabers, you’re projected for 121.4, eight clear of Dave’s squad. One injury changes everything, so read the alert.',
  switchSay: 'Let’s set your Week 11 lineup.',
  gather: 'Pulling projections · injury reports · matchups',
  found: 'Lineup locked and loaded, here’s the edge, position by position.',
  tint: '#3ddc84',
  context: [
    { name: 'Week 11 · vs Dave', color: 'var(--presence)' },
    { name: 'Roster · 15 players', color: 'var(--insight)' },
    { name: 'Injury report · live', color: 'var(--warning)' },
    { name: 'PPR scoring', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two insights ──
    {
      type: 'insight',
      col: 8,
      id: 'edge',
      num: '1',
      delay: 0,
      props: {
        title: 'Your optimal lineup projects to 121.4, an 8-point edge',
        stat: '121.4',
        delta: '+8.0 vs Dave',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Three swaps flip a coin-flip into a comfortable win: <b>Achane in for Pollard</b>, <b>Nabers into the flex</b>, and <b>Tucker to the bench</b>. The model gives you a 67% win probability.',
        sources: [{ file: 'Week 11 projections', loc: 'consensus' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'risk',
      num: '2',
      delay: 80,
      props: {
        title: 'One name to watch before kickoff',
        stat: 'Questionable',
        delta: 'Achane · ankle',
        deltaDir: 'down',
        conf: 'partial',
        summary:
          'Achane is trending toward active but practiced limited Friday. If he’s out, <b>Pollard is your handcuff</b>, same projection floor, lower ceiling.',
        sources: [{ file: 'Injury report', loc: 'Fri PM' }],
      },
    },

    // ── injury alert: callout ──
    {
      type: 'callout',
      col: 12,
      delay: 160,
      id: 'alert',
      props: {
        title: 'Injury alert, set a backup plan',
        icon: 'alert',
        iconColor: 'var(--warning)',
        tone: 'warn',
        kicker: 'Heads up',
        body: 'Two of your starters carry game-time tags. Lock them only if you can check your phone 90 minutes before kickoff, otherwise pivot now to a clean projection.',
        points: [
          '<b>De’Von Achane</b> (RB · ankle), <mark>Questionable</mark>, trending active. Plan B: Tony Pollard.',
          '<b>Malik Nabers</b> (WR · groin), <mark>Probable</mark>, full practice Friday. Safe to start.',
          '<b>CeeDee Lamb</b> (WR · shoulder), <mark>Active</mark>, no limitation. No action needed.',
        ],
        footer: 'I’ll ping you if any tag changes between now and Sunday 1:00 ET.',
      },
    },

    // ── the roster: datatable ──
    {
      type: 'datatable',
      col: 12,
      delay: 240,
      id: 'roster',
      props: {
        title: 'Your roster, sorted by projection',
        icon: 'table',
        iconColor: 'var(--presence)',
        columns: [
          { key: 'player', label: 'Player' },
          { key: 'pos', label: 'Pos' },
          { key: 'opp', label: 'Matchup' },
          { key: 'proj', label: 'Proj', align: 'right', numeric: true, color: 'var(--insight)' },
          { key: 'def', label: 'vs Def Rank', align: 'right', numeric: true },
          { key: 'status', label: 'Status', align: 'right' },
        ],
        rows: [
          {
            player: 'Josh Allen',
            pos: 'QB',
            opp: 'vs KC',
            proj: '24.6',
            def: '12',
            status: 'Start',
          },
          {
            player: 'De’Von Achane',
            pos: 'RB',
            opp: '@ LV',
            proj: '19.8',
            def: '28',
            status: 'Start*',
          },
          {
            player: 'CeeDee Lamb',
            pos: 'WR',
            opp: 'vs HOU',
            proj: '18.2',
            def: '9',
            status: 'Start',
          },
          {
            player: 'Malik Nabers',
            pos: 'WR',
            opp: '@ CAR',
            proj: '17.5',
            def: '31',
            status: 'Flex',
          },
          {
            player: 'Tony Pollard',
            pos: 'RB',
            opp: 'vs JAX',
            proj: '13.1',
            def: '18',
            status: 'Bench',
          },
          {
            player: 'Trey McBride',
            pos: 'TE',
            opp: '@ SEA',
            proj: '12.4',
            def: '14',
            status: 'Start',
          },
          {
            player: 'Jaylen Waddle',
            pos: 'WR',
            opp: '@ LV',
            proj: '11.9',
            def: '22',
            status: 'Bench',
          },
          {
            player: 'Justin Tucker',
            pos: 'K',
            opp: 'vs PIT',
            proj: '7.8',
            def: '20',
            status: 'Bench',
          },
          {
            player: 'Bills D/ST',
            pos: 'DEF',
            opp: 'vs KC',
            proj: '6.5',
            def: '-',
            status: 'Start',
          },
        ],
        sortKey: 'proj',
        sortDir: 'desc',
        searchable: true,
        searchPlaceholder: 'Filter by player or position…',
        footer:
          '<b>Start*</b> = injury-contingent. Tap a column to re-sort; the model already ranked it for you.',
      },
    },

    // ── projections head-to-head: comparebars ──
    {
      type: 'comparebars',
      col: 7,
      delay: 320,
      id: 'projections',
      props: {
        title: 'The three lineup decisions, by the numbers',
        icon: 'chart',
        iconColor: 'var(--insight)',
        series: [
          { name: 'Start', color: 'var(--presence)' },
          { name: 'Sit', color: 'var(--text-muted)' },
        ],
        rows: [
          {
            label: 'RB2 · Achane vs Pollard',
            values: [19.8, 13.1],
            unit: 'pts',
            higherBetter: true,
          },
          {
            label: 'Flex · Nabers vs Waddle',
            values: [17.5, 11.9],
            unit: 'pts',
            higherBetter: true,
          },
          {
            label: 'TE · McBride vs Hockenson',
            values: [12.4, 9.6],
            unit: 'pts',
            higherBetter: true,
          },
          { label: 'DEF · Bills vs Dolphins', values: [6.5, 4.2], unit: 'pts', higherBetter: true },
        ],
        highlight: 0,
        footer:
          'Every green bar is a player I’m moving <b>into</b> your lineup, that’s +16.4 vs your saved roster.',
      },
    },

    // ── player form: trendtile ──
    {
      type: 'trendtile',
      col: 5,
      delay: 400,
      id: 'form',
      props: {
        title: 'Achane is heating up',
        icon: 'spark',
        iconColor: 'var(--insight)',
        value: '19.8 proj',
        delta: '+34% L4',
        deltaDir: 'up',
        color: 'var(--presence)',
        bars: [9.4, 11.2, 14.8, 16.1, 21.6, 19.8],
        footer:
          'Six straight weeks of double-digit PPR, and Vegas just an <b>elite matchup</b> at LV (28th vs RB).',
      },
    },

    // ── start/sit edge matrix: matrixgrid ──
    {
      type: 'matrixgrid',
      col: 7,
      delay: 480,
      id: 'matrix',
      props: {
        title: 'Start / sit edge, players × factors',
        icon: 'layers',
        iconColor: 'var(--presence)',
        rowLabels: ['Achane', 'Nabers', 'McBride', 'Pollard', 'Waddle'],
        colLabels: ['Matchup', 'Volume', 'Form', 'Health', 'Vegas'],
        cells: [
          [0.92, 0.85, 0.88, 0.55, 0.8],
          [0.95, 0.78, 0.74, 0.7, 0.66],
          [0.62, 0.81, 0.69, 0.9, 0.58],
          [0.6, 0.48, 0.52, 0.95, 0.61],
          [0.5, 0.44, 0.46, 0.88, 0.54],
        ],
        min: 0,
        max: 1,
        accent: 'var(--presence)',
        unit: '',
        legend: ['sit', 'start'],
        footer:
          'Greener = stronger edge. Achane and Nabers light up everywhere but the injury column, hence the alert.',
      },
    },

    // ── projected vs needed: bulletkpi ──
    {
      type: 'bulletkpi',
      col: 5,
      delay: 560,
      id: 'needed',
      props: {
        title: 'Projected vs. needed to win',
        icon: 'proof',
        iconColor: 'var(--insight)',
        rows: [
          {
            label: 'Total points',
            value: 121.4,
            target: 113.4,
            max: 140,
            display: '121.4',
            color: 'var(--presence)',
          },
          {
            label: 'RB group',
            value: 32.9,
            target: 28.0,
            max: 45,
            display: '32.9',
            color: 'var(--presence)',
          },
          {
            label: 'WR group',
            value: 35.7,
            target: 34.0,
            max: 45,
            display: '35.7',
            color: 'var(--insight)',
          },
          {
            label: 'Floor (10th pct)',
            value: 104.0,
            target: 113.4,
            max: 140,
            display: '104.0',
            color: 'var(--warning)',
          },
        ],
        footer:
          'You clear the bar on projection, but your <b>floor sits below Dave’s median</b>. Achane staying active is the swing.',
      },
    },

    // ── the explicit decision: compare (core) ──
    {
      type: 'compare',
      col: 12,
      delay: 640,
      id: 'startsit',
      props: {
        eyebrow: 'The flex call · Nabers or Waddle',
        options: [
          { name: 'Malik Nabers', sub: '@ CAR · WR', pick: true },
          { name: 'Jaylen Waddle', sub: '@ LV · WR' },
        ],
        criteria: [
          { label: 'Projection', cells: [{ v: '17.5 pts', win: true }, { v: '11.9 pts' }] },
          { label: 'Target share', cells: [{ v: '29%', win: true }, { v: '19%' }] },
          {
            label: 'Matchup (def rank)',
            cells: [{ v: '31st, elite', win: true }, { v: '22nd, ok' }],
          },
          {
            label: 'Last 3 games',
            cells: [{ v: '8.1 / 9.3 / 11.0 tgt', win: true }, { v: '5.0 / 6.7 / 5.3 tgt' }],
          },
          { label: 'Injury tag', cells: [{ v: 'Probable' }, { v: 'Healthy', win: true }] },
        ],
        recommendation:
          'Flex <b>Nabers</b>. Carolina is bleeding points to receivers and his target share is climbing, the +5.6 projection edge is worth the minor groin tag.',
      },
    },

    // ── league ladder: standings (core) ──
    {
      type: 'standings',
      col: 5,
      delay: 720,
      id: 'standings',
      props: {
        title: 'League standings, Week 11',
        icon: 'chart',
        iconColor: 'var(--presence)',
        rows: [
          { team: 'Dynasty Dave', rec: '8–2', gb: '-' },
          { team: 'You · Gridiron', rec: '7–3', gb: '1.0' },
          { team: 'The Karens', rec: '7–3', gb: '1.0' },
          { team: 'Brady Bunch', rec: '6–4', gb: '2.0' },
          { team: 'Waiver Warriors', rec: '5–5', gb: '3.0' },
          { team: 'Bottom Feeders', rec: '3–7', gb: '5.0' },
        ],
        footer: 'Win this week and you’re tied for first, a playoff bye is one matchup away.',
      },
    },

    // ── league leaderboard: leaderboard ──
    {
      type: 'leaderboard',
      col: 7,
      delay: 800,
      id: 'leaderboard',
      props: {
        title: 'Power rankings, who’s actually rolling',
        icon: 'spark',
        iconColor: 'var(--insight)',
        metrics: [
          { key: 'pf', label: 'Points For', unit: 'pts' },
          { key: 'streak', label: 'Win streak', unit: 'W' },
          { key: 'ppg', label: 'Pts / game', unit: '' },
        ],
        rows: [
          {
            name: 'You · Gridiron',
            sub: '7–3 · won 4 straight',
            values: { pf: 1284, streak: 4, ppg: 128.4 },
            move: 2,
          },
          {
            name: 'Dynasty Dave',
            sub: '8–2 · lost 1 of 3',
            values: { pf: 1311, streak: 0, ppg: 131.1 },
            move: -1,
          },
          {
            name: 'The Karens',
            sub: '7–3 · won 2 straight',
            values: { pf: 1240, streak: 2, ppg: 124.0 },
            move: 0,
          },
          {
            name: 'Brady Bunch',
            sub: '6–4 · split last 4',
            values: { pf: 1198, streak: 1, ppg: 119.8 },
            move: 1,
          },
          {
            name: 'Waiver Warriors',
            sub: '5–5 · cooling off',
            values: { pf: 1142, streak: 0, ppg: 114.2 },
            move: -2,
          },
        ],
        metric: 1,
        accent: 'var(--insight)',
        footer:
          'Switch the metric: you’re <b>#1 in form</b> even though Dave leads total points. Momentum is yours.',
      },
    },

    // ── projected playoff bracket: tournamentbracket ──
    {
      type: 'tournamentbracket',
      col: 12,
      delay: 860,
      id: 'playoffs',
      props: {
        title: 'Your projected playoff bracket',
        icon: 'share',
        iconColor: 'var(--presence)',
        rounds: ['Wild Card', 'Semifinal', 'Final'],
        matchups: [
          // Top two seeds clear the Wild Card round on a bye.
          { id: 'wc-1', round: 0, slot: 0, a: 'Dynasty Dave', winner: 'a' },
          { id: 'wc-2', round: 0, slot: 1, a: 'You · Gridiron', winner: 'a' },
          // Seeds 3–6 play in, still pending — this week's games haven't kicked off.
          { id: 'wc-3', round: 0, slot: 2, a: 'The Karens', b: 'Bottom Feeders' },
          { id: 'wc-4', round: 0, slot: 3, a: 'Brady Bunch', b: 'Waiver Warriors' },
          // Semis: the bye seed is locked in, the other side is still TBD.
          { id: 'sf-1', round: 1, slot: 0, a: 'Dynasty Dave' },
          { id: 'sf-2', round: 1, slot: 1, a: 'You · Gridiron' },
          // Final: nothing decided yet.
          { id: 'final', round: 2, slot: 0 },
        ],
        footer:
          'Dynasty Dave and you both clinch a Wild Card bye with a win this week, everyone else plays in.',
      },
    },

    // ── matchup flavor: scoreboard ──
    {
      type: 'scoreboard',
      col: 12,
      delay: 880,
      id: 'matchup',
      props: {
        title: 'Your Week 11 matchup, projected',
        icon: 'chart',
        iconColor: 'var(--presence)',
        games: [
          {
            away: 'You',
            home: 'Dynasty Dave',
            as: '121.4',
            hs: '113.4',
            status: 'Proj · 67% win',
            hot: true,
          },
          { away: 'The Karens', home: 'Brady Bunch', as: '118.0', hs: '109.2', status: 'Proj' },
          {
            away: 'Waiver Warriors',
            home: 'Bottom Feeders',
            as: '107.5',
            hs: '101.8',
            status: 'Proj',
          },
        ],
        footer:
          'The starred game is yours, eight projected points is the difference between a bye and the bubble.',
      },
    },
  ],

  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the brief',
      say: 'Here’s your Week 11 game plan on one slide.',
      props: {
        kicker: 'WEEK 11 · GRIDIRON GURUS',
        head: 'Start the hot hand, win by 8',
        foot: 'Made by Mavéa · consensus projections + live injury report',
        bullets: [
          {
            color: 'var(--presence)',
            text: '<b>Achane in for Pollard</b>, +6.7 pts, 28th-ranked run defense at LV.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Nabers into the flex</b>, +5.6 pts, 31st-ranked secondary in Carolina.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Watch the ankle</b>, if Achane sits, Pollard is the clean handcuff.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: 'I’ll get the optimal lineup ready, you set it in your league app.',
      props: {
        eyebrow: 'Action · lineup moves',
        icon: 'check',
        title: 'Get your optimal Week 11 lineup ready',
        lines: [
          { k: 'Moves', v: '3 swaps · Achane, Nabers, McBride in' },
          { k: 'League', v: 'The Gridiron Gurus · ESPN' },
        ],
        perm: 'Mavéa has no connection to ESPN, you make the swaps yourself before kickoff.',
        cta: 'Get the 3 moves ready',
        doneText: 'Moves ready, projected 121.4 · set them in ESPN',
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: 'Here’s a 20-second recap of the winning edge.',
      props: {
        line: '“I asked Mavéa who to start in Week 11. It read every projection and injury tag, found three swaps worth +16 points, and flagged the one ankle that could blow it up.”',
      },
    },
  },

  group: 'decide',
  tryChip: { label: 'Who should I start this week?', route: 'topic:fantasy' },
  suggests: [
    { label: 'Get my optimal lineup ready', icon: 'check', route: 'send', lead: 'Try' },
    { label: 'Should I start Nabers or Waddle?', icon: 'spark', route: 'fantasy:startsit' },
    { label: 'Make it a one-slide game plan', icon: 'slides', route: 'slide' },
    { label: 'Clip a 20-second recap', icon: 'play', route: 'replay' },
    { label: 'How are my stocks doing?', icon: 'chart', route: 'topic:biz' },
  ],
  intents: {
    startsit: {
      kind: 'spotlight',
      spotId: 'startsit',
      say: 'Here’s the flex call, criterion by criterion.',
    },
    alert: {
      kind: 'spotlight',
      spotId: 'alert',
      say: 'And here’s the injury alert you need to clear before kickoff.',
    },
    form: {
      kind: 'spotlight',
      spotId: 'form',
      say: 'Look how hot Achane has been, six straight double-digit weeks.',
    },
  },
  keywords: [
    {
      test: /fantasy|start.?sit|who (should i|do i) start|lineup|waiver|flex|week \d+|achane|nabers|pollard|sit or start/i,
      route: 'topic:fantasy',
      sub: [
        {
          test: /nabers|waddle|flex|start.?sit|who (do i|should i) flex/i,
          route: 'fantasy:startsit',
        },
      ],
    },
  ],
};

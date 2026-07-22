// "Tonight in the AL East", two one-run games live, two finals in, and a division
// race tightening as the Yankees hold a three-game lead over the Rays.
import type { ConversationSpec } from '../conversation';

export const sports: ConversationSpec = {
  id: 'sports',
  workspace: 'Tonight in the AL East',
  title: "Tonight's games and the race",
  sub: 'Two one-run games live, and your division is tightening.',
  opener:
    'Two of these are one-run games right now. The Yankees still lead, but the Rays are close.',
  switchSay: "Let's check the scores.",
  gather: 'Pulling live scores',
  found: 'Two nail-biters and a tight division.',
  tint: '#3ed8a6',
  context: [
    { name: 'Live scores', color: 'var(--insight)' },
    { name: 'Standings', color: 'var(--presence-soft)' },
    { name: 'Beat writers', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'close',
      num: '1',
      delay: 0,
      props: {
        title: 'Two one-run games are live',
        stat: '2 live',
        delta: 'one-run',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Yankees–Mets in the 9th and Dodgers–Padres in the 7th, both within a run.',
        sources: [{ file: 'Live scores' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'lead',
      num: '2',
      delay: 90,
      props: {
        title: 'Yankees still lead the division',
        stat: '41–24',
        delta: '+3.0 GB',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Three games up on the Rays, but the Rays keep winning the close ones.',
        sources: [{ file: 'Standings' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'final',
      num: '3',
      delay: 180,
      props: {
        title: 'Two finals already in',
        stat: '2 final',
        delta: 'done',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Cubs handled the Cardinals; the Rays shut out the Red Sox in seven.',
        sources: [{ file: 'Live scores' }],
      },
    },
    {
      type: 'scoreboard',
      col: 7,
      delay: 260,
      props: {
        title: 'Around the league',
        icon: 'bell',
        iconColor: 'var(--presence-soft)',
        games: [
          { away: 'Mets', as: '3', home: 'Yankees', hs: '4', status: 'Top 9th', hot: true },
          { away: 'Dodgers', as: '2', home: 'Padres', hs: '1', status: 'Bot 7th', hot: true },
          { away: 'Cubs', as: '6', home: 'Cardinals', hs: '2', status: 'Final' },
          { away: 'Red Sox', as: '0', home: 'Rays', hs: '5', status: 'F / 7' },
        ],
        footer: 'Live games glow, the two close ones are worth flipping to.',
      },
    },
    {
      type: 'standings',
      col: 5,
      delay: 320,
      props: {
        title: 'AL East',
        icon: 'table',
        iconColor: 'var(--insight)',
        rows: [
          { team: 'Yankees', rec: '41–24', gb: '-' },
          { team: 'Rays', rec: '38–27', gb: '3.0' },
          { team: 'Red Sox', rec: '35–30', gb: '6.0' },
        ],
        footer: 'Three games separate the top of the division.',
      },
    },
    {
      type: 'web',
      col: 12,
      delay: 380,
      props: {
        title: 'From the beat writers',
        live: true,
        results: [
          {
            domain: 'mlb.com',
            color: 'var(--insight)',
            title: 'Judge walks it off in the 9th',
            excerpt: 'Yankees edge the Mets <mark>4–3</mark> on a bases-loaded single to right.',
          },
          {
            domain: 'espn.com',
            color: 'var(--presence)',
            title: 'Padres bullpen slams the door',
            excerpt: 'San Diego strands the tying run to protect a <mark>one-run lead</mark>.',
          },
        ],
      },
    },
    {
      type: 'sportspitch',
      col: 9,
      delay: 460,
      props: {
        title: 'Yankees defensive alignment, shift on',
        sport: 'baseball',
        positions: [
          { label: 'P', x: 50, y: 55 },
          { label: 'C', x: 50, y: 82 },
          { label: '1B', x: 72, y: 65 },
          { label: '2B', x: 65, y: 48 },
          { label: '3B', x: 30, y: 65 },
          { label: 'SS', x: 58, y: 44 },
          { label: 'LF', x: 18, y: 22 },
          { label: 'CF', x: 50, y: 14 },
          { label: 'RF', x: 78, y: 20 },
        ],
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Setting it up',
      say: "I can't send phone alerts, but I'll flag the Yankees game here.",
      props: {
        eyebrow: 'Action · watch',
        icon: 'eye',
        title: 'Flag the Yankees game here',
        lines: [
          { k: 'Watching', v: 'Yankees vs Mets, top 9th' },
          { k: 'Shows', v: 'Right here on this board' },
        ],
        perm: "This only marks the card, Mavéa can't send phone notifications.",
        cta: 'Flag it',
        doneText: 'Flagged — check back here for the final',
      },
    },
  },

  group: 'home',
  tryChip: { label: "What's the score tonight?", route: 'topic:sports' },
  suggests: [
    { label: 'Flag the close game', icon: 'eye', route: 'send', lead: 'Try' },
    { label: "How's my running going?", icon: 'chart', route: 'topic:fitness' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
    { label: 'Plan my Kyoto trip', icon: 'share', route: 'topic:travel' },
  ],
  keywords: [
    {
      test: /score|scores|game|games|standings|baseball|yankees|mlb|who.?s winning|the race/,
      route: 'topic:sports',
    },
  ],
};

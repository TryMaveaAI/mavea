// makerplay.ts — showcase for the newest hobby, game, and maker blocks (the 600-block wave).
// A fixture conversation covering tablature, piano roll, stitch charts, word search, playing
// cards, and tabletop stat blocks so each renders in #/gallery and seeds a reference example.
import type { ConversationSpec } from '../conversation';

export const makerplay: ConversationSpec = {
  id: 'makerplay',
  workspace: 'Maker & play',
  title: 'Music, crafts, and game night',
  sub: 'Riffs on the fretboard, notes on the grid, stitches, puzzles, cards, and a homebrew monster.',
  opener: 'A few visuals for the hobby table — tablature, a piano roll, a stitch chart, and more.',
  switchSay: 'Here are the fun ones.',
  tint: '#c77dbb',
  context: [
    { name: 'Practice room', color: 'var(--presence-soft)' },
    { name: 'Craft table', color: 'var(--warning)' },
    { name: 'Game night', color: 'var(--insight)' },
  ],
  blocks: [
    {
      type: 'guitartab',
      col: 8,
      id: 'play-guitartab',
      delay: 0,
      props: {
        title: 'A minor pentatonic run',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        tuning: 'EADGBE',
        beatsPerMeasure: 4,
        measuresPerRow: 4,
        tempo: 90,
        notes: [
          { measure: 1, beat: 1, string: 6, fret: 5, technique: 'h' },
          { measure: 1, beat: 2, string: 6, fret: 8 },
          { measure: 1, beat: 3, string: 5, fret: 5, technique: 'h' },
          { measure: 1, beat: 4, string: 5, fret: 7 },
          { measure: 2, beat: 1, string: 4, fret: 5, technique: 'h' },
          { measure: 2, beat: 2, string: 4, fret: 7 },
          { measure: 2, beat: 3, string: 3, fret: 5, technique: 's' },
          { measure: 2, beat: 4, string: 3, fret: 7 },
          { measure: 3, beat: 1, string: 2, fret: 5 },
          { measure: 3, beat: 2, string: 2, fret: 8, technique: 'b' },
          { measure: 3, beat: 3, string: 1, fret: 5 },
          { measure: 3, beat: 4, string: 1, fret: 8 },
        ],
        footer:
          "The A minor pentatonic 'box' shape, ascending from the low E string. Note the <strong>h</strong> (hammer-on) and <strong>b</strong> (bend) markings.",
      },
    },
    {
      type: 'pianoroll',
      col: 10,
      id: 'play-pianoroll',
      delay: 80,
      props: {
        title: 'Ode to Joy — opening phrase',
        icon: 'play',
        iconColor: 'var(--presence)',
        notes: [
          { pitch: 'E4', start: 0, duration: 1, velocity: 0.8 },
          { pitch: 'E4', start: 1, duration: 1, velocity: 0.7 },
          { pitch: 'F4', start: 2, duration: 1, velocity: 0.7 },
          { pitch: 'G4', start: 3, duration: 1, velocity: 0.75 },
          { pitch: 'G4', start: 4, duration: 1, velocity: 0.75 },
          { pitch: 'F4', start: 5, duration: 1, velocity: 0.7 },
          { pitch: 'E4', start: 6, duration: 1, velocity: 0.7 },
          { pitch: 'D4', start: 7, duration: 1, velocity: 0.65 },
          { pitch: 'C4', start: 8, duration: 1, velocity: 0.7 },
          { pitch: 'C4', start: 9, duration: 1, velocity: 0.65 },
          { pitch: 'D4', start: 10, duration: 1, velocity: 0.7 },
          { pitch: 'E4', start: 11, duration: 1, velocity: 0.75 },
          { pitch: 'E4', start: 12, duration: 1.5, velocity: 0.85, label: 'held' },
          { pitch: 'D4', start: 13.5, duration: 0.5 },
          { pitch: 'D4', start: 14, duration: 2, velocity: 0.6 },
        ],
        beatsPerBar: 4,
        tempo: '120 BPM',
        caption:
          "Beethoven's melody stays inside five white keys — the dotted rhythm at the end shows as a long–short pair on the beat grid.",
        footer:
          'Pitch runs bottom to top like a piano turned on its side; darker bars are played louder (higher velocity).',
      },
    },
    {
      type: 'stitchchart',
      col: 8,
      id: 'play-stitchchart',
      delay: 160,
      props: {
        title: 'Eyelet chevron — 8-row repeat',
        icon: 'edit',
        iconColor: 'var(--presence)',
        rows: [
          {
            number: 1,
            side: 'RS',
            stitches: ['k', 'k', 'k', 'k2tog', 'yo', 'k', 'yo', 'ssk', 'k', 'k'],
          },
          { stitches: ['k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k'] },
          {
            number: 3,
            side: 'RS',
            stitches: ['k', 'k', 'k2tog', 'yo', 'k', 'k', 'k', 'yo', 'ssk', 'k'],
          },
          { stitches: ['k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k'] },
          {
            number: 5,
            side: 'RS',
            stitches: ['k', 'k2tog', 'yo', 'k', 'k', 'k', 'k', 'k', 'yo', 'ssk'],
          },
          { stitches: ['k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k'] },
          {
            number: 7,
            side: 'RS',
            stitches: ['k', 'k', 'k', 'k2tog', 'yo', 'k', 'yo', 'ssk', 'k', 'k'],
          },
          { stitches: ['k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k'] },
        ],
        legend: [{ key: 'yo', meaning: 'yarn over — the eyelet hole' }],
        gauge: '24 sts × 32 rows = 10 cm, blocked',
        caption:
          'Read bottom-up: right-side rows right to left, wrong-side rows left to right. WS rows purl straight across (blank cells).',
        footer:
          'Every decrease is paired with a yarn over, so the stitch count stays at 10 on every row.',
      },
    },
    {
      type: 'wordsearch',
      col: 8,
      id: 'play-wordsearch',
      delay: 240,
      props: {
        title: 'Night-sky word hunt',
        icon: 'search',
        iconColor: 'var(--presence)',
        words: [
          'ORION',
          'LYRA',
          'VEGA',
          'SIRIUS',
          'NEBULA',
          'GALAXY',
          'COMET',
          'METEOR',
          'PULSAR',
          'QUASAR',
        ],
        size: 12,
        seed: 'night-sky',
        footer:
          'Ten astronomy terms hide in all eight directions — tap a word in the list to reveal its path, or reveal them all.',
      },
    },
    {
      type: 'playingcards',
      col: 8,
      id: 'play-playingcards',
      delay: 320,
      props: {
        title: 'Reading a royal-flush draw',
        icon: 'layers',
        iconColor: 'var(--presence)',
        groups: [
          {
            label: 'Your hand',
            layout: 'fan',
            cards: [
              { rank: 'A', suit: 'spades' },
              { rank: 'K', suit: 'spades' },
            ],
          },
          {
            label: 'The flop',
            layout: 'row',
            cards: [
              { rank: 'Q', suit: 'spades' },
              { rank: 'J', suit: 'spades' },
              { rank: '4', suit: 'hearts' },
            ],
          },
          {
            label: 'Deck',
            layout: 'stack',
            cards: [{ faceDown: true }, { faceDown: true }, { faceDown: true }],
          },
        ],
        note: 'Four cards toward the royal flush after the flop: only the 10♠ completes it (1 of the 47 unseen cards), while any of the 9 remaining spades still makes the nut flush.',
        footer:
          "A classic probability example: outs are counted against the 47 cards you haven't seen, not the whole deck.",
      },
    },
    {
      type: 'statblock',
      col: 6,
      id: 'play-statblock',
      delay: 400,
      props: {
        title: 'Homebrew bestiary — session prep',
        icon: 'shield',
        iconColor: 'var(--presence)',
        name: 'Ember Drake Hatchling',
        meta: 'Small dragon, chaotic neutral',
        ac: 15,
        hp: 44,
        hpFormula: '8d6+16',
        speed: '30 ft., fly 60 ft.',
        abilities: { str: 14, dex: 16, con: 15, int: 8, wis: 12, cha: 13 },
        saves: ['Dex +5', 'Con +4'],
        skills: ['Perception +3', 'Stealth +5'],
        senses: 'darkvision 60 ft., passive Perception 13',
        languages: 'Draconic',
        challenge: '2 (450 XP)',
        traits: [
          {
            name: 'Kindled Scales',
            text: 'A creature that touches the drake or hits it with a melee attack while within 5 feet takes 2 (1d4) fire damage.',
          },
          {
            name: 'Updraft Glide',
            text: "The drake doesn't provoke opportunity attacks when it flies out of an enemy's reach.",
          },
        ],
        actions: [
          {
            name: 'Bite',
            text: 'Melee weapon attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) piercing damage plus 3 (1d6) fire damage.',
          },
          {
            name: 'Cinder Breath (Recharge 5–6)',
            text: 'The drake exhales a 15-foot cone of embers. Each creature in the cone must make a DC 12 Dexterity saving throw, taking 14 (4d6) fire damage on a failed save, or half as much on a success.',
          },
        ],
        reactions: [
          {
            name: 'Wing Buffet',
            text: 'When a creature the drake can see ends its turn within 5 feet, the drake beats its wings to push that creature 5 feet away.',
          },
        ],
        footer:
          'Balanced for a level-3 party of four — treat the breath recharge as the spotlight beat of the encounter.',
      },
    },
  ],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [
    { label: 'Another riff', icon: 'play', route: 'topic:makerplay' },
    { label: 'Deal another hand', icon: 'sparkle', route: 'topic:makerplay' },
  ],
  keywords: [
    {
      test: /\bguitar tab\b|\btablature\b|\bpiano roll\b|\bstitch chart\b|\bknitting chart\b|\bword ?search\b|\bplaying cards?\b|\bpoker hand\b|\bstat block\b/,
      route: 'topic:makerplay',
    },
  ],
};

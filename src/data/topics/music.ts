// music.ts, "Explain music theory basics" / "How do I read sheet music?"
// Exercises the new musicstaff block plus flashcard, comparebars, chronologicaltimeline, kpi.
// Component keys: insight, musicstaff, flashcard, comparebars, chronologicaltimeline, kpi.
import type { ConversationSpec } from '../conversation';

export const music: ConversationSpec = {
  id: 'music',
  workspace: 'Music theory',
  title: 'Reading music & music theory',
  sub: 'Staff notation, scales, intervals, and rhythm, the building blocks of every song.',
  opener:
    'Music is a language, once you can read the staff, hear intervals, and feel rhythm, every song opens up. Here is the foundation.',
  switchSay: "Let's dive into music theory.",
  gather: 'Pulling together the core theory',
  found: "Here's the essential map, notation, scales, rhythm, and chord basics.",
  tint: '#8b5cf6',
  group: 'learn',
  context: [
    { name: 'Sheet music', color: 'var(--presence-soft)' },
    { name: 'Music theory', color: 'var(--insight)' },
    { name: 'Western notation', color: 'var(--text-muted)' },
  ],
  keywords: [
    {
      test: /music theory|sheet music|staff notation|notes? on (a )?staff|read music|major scale|read sheet|musical notation/i,
      route: 'topic:music',
    },
  ],
  suggests: [
    { label: 'Show me a chord progression', icon: 'layers', route: 'music:chords' },
    { label: 'What is rhythm vs tempo?', icon: 'spark', route: 'music:rhythm' },
    { label: 'How do keys and scales relate?', icon: 'chart', route: 'music:keys' },
  ],
  extras: {},
  blocks: [
    // ── opener ──
    {
      type: 'insight',
      col: 7,
      id: 'staff-why',
      num: '1',
      delay: 0,
      props: {
        title: 'The treble staff: five lines, four spaces',
        stat: '5 lines',
        delta: 'Every Good Boy Does Fine',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'The <b>treble clef</b> (𝄞) marks the G above middle C on the second line from the bottom. Lines spell E G B D F; spaces spell F A C E, two rhymes that fit any note to a position in seconds.',
        sources: [{ file: 'Music theory', loc: 'Staff notation' }],
      },
    },
    {
      type: 'insight',
      col: 5,
      id: 'rhythm-why',
      num: '2',
      delay: 80,
      props: {
        title: 'Four note values tell you how long to hold',
        stat: '♩ ♩ ♩ ♩',
        delta: 'whole · half · quarter · eighth',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'A <b>whole note</b> lasts 4 beats. A half note lasts 2. A quarter note (the default) lasts 1. An eighth note lasts half a beat. Stems, flags, and open/filled heads make them visually distinct at a glance.',
        sources: [{ file: 'Sheet music', loc: 'Note values' }],
      },
    },

    // ── C major scale on a staff ──
    {
      type: 'musicstaff',
      col: 12,
      delay: 160,
      props: {
        title: 'C major scale (treble clef)',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        clef: 'treble',
        timeSignature: '4/4',
        tempo: 120,
        notes: [
          { pitch: 'C4', duration: 'quarter' },
          { pitch: 'D4', duration: 'quarter' },
          { pitch: 'E4', duration: 'quarter' },
          { pitch: 'F4', duration: 'quarter' },
          { pitch: 'G4', duration: 'quarter' },
          { pitch: 'A4', duration: 'quarter' },
          { pitch: 'B4', duration: 'quarter' },
          { pitch: 'C5', duration: 'half', dotted: true },
        ],
        footer:
          'C major uses only white keys, no sharps or flats. Every other major scale is this same pattern of whole and half steps (W W H W W W H) transposed to a new root.',
      },
    },

    // ── Minuet in G: opening phrase ──
    {
      type: 'musicstaff',
      col: 12,
      delay: 220,
      props: {
        title: 'Minuet in G, opening phrase',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        clef: 'treble',
        timeSignature: '3/4',
        tempo: 116,
        notes: [
          { pitch: 'D5', duration: 'quarter' },
          { pitch: 'G4', duration: 'eighth' },
          { pitch: 'A4', duration: 'eighth' },
          { pitch: 'B4', duration: 'eighth' },
          { pitch: 'C5', duration: 'eighth' },
          { pitch: 'D5', duration: 'quarter' },
          { pitch: 'G4', duration: 'quarter' },
          { pitch: 'G4', duration: 'quarter' },
          { pitch: 'E5', duration: 'quarter' },
          { pitch: 'C5', duration: 'eighth' },
          { pitch: 'D5', duration: 'eighth' },
          { pitch: 'E5', duration: 'eighth' },
          { pitch: 'F#5', duration: 'eighth' },
          { pitch: 'G5', duration: 'half' },
        ],
        footer:
          'Written by Christian Petzold (long attributed to Bach), this 3/4 minuet is one of the first melodies beginners learn. The F♯ in bar 4 briefly implies D major, a simple but effective colour change.',
      },
    },

    // ── interval flashcards ──
    {
      type: 'flashcard',
      col: 6,
      delay: 300,
      props: {
        title: 'Interval ear-training deck',
        icon: 'spark',
        iconColor: 'var(--warning)',
        cards: [
          {
            front: 'Perfect 5th (C → G)',
            back: 'Sounds like: "Twinkle Twinkle" opening. 7 semitones. The power chord of classical harmony.',
          },
          {
            front: 'Major 3rd (C → E)',
            back: 'Sounds like: "When the Saints Go Marching In." 4 semitones. Defines a major chord.',
          },
          {
            front: 'Minor 3rd (A → C)',
            back: 'Sounds like: "Smoke on the Water" riff. 3 semitones. Defines a minor chord, darker colour.',
          },
          {
            front: 'Octave (C4 → C5)',
            back: 'Sounds like: "Somewhere Over the Rainbow" opening leap. 12 semitones. Same note, doubled frequency.',
          },
          {
            front: 'Tritone (C → F#)',
            back: "The Devil's interval, 6 semitones, right in the middle of the octave. Unstable; resolves inward to a 3rd or outward to a 6th.",
          },
        ],
        footer:
          'Flip each card after singing the interval. Aim for instant recognition, the goal is hearing, not counting semitones.',
      },
    },

    // ── tempo comparison ──
    {
      type: 'comparebars',
      col: 6,
      delay: 360,
      props: {
        title: 'Tempo markings (BPM)',
        icon: 'layers',
        iconColor: 'var(--insight)',
        series: [{ name: 'BPM', color: 'var(--presence)' }],
        rows: [
          { label: 'Larghissimo', values: [24], unit: ' BPM' },
          { label: 'Largo', values: [50], unit: ' BPM' },
          { label: 'Adagio', values: [72], unit: ' BPM' },
          { label: 'Andante', values: [90], unit: ' BPM' },
          { label: 'Moderato', values: [108], unit: ' BPM' },
          { label: 'Allegro', values: [132], unit: ' BPM' },
          { label: 'Vivace', values: [160], unit: ' BPM' },
          { label: 'Presto', values: [192], unit: ' BPM' },
        ],
        footer:
          'Tempo is relative to style and feel, these ranges overlap in practice. "Allegro" in Beethoven is often faster than in Handel.',
      },
    },

    // ── notation history timeline ──
    {
      type: 'chronologicaltimeline',
      col: 12,
      delay: 440,
      props: {
        title: 'Staff notation through the centuries',
        icon: 'clock',
        iconColor: 'var(--presence)',
        startLabel: '900 AD',
        endLabel: '1800s',
        events: [
          {
            at: 0,
            date: '~900 AD',
            title: 'Neumes',
            detail:
              'Earliest written notation, squiggles above text hinting at melodic contour, no pitch precision.',
          },
          {
            at: 18,
            date: '1025',
            title: 'Guido of Arezzo',
            detail:
              'Invented the four-line staff and the sol-fa syllable system (ut re mi fa sol la). First reliably readable pitch notation.',
            color: 'var(--presence)',
          },
          {
            at: 34,
            date: '1200s',
            title: 'Mensural notation',
            detail:
              'Rhythm encoded for the first time via note shapes, unlocks polyphony (multiple independent voices).',
          },
          {
            at: 55,
            date: '1450s',
            title: 'Music printing press',
            detail:
              "Ottaviano Petrucci's moveable-type music printing spreads sheet music across Europe.",
            color: 'var(--insight)',
          },
          {
            at: 73,
            date: '1600s',
            title: 'Baroque conventions',
            detail:
              'Five-line treble and bass staves standardised; figured bass shorthand speeds up harmonisation.',
          },
          {
            at: 100,
            date: '1800s',
            title: 'Modern score',
            detail:
              'Dynamics (pp→ff), articulation, and expression marks codified; engraving produces the notation we use today.',
            color: 'var(--warning)',
          },
        ],
        footer:
          'Western notation is ~1,000 years old. Non-Western traditions (Indian raga, Arabic maqam, Chinese gongche) use entirely different systems.',
      },
    },

    // ── key stats ──
    {
      type: 'kpi',
      col: 12,
      delay: 520,
      props: {
        title: 'Music by the numbers',
        icon: 'chart',
        iconColor: 'var(--insight)',
        cols: 3,
        kpis: [
          { val: '12', label: 'Chromatic scale notes (per octave)' },
          { val: '12', label: 'Major keys (one per root note)' },
          { val: '7', label: 'Diatonic notes per major/minor key' },
          { val: '4/4', label: 'Most common time signature' },
          { val: '440 Hz', label: 'A4 concert pitch (since 1939)', color: 'var(--presence)' },
          { val: '7', label: 'Chords built on each scale degree' },
        ],
      },
    },
    {
      type: 'chorddiagram',
      col: 4,
      delay: 660,
      props: {
        title: 'G Major chord',
        chordName: 'G',
        instrument: 'Guitar',
        frets: [3, 2, 0, 0, 0, 3],
        fingers: [2, 1, null, null, null, 3],
        notes: ['G', 'B', 'G', 'D', 'G', 'B'],
      },
    },
    {
      type: 'mixerboard',
      col: 10,
      id: 'music-mixerboard',
      delay: 160,
      props: {
        title: 'Track arrangement',
        icon: 'sliders',
        iconColor: 'var(--presence)',
        bars: 8,
        tracks: [
          {
            name: 'Drums',
            color: 'var(--presence)',
            volume: 86,
            pan: 0,
            clips: [{ start: 0, len: 8, label: 'Beat' }],
          },
          {
            name: 'Bass',
            color: 'var(--insight)',
            volume: 78,
            pan: -12,
            mute: true,
            clips: [{ start: 0, len: 6, label: 'Groove' }],
          },
          {
            name: 'Keys',
            color: 'var(--warning)',
            volume: 64,
            pan: 28,
            clips: [
              { start: 2, len: 4, label: 'Pad' },
              { start: 6, len: 2, label: 'Stab' },
            ],
          },
          {
            name: 'Vox',
            color: 'var(--presence-soft)',
            volume: 72,
            pan: 0,
            solo: true,
            clips: [
              { start: 1, len: 3, label: 'Verse' },
              { start: 4, len: 4, label: 'Chorus' },
            ],
          },
        ],
        caption:
          'Four lanes on an 8-bar grid: bass is muted while the vocal is soloed for a focused listen.',
      },
    },
    {
      type: 'pianokeys',
      col: 8,
      id: 'music-pianokeys-cmaj7',
      delay: 320,
      props: {
        title: 'C major 7 chord',
        icon: 'play',
        iconColor: 'var(--presence)',
        chordName: 'Cmaj7',
        startNote: 'C4',
        octaves: 2,
        showLabels: true,
        highlight: [
          { note: 'C4', role: 'root' },
          { note: 'E4', role: '3rd' },
          { note: 'G4', role: '5th' },
          { note: 'B4', role: '7th' },
        ],
        caption: 'A major-7 stacks a major triad with a major 7th: C–E–G–B.',
        footer:
          'The bright, jazzy colour comes from that major-7th interval (B over C) — a half-step below the octave.',
      },
    },
    {
      type: 'fretboardmap',
      col: 8,
      id: 'music-fretboardmap-aminpent',
      delay: 380,
      props: {
        title: 'A minor pentatonic',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        scaleName: 'A minor pentatonic',
        strings: 6,
        frets: 12,
        tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
        dots: [
          { string: 6, fret: 5, label: 'R', role: 'root' },
          { string: 6, fret: 8, label: 'b3', role: 'third' },
          { string: 5, fret: 5, label: '4', role: 'other' },
          { string: 5, fret: 7, label: '5', role: 'fifth' },
          { string: 4, fret: 5, label: 'b7', role: 'other' },
          { string: 4, fret: 7, label: 'R', role: 'root' },
          { string: 3, fret: 5, label: 'b3', role: 'third' },
          { string: 3, fret: 7, label: '4', role: 'other' },
          { string: 2, fret: 5, label: '5', role: 'fifth' },
          { string: 2, fret: 8, label: 'b7', role: 'other' },
          { string: 1, fret: 5, label: 'R', role: 'root' },
          { string: 1, fret: 8, label: 'b3', role: 'third' },
        ],
        caption:
          'The box-1 shape at the 5th fret — roots on the low E, D, and high E strings anchor the position.',
      },
    },
    {
      type: 'circleoffifths',
      col: 6,
      id: 'music-circleoffifths-g',
      delay: 440,
      props: {
        title: 'Circle of fifths',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        highlightKey: 'G',
        showMinors: true,
        related: ['C', 'D', 'Em'],
        caption:
          'G major sits one sharp clockwise of C: its IV is C, its V is D, and Em is its relative minor.',
      },
    },
    {
      type: 'practicelog',
      col: 7,
      id: 'music-practicelog',
      delay: 500,
      props: {
        title: 'Two weeks of piano practice',
        icon: 'clock',
        iconColor: 'var(--presence)',
        instrument: 'Piano',
        sessions: [
          { date: '2026-06-19', minutes: 25, focus: 'scales', note: 'Hanon exercises' },
          {
            date: '2026-06-20',
            minutes: 40,
            piece: 'Clair de Lune',
            note: 'Started the arpeggio section',
          },
          { date: '2026-06-21', minutes: 30, piece: 'Clair de Lune' },
          { date: '2026-06-22', minutes: 20, focus: 'sight-reading' },
          {
            date: '2026-06-23',
            minutes: 45,
            piece: 'Clair de Lune',
            note: 'Tempo still rushes in the climax',
          },
          { date: '2026-06-24', minutes: 35, piece: 'Für Elise' },
          { date: '2026-06-26', minutes: 40, piece: 'Für Elise' },
          { date: '2026-06-27', minutes: 50, piece: 'Für Elise' },
          { date: '2026-06-28', minutes: 15, focus: 'scales' },
          {
            date: '2026-06-29',
            minutes: 60,
            piece: 'Für Elise',
            note: 'Clean run-through start to finish',
          },
          { date: '2026-06-30', minutes: 30, piece: 'Clair de Lune' },
          { date: '2026-07-01', minutes: 40, piece: 'Für Elise' },
          {
            date: '2026-07-02',
            minutes: 45,
            piece: 'Für Elise',
            note: 'Performance-ready for Sunday',
          },
        ],
      },
    },
  ],
  proof: null,
};

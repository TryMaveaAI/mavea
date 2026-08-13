// creative.ts, "The Azores, as a photo-story". A creative / travel moodboard session:
// you're a designer planning a 7-day coastal road-trip across São Miguel and turning it into a
// visual story, mood, palette, places on the map, a shot list, and a short film. Showcases the
// media/layout/docs/status visualization library: moodboard, palette, maps, before/after, a
// waveform scratch track, a video cut, and the narrative scaffolding around it.
import type { ConversationSpec } from '../conversation';

export const creative: ConversationSpec = {
  id: 'creative',
  workspace: 'Azores photo-story',
  title: 'The Azores, as a photo-story',
  sub: 'Seven days on São Miguel, a moodboard, a route, and a film to make.',
  opener:
    "I shaped your São Miguel trip into a visual story: the mood is volcanic-green and Atlantic-grey, the route hugs the north coast, and there's a 90-second film waiting to be cut.",
  switchSay: "Let's build the Azores story.",
  gather: 'Reading your inspo folder + saved pins',
  found: "It already looks like a film, here's the whole board.",
  tint: '#2f9e7a',
  context: [
    { name: 'Inspo folder · 41 refs', color: 'var(--presence-soft)' },
    { name: 'Saved pins · São Miguel', color: 'var(--insight)' },
    { name: 'Brief · "calm, green, vast"', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── narrative openers ──
    {
      type: 'insight',
      col: 8,
      id: 'mood',
      num: '1',
      delay: 0,
      props: {
        title: 'The whole story leans volcanic-green and Atlantic-grey',
        stat: '41 refs',
        delta: 'one mood',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Your saved images cluster hard around mossy calderas, mist, and slow water, a calm, vast, green film. I built the palette and shot plan around exactly that.',
        sources: [{ file: 'Inspo folder · 41 refs' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'route',
      num: '2',
      delay: 80,
      props: {
        title: 'The north coast is the spine of the route',
        stat: '7 days',
        delta: '6 stops',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'A loose loop from Ponta Delgada, most of your light is on the north and west.',
        sources: [{ file: 'Saved pins · São Miguel' }],
      },
    },

    // ── 1. moodboard (media), the hero visual ──
    {
      type: 'moodboard',
      col: 8,
      delay: 160,
      id: 'board',
      props: {
        title: 'The mood',
        icon: 'image',
        iconColor: 'var(--presence)',
        tiles: [
          {
            kind: 'image',
            span: 2,
            rows: 2,
            from: 'var(--presence-deep)',
            to: 'var(--presence-soft)',
            label: 'Sete Cidades · twin lakes from the rim',
            src: '/demo-assets/images/sete-cidades.jpg',
          },
          {
            kind: 'text',
            span: 2,
            text: 'Calm, vast, green. Let the landscape be the loud thing.',
          },
          { kind: 'color', swatch: 'var(--presence)', hex: '#2f9e7a', label: 'Caldera green' },
          {
            kind: 'image',
            from: 'var(--text-muted)',
            to: 'var(--presence-soft)',
            label: 'Green coast · hydrangeas',
            src: '/demo-assets/images/green-coast.jpg',
          },
          { kind: 'color', swatch: 'var(--insight)', hex: '#6ea8ff', label: 'Atlantic grey-blue' },
          {
            kind: 'image',
            span: 2,
            from: 'var(--warning)',
            to: 'var(--presence-deep)',
            label: 'Patchwork fields · the green interior',
            src: '/demo-assets/images/patchwork-fields.jpg',
          },
          {
            kind: 'image',
            from: 'var(--presence-deep)',
            to: 'var(--insight)',
            label: 'Furnas · the crater lake',
            src: '/demo-assets/images/furnas-lake.jpg',
          },
          { kind: 'color', swatch: 'var(--warning)', hex: '#e8b04b', label: 'Volcanic ochre' },
        ],
        footer: 'Eight tiles pulled straight from your folder, drag to re-rank what leads.',
      },
    },

    // ── 2. palette (media), derived colorway ──
    {
      type: 'palette',
      col: 4,
      delay: 240,
      id: 'palette',
      props: {
        title: 'The colorway',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        swatches: [
          { name: 'Caldera', hex: '#1d6b4f', contrast: 'AAA' },
          { name: 'Moss', hex: '#2f9e7a', contrast: 'AA' },
          { name: 'Atlantic', hex: '#3f6f9c', contrast: 'AAA' },
          { name: 'Mist', hex: '#cdd8d4', contrast: 'fail', light: true },
          { name: 'Ochre', hex: '#e8b04b', contrast: 'fail', light: true },
          { name: 'Basalt', hex: '#22272b', contrast: 'AAA' },
        ],
        footer: 'Grade every shot toward these, Mist and Ochre stay accents only.',
      },
    },

    // ── 2b. photo (media), a real reference frame ──
    {
      type: 'photo',
      col: 4,
      delay: 280,
      id: 'photo',
      props: {
        title: 'Mood frame',
        src: '/demo-assets/images/capelinhos.jpg',
        alt: 'Capelinhos lighthouse on the volcanic ashfield, Faial',
        caption: 'Reference frame, match the grade and light to this.',
      },
    },

    // ── 3. geomap (media), the route, on a real map ──
    {
      type: 'geomap',
      col: 8,
      delay: 320,
      id: 'map',
      props: {
        title: 'The route, mapped',
        icon: 'share',
        iconColor: 'var(--presence)',
        markers: [
          {
            lat: 37.7412,
            lng: -25.6756,
            name: 'Ponta Delgada',
            detail: 'Base · fly in, two nights to settle.',
            color: 'var(--text-muted)',
          },
          {
            lat: 37.8607,
            lng: -25.7936,
            name: 'Sete Cidades',
            detail: 'Day 2 · twin lakes, shoot the rim at first light.',
            color: 'var(--presence)',
          },
          {
            lat: 37.8217,
            lng: -25.4036,
            name: 'Gorreana tea',
            detail: "Day 4 · Europe's only tea estate, green terraces.",
            color: 'var(--warning)',
          },
          {
            lat: 37.7726,
            lng: -25.3094,
            name: 'Furnas',
            detail: 'Day 5 · steam vents + the hot-spring gardens.',
            color: 'var(--insight)',
          },
          {
            lat: 37.8297,
            lng: -25.1456,
            name: 'Nordeste',
            detail: 'Day 6 · cliff viewpoints, the quiet east.',
            color: 'var(--presence-soft)',
          },
        ],
        footer: 'Tap a pin for the why, golden hours are pinned to each stop.',
      },
    },

    // ── 4. bars (charts), how the days split across the island ──
    {
      type: 'bars',
      col: 4,
      delay: 400,
      props: {
        title: 'Days per region',
        icon: 'globe',
        iconColor: 'var(--insight)',
        unit: ' days',
        bars: [
          { label: 'West · Sete Cidades', value: 2 },
          { label: 'Central · Ponta Delgada', value: 2 },
          { label: 'East · Furnas & Nordeste', value: 3, hot: true },
        ],
        footer: 'The green east gets the most time, it earns it.',
      },
    },

    // ── 5. storystrip (layout), the narrative arc ──
    {
      type: 'storystrip',
      col: 12,
      delay: 480,
      id: 'arc',
      props: {
        title: 'The arc of the film',
        icon: 'play',
        iconColor: 'var(--presence)',
        panels: [
          {
            heading: 'Arrival',
            icon: 'globe',
            body: 'Land in the grey. Wet cobbles, low cloud, set the calm.',
            color: 'var(--text-muted)',
            caption: 'Day 1',
          },
          {
            heading: 'The rim',
            icon: 'image',
            body: 'Climb to Sete Cidades. The green opens up. This is the breath.',
            color: 'var(--presence)',
            caption: 'Day 2',
          },
          {
            heading: 'The work',
            icon: 'spark',
            body: 'Tea terraces and steam. People in the landscape, hands, not faces.',
            color: 'var(--warning)',
            caption: 'Day 4–5',
          },
          {
            heading: 'The edge',
            icon: 'share',
            body: 'Nordeste cliffs. The vastness pays off. Let a shot run long.',
            color: 'var(--insight)',
            caption: 'Day 6',
          },
          {
            heading: 'Leaving',
            icon: 'send',
            body: 'Back to grey, but changed. End on still water.',
            color: 'var(--presence-soft)',
            caption: 'Day 7',
          },
        ],
        footer: 'Five beats, calm, breath, work, edge, return.',
      },
    },

    // ── 6. carousel (media), hero shot candidates ──
    {
      type: 'carousel',
      col: 6,
      delay: 560,
      props: {
        title: 'Hero-shot candidates',
        icon: 'image',
        iconColor: 'var(--insight)',
        start: 0,
        slides: [
          {
            label: 'Lakes from the rim',
            caption: 'The poster frame, wide, symmetrical.',
            from: 'var(--presence-deep)',
            to: 'var(--presence-soft)',
            tag: 'open',
            src: '/demo-assets/images/sete-cidades.jpg',
          },
          {
            label: 'Green coast',
            caption: 'Lead line through the hydrangeas.',
            from: 'var(--insight)',
            to: 'var(--presence)',
            tag: 'transition',
            src: '/demo-assets/images/green-coast.jpg',
          },
          {
            label: 'Furnas lake',
            caption: 'Still, mood-heavy, the mid.',
            from: 'var(--text-muted)',
            to: 'var(--warning)',
            tag: 'mid',
            src: '/demo-assets/images/furnas-lake.jpg',
          },
          {
            label: 'Basalt cliffs',
            caption: 'The held wide, the close.',
            from: 'var(--presence)',
            to: 'var(--insight)',
            tag: 'close',
            src: '/demo-assets/images/basalt-cliffs.jpg',
          },
        ],
        footer: 'Swipe through the four anchor frames the cut hangs on.',
      },
    },

    // ── 7. lightbox (media), the shot grid ──
    {
      type: 'lightbox',
      col: 6,
      delay: 640,
      props: {
        title: 'Shot list · the grid',
        icon: 'layers',
        iconColor: 'var(--presence)',
        items: [
          {
            label: 'Ponta Delgada · arrival',
            caption: 'Day 1 · 35mm · grey',
            from: 'var(--text-muted)',
            to: 'var(--presence-deep)',
            src: '/demo-assets/images/ponta-delgada.jpg',
          },
          {
            label: 'Twin lakes · wide',
            caption: 'Day 2 · 24mm · golden',
            from: 'var(--presence-deep)',
            to: 'var(--presence-soft)',
            src: '/demo-assets/images/sete-cidades.jpg',
          },
          {
            label: 'Patchwork fields · detail',
            caption: 'Day 4 · 85mm · interior',
            from: 'var(--warning)',
            to: 'var(--presence)',
            src: '/demo-assets/images/patchwork-fields.jpg',
          },
          {
            label: 'Furnas lake · mood',
            caption: 'Day 5 · 50mm · still',
            from: 'var(--insight)',
            to: 'var(--text-muted)',
            src: '/demo-assets/images/furnas-lake.jpg',
          },
          {
            label: 'Cliff edge · held',
            caption: 'Day 6 · 24mm · vast',
            from: 'var(--presence)',
            to: 'var(--insight)',
            src: '/demo-assets/images/cliff-fields.jpg',
          },
          {
            label: 'Crater rim · end',
            caption: 'Day 7 · 50mm · quiet',
            from: 'var(--presence-soft)',
            to: 'var(--presence-deep)',
            src: '/demo-assets/images/crater-panorama.jpg',
          },
        ],
        footer: 'Click any tile to open it full-frame.',
      },
    },

    // ── 8. beforeafter (media), the grade ──
    {
      type: 'beforeafter',
      col: 6,
      delay: 720,
      id: 'grade',
      props: {
        title: 'The grade',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        before: {
          label: 'RAW',
          from: 'var(--text-muted)',
          to: 'var(--presence-deep)',
          caption: 'Flat, cool, true to sensor',
          src: '/demo-assets/images/overcast-coast.jpg',
        },
        after: {
          label: 'Graded',
          from: 'var(--presence)',
          to: 'var(--insight)',
          caption: 'Greens lifted, mist warmed',
          src: '/demo-assets/images/green-coast.jpg',
        },
        position: 46,
        footer: 'Drag the divider, the look is a soft green lift with crushed basalt shadows.',
      },
    },

    // ── 9. imagecallouts (media), composing the hero frame ──
    {
      type: 'imagecallouts',
      col: 6,
      delay: 800,
      props: {
        title: 'Composing the rim shot',
        icon: 'eye',
        iconColor: 'var(--insight)',
        image: {
          from: 'var(--presence-deep)',
          to: 'var(--presence-soft)',
          label: 'Sete Cidades · the wide',
          src: '/demo-assets/images/sete-cidades.jpg',
        },
        callouts: [
          {
            x: 50,
            y: 24,
            label: 'Horizon high',
            detail: 'Sky to the top third, land is the subject.',
            color: 'var(--presence)',
          },
          {
            x: 22,
            y: 60,
            label: 'Blue lake',
            detail: 'Anchor the left third with the deeper water.',
            color: 'var(--insight)',
          },
          {
            x: 74,
            y: 62,
            label: 'Green lake',
            detail: 'Balance with the warm green on the right.',
            color: 'var(--warning)',
          },
          {
            x: 50,
            y: 86,
            label: 'Foreground rim',
            detail: 'A sliver of basalt grounds the frame.',
            color: 'var(--text-muted)',
          },
        ],
        footer: 'Four pins for the one frame everything else supports.',
      },
    },

    // ── 10. annotcallouts (docs), annotating a contact sheet ──
    {
      type: 'annotcallouts',
      col: 6,
      delay: 880,
      props: {
        title: 'Contact sheet · notes',
        icon: 'doc',
        iconColor: 'var(--presence)',
        caption: 'Day 2 selects, what made the cut and why.',
        ratio: 16 / 9,
        callouts: [
          {
            x: 20,
            y: 30,
            label: '01 · keep',
            note: 'Cleanest horizon line of the morning, <b>this is the poster</b>.',
            color: 'var(--presence)',
          },
          {
            x: 56,
            y: 26,
            label: '02 · maybe',
            note: 'Nice light, but a tourist on the path. <mark>Clone-out or cut.</mark>',
            color: 'var(--warning)',
          },
          {
            x: 38,
            y: 70,
            label: '03 · cut',
            note: 'Cloud went flat here, no separation in the greens.',
            color: 'var(--danger)',
          },
          {
            x: 80,
            y: 64,
            label: '04 · keep',
            note: 'The transition frame for the hydrangea road.',
            color: 'var(--insight)',
          },
        ],
        footer: 'Pins map to the selects in your edit folder.',
      },
    },

    // ── 11. videoembed (media), the cut ──
    {
      type: 'videoembed',
      col: 8,
      delay: 960,
      id: 'film',
      props: {
        title: 'The 90-second cut',
        icon: 'play',
        iconColor: 'var(--presence)',
        thumb: {
          from: 'var(--presence-deep)',
          to: 'var(--insight)',
          label: 'São Miguel · a quiet film',
        },
        video: '/demo-assets/video/azores-film.webm',
        poster: '/demo-assets/images/basalt-cliffs.jpg',
        durationLabel: '1:32',
        active: 1,
        chapters: [
          { time: '0:00', at: 0, title: 'Cold open · the grey' },
          { time: '0:18', at: 20, title: 'The rim opens up' },
          { time: '0:44', at: 48, title: 'Tea, steam, hands' },
          { time: '1:06', at: 72, title: 'Nordeste · the held wide' },
          { time: '1:24', at: 91, title: 'Still water · out' },
        ],
        footer: 'Chapters line up with the five-beat arc above.',
      },
    },

    // ── 12. waveform (media), the scratch track ──
    {
      type: 'waveform',
      col: 4,
      delay: 1040,
      props: {
        title: 'Scratch track',
        icon: 'speaker',
        iconColor: 'var(--insight)',
        durationLabel: '1:32',
        color: 'var(--presence)',
        position: 22,
        bars: [
          0.12, 0.2, 0.16, 0.3, 0.42, 0.35, 0.5, 0.62, 0.55, 0.7, 0.82, 0.74, 0.66, 0.5, 0.6, 0.78,
          0.9, 0.84, 0.7, 0.55, 0.42, 0.5, 0.64, 0.58, 0.46, 0.34, 0.28, 0.22, 0.16, 0.1,
        ],
        markers: [
          { at: 20, label: 'swell in' },
          { at: 48, label: 'rhythm' },
          { at: 91, label: 'tail out' },
        ],
        footer: 'Ambient piano under field-recorded wind, builds with the arc.',
      },
    },

    // ── 13. sankey (charts1), where the 7 days flow ──
    {
      type: 'sankey',
      col: 8,
      delay: 1120,
      props: {
        title: 'How the seven days flow',
        icon: 'chart',
        iconColor: 'var(--presence)',
        unit: ' days',
        nodes: [
          { id: 'trip', label: '7 days', layer: 0, color: 'var(--presence)' },
          { id: 'west', label: 'West coast', layer: 1, color: 'var(--insight)' },
          { id: 'east', label: 'East coast', layer: 1, color: 'var(--warning)' },
          { id: 'base', label: 'Base · PDL', layer: 1, color: 'var(--text-muted)' },
          { id: 'shoot', label: 'Shoot days', layer: 2, color: 'var(--presence-soft)' },
          { id: 'rest', label: 'Scout / rest', layer: 2, color: 'var(--text-muted)' },
        ],
        links: [
          { source: 'trip', target: 'west', value: 2 },
          { source: 'trip', target: 'east', value: 3 },
          { source: 'trip', target: 'base', value: 2 },
          { source: 'west', target: 'shoot', value: 2 },
          { source: 'east', target: 'shoot', value: 2 },
          { source: 'east', target: 'rest', value: 1 },
          { source: 'base', target: 'shoot', value: 1 },
          { source: 'base', target: 'rest', value: 1 },
        ],
        footer: 'Five real shoot days, two to scout and breathe.',
      },
    },

    // ── 14. proscons (layout), the gear call ──
    {
      type: 'proscons',
      col: 4,
      delay: 1200,
      props: {
        title: 'Drone, pack it?',
        icon: 'layers',
        iconColor: 'var(--insight)',
        prosLabel: 'Bring it',
        consLabel: 'Leave it',
        pros: [
          {
            text: 'The rim wides are <b>made</b> for the air',
            weight: 5,
            note: 'Sete Cidades from above is the signature frame.',
          },
          { text: 'Cliff scale at Nordeste', weight: 4 },
          { text: 'Light to carry', weight: 2 },
        ],
        cons: [
          {
            text: 'Azores wind is <mark>relentless</mark>',
            weight: 4,
            note: 'Gusts over the calderas are no joke.',
          },
          { text: 'No-fly near Furnas park', weight: 3 },
          { text: 'One more battery system', weight: 2 },
        ],
        verdict: 'Pack it, but plan air shots for the <b>calm dawn windows only</b>.',
        footer: 'Weighted on the frames you actually need.',
      },
    },

    // ── 15. casestudy (layout), a reference shoot ──
    {
      type: 'casestudy',
      col: 12,
      delay: 1280,
      props: {
        title: 'A reference that worked',
        icon: 'spark',
        iconColor: 'var(--warning)',
        subject: 'How a 3-day Faroe Islands edit hit a calm, vast feel',
        defaultStage: 'result',
        setup: {
          body: 'Same brief, different rock: <b>calm, green, vast</b>, and the same grey-light problem.',
        },
        action: {
          body: 'They shot almost entirely at the <mark>edges of the day</mark> and graded toward two colors only, moss and slate.',
          metric: '2-color grade',
        },
        result: {
          body: 'The film felt like one breath. It traveled, picked up by three travel outlets in a week.',
          metric: '1.2M views',
        },
        lesson: { body: 'Constraint is the look. Fewer colors, fewer hours, more patience.' },
        footer: "We're borrowing the two-color discipline, moss + slate.",
      },
    },

    // ── 16. callout (layout), the heads-up ──
    {
      type: 'callout',
      col: 6,
      delay: 1360,
      props: {
        title: 'One weather window',
        icon: 'alert',
        iconColor: 'var(--warning)',
        tone: 'warn',
        kicker: 'Heads up',
        body: 'São Miguel makes its own weather. <b>Sete Cidades is clear maybe one morning in three</b>, so keep Day 2 and Day 3 both open for the rim, and shoot it the first clear dawn you get.',
        points: [
          'Check the webcam at the Vista do Rei viewpoint the night before.',
          'If it socks in, swap to Furnas, steam loves low cloud.',
        ],
        footer: 'The whole poster frame depends on this one window.',
      },
    },

    // ── 17. pullquote (layout), the guiding line ──
    {
      type: 'pullquote',
      col: 6,
      delay: 1440,
      props: {
        title: 'The line we shoot to',
        icon: 'quote',
        iconColor: 'var(--presence)',
        quote: 'Let the landscape be the loud thing, and stand still long enough to hear it.',
        author: 'Your brief',
        role: '"calm, green, vast"',
        tone: 'success',
        variants: [
          { quote: 'No fast cuts. The island has one speed; match it.', author: 'Edit note' },
          {
            quote: 'Hands in the frame, never faces, let it stay a place, not a portrait.',
            author: 'Shot rule',
          },
        ],
        footer: 'Pinned above the timeline for the whole edit.',
      },
    },

    // ── 18. takeaways (layout), the brief in five ──
    {
      type: 'takeaways',
      col: 6,
      delay: 1520,
      id: 'takeaways',
      props: {
        title: 'The brief in five',
        icon: 'check',
        iconColor: 'var(--insight)',
        heading: 'What to remember on the island',
        items: [
          {
            text: 'Shoot the <b>edges of the day</b>, grey midday is for scouting.',
            color: 'var(--presence)',
            detail: 'Golden + blue hour are pinned per stop.',
          },
          {
            text: 'Grade toward <b>moss + slate</b>; ochre is an accent only.',
            color: 'var(--warning)',
          },
          {
            text: 'Hold the wides <b>long</b>, let vastness breathe.',
            color: 'var(--insight)',
            detail: 'Min 8 seconds on the cliff and rim shots.',
          },
          {
            text: 'Keep <b>Day 2 & 3 open</b> for the one clear rim morning.',
            color: 'var(--text-muted)',
          },
          { text: 'Hands, not faces, keep it a place.', color: 'var(--presence-soft)' },
        ],
        footer: 'Tap each as you bag it.',
      },
    },

    // ── 19. skeleton (status), refs still importing ──
    {
      type: 'skeleton',
      col: 6,
      delay: 1600,
      props: {
        title: 'Pulling 12 more refs',
        icon: 'image',
        iconColor: 'var(--text-muted)',
        variant: 'media',
        rows: 4,
        loadedLabel: 'Show what loaded',
        footer: 'Importing the rest of your saved pins, the board grows as they land.',
      },
    },

    // ── 20. emptystate (status), the next move ──
    {
      type: 'emptystate',
      col: 6,
      delay: 1680,
      id: 'next',
      props: {
        title: 'Soundtrack',
        icon: 'speaker',
        iconColor: 'var(--insight)',
        art: 'spark',
        headline: 'No licensed track yet',
        copy: "The cut is running on a scratch piano. Pick a final track and I'll <b>re-time the chapters to the beats</b>.",
        action: 'Browse calm scores',
        actionIcon: 'play',
        secondary: 'Keep the scratch',
        color: 'var(--presence)',
        footer: 'One missing piece before this film is shareable.',
      },
    },
    {
      type: 'mediacard',
      col: 7,
      delay: 720,
      props: {
        title: 'Reference film to study before the cut',
        icon: 'play',
        iconColor: 'var(--presence)',
        cover: {
          src: '/demo-assets/images/sete-cidades.jpg',
          from: 'var(--presence-deep)',
          to: 'var(--presence-soft)',
        },
        year: '2018',
        runtime: '1h 32m',
        rating: 'TV-PG',
        score: 88,
        genres: ['Travel', 'Documentary', 'Slow cinema'],
        logline:
          'A patient, near-wordless portrait of a volcanic island in the Atlantic — mist over calderas, slow water, and long held wides. The exact mood your São Miguel film is reaching for.',
        providers: ['Mubi', 'Criterion', 'Vimeo'],
        footer: 'Watch the first ten minutes for pacing, then mirror its wide-to-still rhythm.',
      },
    },
    {
      type: 'voicestyle',
      col: 7,
      delay: 200,
      id: 'voicestyle',
      props: {
        title: 'Your Writing Voice',
        icon: 'spark',
        iconColor: 'var(--presence)',
        traits: [
          { trait: 'Short, punchy sentences', example: 'Ship it. Then iterate.' },
          { trait: 'Dry, understated humour' },
          { trait: 'Leads with the verb' },
          { trait: 'Skips the warm-up', example: 'No "I hope this finds you well."' },
        ],
        sample: {
          generic:
            'I wanted to reach out to let you know that we have completed the project and it is now ready for your review at your earliest convenience.',
          inYourVoice: "Project's done. Ready for your eyes whenever.",
        },
        footer: "Learned from <b>40 of your messages</b> — I'll keep this on for drafts.",
      },
    },
    {
      type: 'exposuretriangle',
      col: 6,
      id: 'creative-exposuretriangle',
      delay: 120,
      props: {
        title: 'Portrait exposure',
        icon: 'image',
        iconColor: 'var(--presence)',
        aperture: 'f/2.8',
        shutter: '1/250',
        iso: 200,
        ev: 'EV 11',
        effects: [
          { axis: 'aperture', note: 'Shallow depth of field — soft, blurred background.' },
          { axis: 'shutter', note: 'Fast enough to freeze a small head turn.' },
          { axis: 'iso', note: 'Low ISO keeps skin tones clean and noise-free.' },
        ],
        caption:
          'A classic available-light portrait: wide aperture to isolate the subject, low ISO for clean tones.',
      },
    },
    {
      type: 'colorwheel',
      col: 7,
      id: 'creative-colorwheel',
      delay: 200,
      props: {
        title: 'Triadic color scheme',
        icon: 'spark',
        iconColor: 'var(--presence)',
        baseHue: 210,
        harmony: 'triad',
        swatches: [
          { hue: 210, hex: '#2f80ed', role: 'base' },
          { hue: 330, hex: '#e84393', role: 'accent' },
          { hue: 90, hex: '#8cc63f', role: 'accent' },
        ],
        caption:
          'Three hues spaced 120° apart — vivid and balanced, with one dominant and two supporting.',
      },
    },
    {
      type: 'artanalysis',
      col: 8,
      id: 'creative-artanalysis',
      delay: 280,
      props: {
        title: 'Reading the composition',
        icon: 'image',
        iconColor: 'var(--presence)',
        overlay: 'thirds',
        regions: [
          { x: 56, y: 22, w: 32, h: 46, label: 'Subject' },
          { x: 8, y: 58, w: 30, h: 30, label: 'Foreground' },
        ],
        palette: [
          { hex: '#e8c39e', role: 'highlight' },
          { hex: '#b5723a', role: 'midtone' },
          { hex: '#2e2117', role: 'shadow' },
        ],
        notes: [
          {
            label: 'Composition',
            text: 'The subject sits on the right vertical third — the eye lands there first.',
          },
          {
            label: 'Light',
            text: 'Warm key light from frame-left rakes across the form, deep shadow on the right.',
          },
          { label: 'Style', text: 'A restrained earth palette gives a quiet, classical feel.' },
        ],
        caption: 'A rule-of-thirds read: the focal subject anchored on the right intersection.',
      },
    },
    {
      id: 'shotlist',
      type: 'shotlist',
      col: 8,
      delay: 1440,
      props: {
        title: 'Opening scene — shot breakdown',
        icon: 'play',
        iconColor: 'var(--warning)',
        shots: [
          {
            n: 1,
            size: 'WS',
            movement: 'Slow push-in',
            lens: '24mm',
            duration: '6s',
            action:
              'Establish the empty studio at dawn; light bleeds across the floor as she steps into frame.',
          },
          {
            n: 2,
            size: 'MS',
            movement: 'Static',
            lens: '50mm',
            duration: '4s',
            action: 'She sets the camera down and exhales, reading the room.',
            dialogue: 'Okay. One more time, from the top.',
          },
          {
            n: 3,
            size: 'CU',
            movement: 'Slight rack focus',
            lens: '85mm',
            duration: '3s',
            action:
              'Her hands frame the shot on the small monitor; focus pulls from fingers to screen.',
          },
          {
            n: 4,
            size: 'OTS',
            movement: 'Handheld drift',
            lens: '35mm',
            duration: '5s',
            action:
              'From behind her shoulder we see the playback begin — the take she has been chasing.',
            dialogue: 'There it is.',
          },
        ],
        caption:
          'Wide to establish, then tighten with each beat so the room shrinks to a single decisive moment.',
      },
    },
    {
      id: 'run-of-show',
      type: 'runofshow',
      col: 4,
      delay: 1520,
      props: {
        title: 'Coastal shoot day — run of show',
        icon: 'clock',
        iconColor: 'var(--presence)',
        eventDate: 'Day 3 · Ponta da Ferraria',
        cues: [
          { time: '5:40 AM', cue: 'Crew call, load the van', owner: 'Mara', state: 'done' },
          {
            time: '6:15 AM',
            cue: 'Sunrise coastline wides',
            owner: 'Mara',
            duration: '25 min',
            state: 'done',
          },
          {
            time: '7:10 AM',
            cue: 'Drone pass, north cliffs',
            owner: 'Dev',
            duration: '20 min',
            state: 'live',
          },
          {
            time: '8:00 AM',
            cue: 'Interview setup, hot spring overlook',
            owner: 'Théo',
            duration: '15 min',
            state: 'next',
          },
          { time: '8:30 AM', cue: 'Interview take', owner: 'Mara', duration: '30 min' },
          { time: '9:15 AM', cue: 'Wrap coastline, move to caldera', owner: 'Dev' },
        ],
        footer: 'The drone window closes once wind picks up after 7:30 — Dev is racing it now.',
      },
    },
    {
      id: 'beatsheet',
      type: 'beatsheet',
      col: 8,
      delay: 1600,
      props: {
        title: 'Beat sheet',
        icon: 'edit',
        iconColor: 'var(--presence)',
        framework: 'Save the Cat',
        beats: [
          {
            name: 'Opening Image',
            at: '1%',
            line: 'A snapshot of the flawed world before anything changes.',
          },
          {
            name: 'Catalyst',
            at: '10%',
            line: 'The call that breaks the routine and forces a choice.',
          },
          {
            name: 'Break into Two',
            at: '20%',
            line: 'The hero commits and crosses into the new world.',
          },
          {
            name: 'Midpoint',
            at: '50%',
            line: 'A false victory (or defeat) raises the stakes for real.',
          },
          { name: 'All Is Lost', at: '75%', line: 'The lowest point — the old way clearly fails.' },
          {
            name: 'Dark Night',
            at: '80%',
            line: 'In the wreckage, the hero finds the true answer.',
          },
          {
            name: 'Finale',
            at: '90%',
            line: 'The new self acts and resolves the central conflict.',
          },
          { name: 'Final Image', at: '99%', line: 'A mirror of the opening, now transformed.' },
        ],
        tension: [1, 2, 3, 5, 8, 6, 10, 4],
        caption:
          'Tension climbs to the Midpoint, dips at the false low, then spikes through the Finale.',
      },
    },
    {
      type: 'craftchart',
      col: 7,
      id: 'creative-craftchart',
      delay: 300,
      props: {
        title: 'Cross-stitch heart motif',
        icon: 'edit',
        iconColor: 'var(--insight)',
        craft: 'crossstitch',
        rows: 12,
        cols: 12,
        cells: [
          { r: 1, c: 2, color: 'var(--danger)', symbol: '×' },
          { r: 1, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 1, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 1, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 1, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 2, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 2, c: 10, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 1, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 2, color: 'var(--warning-soft)', symbol: 'o' },
          { r: 3, c: 3, color: 'var(--warning-soft)', symbol: 'o' },
          { r: 3, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 3, c: 10, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 1, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 2, color: 'var(--warning-soft)', symbol: 'o' },
          { r: 4, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 4, c: 10, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 1, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 2, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 5, c: 10, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 2, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 6, c: 9, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 3, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 7, c: 8, color: 'var(--danger)', symbol: '×' },
          { r: 8, c: 4, color: 'var(--danger)', symbol: '×' },
          { r: 8, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 8, c: 6, color: 'var(--danger)', symbol: '×' },
          { r: 8, c: 7, color: 'var(--danger)', symbol: '×' },
          { r: 9, c: 5, color: 'var(--danger)', symbol: '×' },
          { r: 9, c: 6, color: 'var(--danger)', symbol: '×' },
        ],
        legend: [
          { symbol: '×', color: 'var(--danger)', meaning: 'DMC 321 — red (full cross-stitch)' },
          {
            symbol: 'o',
            color: 'var(--warning-soft)',
            meaning: 'DMC 819 — pale pink (highlight glint)',
          },
          { meaning: 'Blank — leave the fabric unworked' },
        ],
        caption:
          'Work each ×: bring the needle up at the bottom-left of the square and down at the top-right, then cross back the other way. Count stitches along the top, rows down the right.',
      },
    },
    {
      type: 'patternpiece',
      col: 7,
      id: 'creative-patternpiece',
      delay: 120,
      props: {
        title: 'Simple tote bag — cutting layout',
        icon: 'edit',
        iconColor: 'var(--presence)',
        fabric: { w: 90, h: 70, label: '90 × 70 cm cotton canvas (folded)' },
        pieces: [
          { label: 'Body panel', w: 38, h: 42, x: 0, y: 4, fold: true, qty: 1 },
          { label: 'Lining panel', w: 38, h: 42, x: 44, y: 4, fold: true, qty: 1 },
          { label: 'Strap', w: 70, h: 8, x: 4, y: 52, qty: 2 },
        ],
        unit: 'cm',
        caption: 'Body and lining are cut on the fold; the two carry straps nest along the bottom.',
      },
    },

    // ── storyarc (layout) — Freytag pyramid for a short film ──
    {
      type: 'storyarc',
      col: 10,
      id: 'creative-storyarc',
      delay: 1800,
      props: {
        title: 'Short-Film Arc — Freytag',
        icon: 'layers',
        iconColor: 'var(--presence)',
        framework: 'freytag' as const,
        beats: [
          { stage: 'Rising Action', label: 'The storm rolls in' },
          { stage: 'Climax', label: 'The lighthouse fails' },
          { stage: 'Falling Action', label: 'Dawn rescue' },
        ],
      },
    },

    // ── castmap — the relationship web under the short film's cast, factions + typed ties ──
    {
      type: 'castmap',
      col: 8,
      id: 'creative-castmap',
      delay: 1900,
      props: {
        title: 'Cast Map — The Keeper',
        icon: 'share',
        iconColor: 'var(--presence)',
        nodes: [
          { id: 'elara', name: 'Elara', role: 'The lighthouse keeper', faction: 'The Island' },
          { id: 'mira', name: 'Mira', role: 'A runaway she shelters', faction: 'The Island' },
          { id: 'bram', name: 'Old Bram', role: 'The keeper before her', faction: 'The Island' },
          { id: 'davo', name: 'Captain Davo', role: 'Master of the Wrenn', faction: 'The Sea' },
          { id: 'tomas', name: 'Tomas', role: "Davo's first mate", faction: 'The Sea' },
          { id: 'warden', name: 'The Warden', role: 'Hunts the runaway', faction: 'The Crown' },
        ],
        links: [
          { from: 'elara', to: 'mira', kind: 'ally' as const, label: 'shelters' },
          { from: 'bram', to: 'elara', kind: 'mentor' as const, label: 'taught the light' },
          { from: 'davo', to: 'mira', kind: 'family' as const, label: 'her father' },
          { from: 'elara', to: 'davo', kind: 'ally' as const, label: 'saves the Wrenn' },
          { from: 'warden', to: 'mira', kind: 'rival' as const, label: 'hunts' },
          { from: 'warden', to: 'elara', kind: 'rival' as const, label: 'suspects' },
          { from: 'tomas', to: 'davo', kind: 'betrays' as const, label: 'cut the lines' },
        ],
        caption: 'Who protects whom — and who is hunting the runaway.',
        footer:
          'The hidden <strong>father</strong> and the first mate’s <strong>betrayal</strong> are the two secrets the third act turns on.',
      },
    },

    // ── devicemark (layout) — rhetorical devices in an opening line ──
    {
      type: 'devicemark',
      col: 10,
      id: 'creative-devicemark',
      delay: 2000,
      props: {
        title: 'Literary Devices — Opening Line',
        text: 'The lighthouse stood like a silent sentinel, its beam sweeping the hungry dark with the patience of the tide.',
        marks: [
          {
            phrase: 'like a silent sentinel',
            device: 'simile' as const,
            note: 'compares the lighthouse to a guard',
          },
          {
            phrase: 'hungry dark',
            device: 'personification' as const,
            note: 'darkness described as if it consumes',
          },
          {
            phrase: 'patience of the tide',
            device: 'metaphor' as const,
            note: 'slow, inevitable rhythm',
          },
        ],
      },
    },

    // ── creativetest (media) — the two launch posts, A/B tested ──
    {
      type: 'creativetest',
      col: 8,
      id: 'launch-test',
      delay: 2080,
      props: {
        title: 'Two launch posts for the film',
        icon: 'image',
        iconColor: 'var(--presence)',
        variants: [
          {
            label: 'Variant A · wide rim shot',
            src: '/demo-assets/images/sete-cidades.jpg',
            headline: 'Seven days. One quiet island.',
            metrics: [
              { label: 'CTR', value: '2.1%' },
              { label: 'Saves', value: '340' },
              { label: 'Watch-through', value: '38%' },
            ],
          },
          {
            label: 'Variant B · crater at dusk',
            src: '/demo-assets/images/crater-panorama.jpg',
            headline: "The film I almost didn't make.",
            metrics: [
              { label: 'CTR', value: '3.4%', delta: '+1.3pp', deltaDir: 'good' },
              { label: 'Saves', value: '812', delta: '+472', deltaDir: 'good' },
              { label: 'Watch-through', value: '61%', delta: '+23pp', deltaDir: 'good' },
            ],
          },
        ],
        winner: 1,
        footer: 'Variant B wins on every metric, the confessional hook out-pulls pure scenery.',
      },
    },

    // ── brandguide (media) — the visual identity for the whole launch ──
    {
      type: 'brandguide',
      col: 7,
      id: 'story-brand',
      delay: 2160,
      props: {
        title: 'The São Miguel story kit',
        icon: 'doc',
        iconColor: 'var(--insight)',
        colors: [
          { name: 'Caldera', hex: '#1d6b4f', contrast: 'AAA' },
          { name: 'Moss', hex: '#2f9e7a', contrast: 'AA' },
          { name: 'Atlantic', hex: '#3f6f9c', contrast: 'AAA' },
          { name: 'Mist', hex: '#cdd8d4', contrast: 'fail', light: true },
          { name: 'Ochre', hex: '#e8b04b', contrast: 'fail', light: true },
          { name: 'Basalt', hex: '#22272b', contrast: 'AAA' },
        ],
        typography: [
          { name: 'Display', sample: "'Iowan Old Style', Georgia, serif", weight: '600' },
          { name: 'Caption', sample: 'ui-sans-serif, system-ui, sans-serif', weight: '500' },
          {
            name: 'Overlay numerals',
            sample: "ui-monospace, 'JetBrains Mono', monospace",
            weight: '600',
          },
        ],
        voiceNotes: [
          'Short sentences, let the landscape do the talking.',
          'One plain claim per caption, no exclamation points.',
          'Always name the place, never just "the island."',
        ],
        footer: 'Apply this to every caption and thumbnail before it ships.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building the look-book',
      say: "Here's a one-page look-book for the shoot.",
      props: {
        kicker: 'LOOK-BOOK · SÃO MIGUEL',
        head: 'A calm, green, vast film',
        foot: 'Made by Mavéa · from your inspo folder',
        bullets: [
          {
            color: 'var(--presence)',
            text: '<b>Mood:</b> volcanic-green + Atlantic-grey, moss and slate, ochre only as accent.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Route:</b> a 7-day north-coast loop from Ponta Delgada, weighted to the green east.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Rule:</b> edges of the day, hold the wides long, hands not faces.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll compile the board into one page you can export.",
      props: {
        eyebrow: 'Action · compile',
        icon: 'paperclip',
        title: 'Compile the Azores story into one page',
        lines: [
          { k: 'Compiles', v: 'Moodboard · palette · route · shot list' },
          { k: 'Where', v: 'Right here, export or screenshot to keep it' },
        ],
        perm: 'Mavéa has no notes connection, it only compiles this page.',
        cta: 'Compile the page',
        doneText: 'Board compiled — export to keep it',
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second walkthrough for your collaborator.",
      props: {
        line: '"I asked Mavéa to plan a photo trip to the Azores. It handed back a mood, a palette, a route, a shot list, and a film to cut. In 20 seconds."',
      },
    },
  },

  group: 'home',
  tryChip: { label: 'Turn my Azores trip into a photo-story', route: 'topic:creative' },
  suggests: [
    { label: 'Compile the board', icon: 'paperclip', route: 'send', lead: 'Try' },
    { label: 'Make it a look-book page', icon: 'slides', route: 'slide' },
    { label: 'Clip a walkthrough', icon: 'play', route: 'replay' },
    { label: 'Plan my Kyoto trip', icon: 'share', route: 'topic:travel' },
    { label: "How's the business doing?", icon: 'chart', route: 'topic:biz' },
  ],
  intents: {
    mood: {
      kind: 'spotlight',
      spotId: 'board',
      say: "Here's the mood, volcanic-green and Atlantic-grey.",
    },
    route: { kind: 'spotlight', spotId: 'map', say: "Here's the route along the north coast." },
    film: {
      kind: 'spotlight',
      spotId: 'film',
      say: "Here's the 90-second cut, chaptered to the arc.",
    },
    grade: { kind: 'spotlight', spotId: 'grade', say: 'Here is the grade, a soft green lift.' },
  },
  keywords: [
    {
      test: /azores|s[ãa]o miguel|moodboard|photo.?story|look.?book|shot list|creative trip|photo trip/i,
      route: 'topic:creative',
      sub: [
        { test: /route|map|where|coast/i, route: 'topic:creative' },
        { test: /film|cut|video|edit|grade/i, route: 'topic:creative' },
      ],
    },
  ],
};

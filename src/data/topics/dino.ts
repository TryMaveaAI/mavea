// dino.ts, "Show me dinosaurs!" A roar-out-loud canvas for a kid who loves dinosaurs.
// Opens with two awesome-fact insights, then SHOWS it: a size showdown (comparebars,
// human vs T. rex vs Argentinosaurus), the same lineup again as scaled silhouettes on
// a shared ground line (sizecompare), the three great ages on a timeline (Triassic →
// Jurassic → Cretaceous), a world map of where they roamed, a photo gallery, a
// myth-vs-fact check ("did dinos and humans live together? NO!"), fun-fact callouts, a
// "danger level" scorebadge, plus a record-breakers KPI grid and a stats donut.
// Component keys: insight, comparebars, sizecompare, timeline, map, gallery, factcheck,
// callout, scorebadge, kpi, list, donut.
import type { ConversationSpec } from '../conversation';

export const dino: ConversationSpec = {
  id: 'dino',
  workspace: 'Dino lab',
  title: 'Dinosaurs! The biggest, fastest, and fiercest',
  sub: 'Giants that shook the ground for 165 million years, here are the best ones.',
  opener:
    'Dinosaurs ruled Earth for 165 MILLION years, way, way before any people. Let me show you the biggest, the fiercest, and a few facts that will blow your socks off!',
  switchSay: "Roar! Let's look at dinosaurs.",
  gather: 'Digging up the best dino facts',
  found: 'I dug up the coolest dinosaurs in the world, here they are!',
  tint: '#5fae6b',
  context: [
    { name: 'Fossil records', color: 'var(--presence-soft)' },
    { name: 'Natural history museum', color: 'var(--insight)' },
    { name: '165 million years', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two awesome-fact insights ──
    {
      type: 'insight',
      col: 7,
      id: 'biggest',
      num: '1',
      delay: 0,
      props: {
        title: 'The biggest dinosaur was as long as 3 school buses',
        stat: '~37 m',
        delta: 'Argentinosaurus',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Argentinosaurus weighed about <b>70 tons</b>, that is heavier than 10 elephants standing on top of each other! It munched plants all day long with a neck longer than a giraffe.',
        sources: [{ file: 'Fossil records', loc: 'Patagonia, Argentina' }],
      },
    },
    {
      type: 'insight',
      col: 5,
      id: 'teeth',
      num: '2',
      delay: 80,
      props: {
        title: 'T. rex had teeth the size of bananas',
        stat: '60 teeth',
        delta: 'bite like a car crush',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Tyrannosaurus rex could bite down with the force of <mark>3 cars</mark> stacked on its jaws, the strongest bite of any land animal EVER.',
        sources: [{ file: 'Natural history museum', loc: 'T. rex skull cast' }],
      },
    },

    // ════════ SIZE SHOWDOWN ════════
    {
      type: 'comparebars',
      col: 12,
      delay: 160,
      id: 'sizes',
      props: {
        title: 'Size showdown: you vs the giants',
        icon: 'layers',
        iconColor: 'var(--insight)',
        series: [
          { name: 'You (a kid)', color: 'var(--text-muted)' },
          { name: 'T. rex', color: 'var(--warning)' },
          { name: 'Argentinosaurus', color: 'var(--presence)' },
        ],
        rows: [
          { label: 'How long', values: [1.4, 12, 37], unit: ' m', higherBetter: true },
          { label: 'How tall', values: [1.4, 6, 21], unit: ' m', higherBetter: true },
          { label: 'How heavy', values: [0.04, 8, 70], unit: ' t', higherBetter: true },
        ],
        highlight: 2,
        footer:
          'Argentinosaurus was so long you could line up <b>26 of you</b> head to toe along its body!',
      },
    },

    // ════════ SIZE SHOWDOWN, SILHOUETTE VIEW ════════
    {
      type: 'sizecompare',
      col: 12,
      delay: 200,
      id: 'silhouettes',
      props: {
        title: 'Line them up: shapes to scale',
        icon: 'layers',
        iconColor: 'var(--insight)',
        unit: 'm',
        subjects: [
          { label: 'You (a kid)', length: 1.4, shape: 'human' },
          { label: 'School bus', length: 12, shape: 'bus' },
          { label: 'T. rex', length: 12, shape: 'generic' },
          { label: 'Argentinosaurus', length: 37, shape: 'generic' },
        ],
        footer: 'Same shapes, same real scale, one shared ground line.',
      },
    },

    // ════════ THE THREE GREAT AGES ════════
    {
      type: 'timeline',
      col: 12,
      delay: 240,
      id: 'ages',
      props: {
        eyebrow: 'The Age of Dinosaurs, 3 chapters',
        title: 'Triassic → Jurassic → Cretaceous',
        events: [
          {
            time: 'Triassic',
            title: 'The first dinosaurs appear',
            detail: '252–201 million years ago. Small and speedy, like dog-sized Eoraptor.',
            tag: 'the start',
            color: 'var(--presence-soft)',
          },
          {
            time: 'Jurassic',
            title: 'Giants take over',
            detail:
              '201–145 million years ago. Huge long-necks like Brachiosaurus and spiky Stegosaurus.',
            tag: 'big & tall',
            color: 'var(--insight)',
          },
          {
            time: 'Cretaceous',
            title: 'The fiercest hunters',
            detail: '145–66 million years ago. T. rex, Triceratops, and Velociraptor roamed here.',
            tag: 'fierce',
            color: 'var(--warning)',
          },
          {
            time: '66 mya',
            title: 'A giant asteroid hits Earth',
            detail:
              'A space rock the size of a city ended the dinosaurs, but birds are their cousins!',
            tag: 'the end',
            color: 'var(--danger)',
          },
        ],
      },
    },

    // ════════ WHERE THEY ROAMED ════════
    {
      type: 'geomap',
      col: 7,
      delay: 320,
      props: {
        title: 'Where dinosaurs roamed',
        icon: 'globe',
        iconColor: 'var(--presence)',
        markers: [
          { lat: 40, lng: -100, name: 'T. rex', detail: 'North America', color: 'var(--warning)' },
          {
            lat: -34,
            lng: -64,
            name: 'Argentinosaurus',
            detail: 'South America',
            color: 'var(--presence)',
          },
          {
            lat: 46,
            lng: 104,
            name: 'Velociraptor',
            detail: 'Mongolia, Asia',
            color: 'var(--insight)',
          },
          {
            lat: 31,
            lng: -5,
            name: 'Spinosaurus',
            detail: 'North Africa',
            color: 'var(--presence-soft)',
          },
        ],
        footer:
          'Dinosaurs lived on <b>every continent</b>, even Antarctica, back when it was warm!',
      },
    },
    {
      type: 'scorebadge',
      col: 5,
      delay: 400,
      id: 'danger',
      props: {
        title: 'Danger level: T. rex',
        icon: 'alert',
        iconColor: 'var(--danger)',
        score: 96,
        grade: 'MEGA',
        caption: 'One of the scariest predators that ever lived. Run!',
        color: 'var(--danger)',
        components: [
          { label: 'Bite force', value: 99, color: 'var(--danger)' },
          { label: 'Sharp teeth', value: 95, color: 'var(--warning)' },
          { label: 'Size', value: 90, color: 'var(--warning)' },
          { label: 'Speed', value: 70, color: 'var(--insight)' },
        ],
        footer: 'Good news: T. rex lived 66 million years ago, so you are totally safe!',
      },
    },

    // ════════ RECORD BREAKERS ════════
    {
      type: 'kpi',
      col: 7,
      delay: 480,
      props: {
        title: 'Dino world records',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 2,
        kpis: [
          { val: '37 m', label: 'Longest (Argentinosaurus)', color: 'var(--presence)' },
          {
            val: '50 km/h',
            label: 'Fastest runner (Velociraptor cousins)',
            color: 'var(--insight)',
          },
          { val: '9 m', label: 'Biggest claws (Therizinosaurus)', color: 'var(--warning)' },
          { val: '15 m', label: 'Wingspan (Quetzalcoatlus flyer)', color: 'var(--presence-soft)' },
        ],
        footer: 'Some flyers were as big as a small airplane!',
      },
    },
    {
      type: 'donut',
      col: 5,
      delay: 560,
      props: {
        title: 'What did dinosaurs eat?',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Plant-eaters', pct: 65, color: 'var(--insight)' },
          { label: 'Meat-eaters', pct: 28, color: 'var(--danger)' },
          { label: 'Ate both', pct: 7, color: 'var(--warning)' },
        ],
        footer: 'Most dinosaurs were gentle plant-eaters, only some were scary hunters.',
      },
    },

    // ════════ PHOTO GALLERY ════════
    {
      type: 'gallery',
      col: 12,
      delay: 640,
      props: {
        eyebrow: 'Meet the dinosaurs',
        title: 'A dino photo wall',
        items: [
          {
            label: 'Tyrannosaurus rex',
            source: 'fierce hunter',
            tag: 'meat-eater',
            h1: '#b5532e',
            h2: '#5e2415',
          },
          {
            label: 'Triceratops',
            source: '3 horns + a frill',
            tag: 'plant-eater',
            h1: '#4a8c5c',
            h2: '#214030',
          },
          {
            label: 'Stegosaurus',
            source: 'spiky back plates',
            tag: 'plant-eater',
            h1: '#5a8fb5',
            h2: '#1f3c4a',
          },
          {
            label: 'Velociraptor',
            source: 'fast + feathered',
            tag: 'hunter',
            h1: '#c9a24a',
            h2: '#4a3c1e',
          },
          {
            label: 'Brachiosaurus',
            source: 'giant long-neck',
            tag: 'plant-eater',
            h1: '#7b6bd9',
            h2: '#2c2454',
          },
          {
            label: 'Spinosaurus',
            source: 'sail-backed swimmer',
            tag: 'hunter',
            h1: '#3e8a7a',
            h2: '#163831',
          },
        ],
        footer: 'Tap any dino to learn its name and what it ate.',
      },
    },

    // ════════ MYTH vs FACT ════════
    {
      type: 'factcheck',
      col: 7,
      delay: 720,
      id: 'myths',
      props: {
        title: 'Dino myths: true or false?',
        icon: 'proof',
        iconColor: 'var(--presence)',
        claims: [
          {
            claim: 'Dinosaurs and people lived at the same time.',
            verdict: 'false',
            confidence: 100,
            sources: ['fossil records'],
            detail:
              'NOPE! The last dinosaurs died <mark>66 million years</mark> ago. The first humans showed up only about 300,000 years ago, that is a gap of millions of years!',
          },
          {
            claim: 'Some dinosaurs had feathers, like birds.',
            verdict: 'true',
            confidence: 98,
            sources: ['museum fossils'],
            detail:
              'TRUE! Velociraptor and many others had fluffy feathers. Birds today are actually living dinosaurs!',
          },
          {
            claim: 'T. rex was the biggest dinosaur of all.',
            verdict: 'partly',
            confidence: 90,
            sources: ['fossil records'],
            detail:
              'Not quite, T. rex was a huge hunter, but plant-eaters like <b>Argentinosaurus</b> were way bigger and longer.',
          },
          {
            claim: 'All dinosaurs were green and scaly.',
            verdict: 'false',
            confidence: 85,
            sources: ['fossil clues'],
            detail:
              'Fossil clues show some dinos were brown, striped, or even reddish, and some were feathery, not scaly!',
          },
        ],
        footer: 'Tap a card to flip it and see why!',
      },
    },
    {
      type: 'callout',
      col: 5,
      delay: 800,
      props: {
        title: 'Whoa! Fun fact',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        tone: 'warn',
        kicker: 'Did you know?',
        body: 'The word <b>dinosaur</b> means "terrible lizard" in Greek, but dinosaurs were not actually lizards!',
        points: [
          'Some dinosaurs swallowed <b>stones</b> to help grind up food in their bellies.',
          'A Stegosaurus was as big as a bus but had a brain the size of a <b>walnut</b>.',
          'Dino poop turned to rock is called a <b>coprolite</b>, scientists study it!',
        ],
        footer: 'The more you dig, the cooler they get.',
      },
    },
    {
      type: 'callout',
      col: 12,
      delay: 880,
      props: {
        title: 'How do we even know all this?',
        icon: 'eye',
        iconColor: 'var(--insight)',
        tone: 'info',
        kicker: 'Dino detectives',
        body: 'Scientists called <b>paleontologists</b> dig up <b>fossils</b>, bones, eggs, footprints, and even poop that turned to stone over millions of years.',
        points: [
          'A whole T. rex skeleton can have over <b>300 bones</b> to piece together.',
          'Footprints tell us how <b>fast</b> a dinosaur could run.',
          'You can become a dino detective too, start at a natural history museum!',
        ],
        footer: 'Every fossil is a clue from millions of years ago.',
      },
    },
    {
      type: 'foodweb',
      col: 8,
      delay: 900,
      props: {
        title: 'Who ate whom in the Cretaceous',
        icon: 'globe',
        iconColor: 'var(--insight)',
        tiers: ['Plants', 'Plant-eaters', 'Hunters', 'Top predator'],
        organisms: [
          { id: 'ferns', tier: 0, label: 'Ferns & cycads' },
          { id: 'conifers', tier: 0, label: 'Conifers' },
          { id: 'tric', tier: 1, label: 'Triceratops' },
          { id: 'edmont', tier: 1, label: 'Edmontosaurus' },
          { id: 'ankyl', tier: 1, label: 'Ankylosaurus' },
          { id: 'dromae', tier: 2, label: 'Dromaeosaurus' },
          { id: 'trex', tier: 3, label: 'T. rex' },
        ],
        links: [
          { from: 'ferns', to: 'tric' },
          { from: 'conifers', to: 'edmont' },
          { from: 'ferns', to: 'ankyl' },
          { from: 'conifers', to: 'tric' },
          { from: 'tric', to: 'dromae' },
          { from: 'edmont', to: 'dromae' },
          { from: 'dromae', to: 'trex' },
          { from: 'tric', to: 'trex' },
          { from: 'edmont', to: 'trex' },
        ],
        footer: 'T. rex sat at the top, but it likely scavenged just as often as it hunted.',
      },
    },

    // ════════ WHERE T. REX FITS IN ════════
    {
      type: 'taxonrank',
      col: 5,
      delay: 920,
      id: 'trex-classification',
      props: {
        title: 'Where T. rex fits in the tree of life',
        icon: 'layers',
        iconColor: 'var(--warning)',
        scientificName: 'Tyrannosaurus rex',
        ranks: [
          { level: 'Kingdom', name: 'Animalia' },
          { level: 'Phylum', name: 'Chordata' },
          { level: 'Class', name: 'Reptilia' },
          { level: 'Order', name: 'Saurischia' },
          { level: 'Family', name: 'Tyrannosauridae' },
          { level: 'Genus', name: 'Tyrannosaurus' },
          { level: 'Species', name: 'T. rex', highlight: true },
        ],
        footer:
          'Every rung down the ladder gets more specific — "Animalia" fits every animal ever, "T. rex" fits exactly one.',
      },
    },

    // ════════ WHAT TO REMEMBER ════════
    {
      type: 'list',
      col: 12,
      delay: 960,
      props: {
        title: '5 things to tell your friends',
        icon: 'check',
        iconColor: 'var(--presence-soft)',
        items: [
          '<b>Dinosaurs ruled for 165 million years</b>, way longer than people have been around.',
          '<b>Argentinosaurus</b> was the heaviest, as long as 3 school buses.',
          '<b>T. rex</b> had the strongest bite of any land animal ever.',
          '<b>Birds are living dinosaurs</b>, look at a chicken and say hi to a dino cousin!',
          'A <b>giant asteroid</b> ended their reign 66 million years ago.',
        ],
      },
    },
    {
      type: 'speciescard',
      col: 6,
      id: 'robin',
      delay: 120,
      props: {
        title: 'Field guide: backyard bird',
        icon: 'globe',
        iconColor: 'var(--presence)',
        commonName: 'American Robin',
        scientificName: 'Turdus migratorius',
        image: { from: 'var(--presence-deep)', to: 'var(--insight-soft)' },
        status: 'Least concern',
        caption:
          'A thrush — and a living dinosaur! Every bird is descended from feathered theropods.',
        marks: [
          { label: 'Size', value: '23–28 cm long, robin-sized' },
          { label: 'Colour', value: 'Rusty-orange breast, dark grey back, white eye-ring' },
          { label: 'Habitat', value: 'Lawns, parks, woodland edges — hops on open grass' },
          { label: 'Range', value: 'Across North America; many migrate south in winter' },
          { label: 'Song', value: 'Cheery rolling "cheerily, cheer-up, cheerio"' },
          { label: 'Season', value: 'Often the first songbird of spring mornings' },
        ],
        lookalikes: ['Spotted Towhee', 'Eastern Towhee', 'Varied Thrush'],
        footer: 'Tip: a tugging robin on the lawn is <b>listening</b> for worms, not just looking.',
      },
    },
  ],
  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Making a dino poster',
      say: "Here's a one-page dino poster you can show off!",
      props: {
        kicker: 'DINO POSTER · THE GREATEST GIANTS',
        head: 'Dinosaurs ruled Earth for 165 million years',
        foot: 'Made by Mavéa · roar!',
        bullets: [
          {
            color: 'var(--presence)',
            text: '<b>Argentinosaurus</b>, longest dino, as long as 3 school buses.',
          },
          {
            color: 'var(--warning)',
            text: '<b>T. rex</b>, banana-sized teeth and the strongest bite ever.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Birds</b> are living dinosaurs flying around us today!',
          },
        ],
      },
    },
  },

  group: 'learn',
  tryChip: { label: 'Show me dinosaurs!', route: 'topic:dino' },
  suggests: [
    {
      label: 'Which dino is the most dangerous?',
      icon: 'alert',
      route: 'dino:danger',
      lead: 'Try',
    },
    { label: 'Are myths about dinos true?', icon: 'proof', route: 'dino:myths' },
    { label: 'How big were they really?', icon: 'layers', route: 'dino:sizes' },
    { label: 'Make me a dino poster', icon: 'slides', route: 'slide' },
    { label: 'Tell me about space and planets', icon: 'spark', route: 'topic:space' },
  ],
  intents: {
    danger: {
      kind: 'spotlight',
      spotId: 'danger',
      say: 'T. rex tops the danger meter, let me show you why.',
    },
    myths: {
      kind: 'spotlight',
      spotId: 'myths',
      say: "Here's the truth behind the biggest dino myths.",
    },
    sizes: {
      kind: 'spotlight',
      spotId: 'sizes',
      say: "Here's how you stack up against the giants.",
    },
    ages: {
      kind: 'spotlight',
      spotId: 'ages',
      say: 'And here are the three great ages of dinosaurs.',
    },
  },
  keywords: [
    {
      test: /dino|dinosaur|t.?rex|tyrannosaur|raptor|jurassic|triceratops|fossil|paleo|prehistoric/i,
      route: 'topic:dino',
      sub: [
        { test: /danger|dangerous|fierce|scary|strongest|bite/i, route: 'dino:danger' },
        { test: /myth|true|false|real|coexist|with (people|humans)/i, route: 'dino:myths' },
        { test: /big|biggest|size|how (long|tall|heavy)|compare/i, route: 'dino:sizes' },
      ],
    },
  ],
};

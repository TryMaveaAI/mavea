// space.ts, "Tell me about the solar system!" A wonder-first tour for curious kids:
// the Sun and its eight planets, how BIG and how FAR apart they are, a comic-strip walk
// from Mercury to Neptune, a photo wall, mind-blowing counters (1,300 Earths fit in
// Jupiter!), a tiny quiz, and the famous "why isn't Pluto a planet?" question, answered
// kindly. Built to make an 8-to-12-year-old grin. Components: insight, comparebars,
// bubble, counter, herostat, storystrip, gallery, timeline, radiogroup, togglegroup,
// callout, faq, takeaways.
import type { ConversationSpec } from '../conversation';

export const space: ConversationSpec = {
  id: 'space',
  workspace: 'Space adventure',
  title: 'Our Solar System: a tour of the planets',
  sub: 'One star, eight planets, and a whole lot of space in between.',
  opener:
    "Buckle up, we're going on a trip around the Sun! There are eight planets, and they're way more different than you'd think. Let me show you.",
  switchSay: "Let's blast off into space.",
  gather: 'Loading planets · counting moons',
  found: "Here's our cosmic neighborhood, your home is the third rock from the Sun.",
  tint: '#6b73ff',
  context: [
    { name: '1 Sun', color: 'var(--warning)' },
    { name: '8 planets', color: 'var(--presence-soft)' },
    { name: '~290 moons', color: 'var(--insight)' },
    { name: 'You are here · Earth', color: 'var(--presence)' },
  ],
  blocks: [
    // ── opener narrative: two insight blocks ──
    {
      type: 'insight',
      col: 8,
      id: 'home',
      num: '1',
      delay: 0,
      props: {
        title: 'Eight planets circle one giant star, the Sun',
        stat: '8 planets',
        delta: 'and 1 star',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Four small rocky planets live close to the Sun (Mercury, Venus, Earth, Mars). Four giants live far out (Jupiter, Saturn, Uranus, Neptune). We live on the third one, <b>Earth</b>, the only place we know of with pizza.',
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'sunsize',
      num: '2',
      delay: 80,
      props: {
        title: 'The Sun is the boss of the neighborhood',
        stat: '99.8%',
        delta: 'of all the weight',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'Almost <mark>everything</mark> in the solar system is the Sun. All eight planets together are just a tiny crumb next to it!',
      },
    },

    // ════════ HOW BIG ARE THEY? ════════
    {
      type: 'comparebars',
      col: 7,
      delay: 160,
      id: 'sizes',
      props: {
        title: 'How big is each planet? (if Earth = 1)',
        icon: 'globe',
        iconColor: 'var(--presence)',
        series: [{ name: 'Times wider than Earth', color: 'var(--presence-soft)' }],
        rows: [
          { label: 'Mercury', values: [0.38], higherBetter: true },
          { label: 'Mars', values: [0.53], higherBetter: true },
          { label: 'Venus', values: [0.95], higherBetter: true },
          { label: 'Earth', values: [1], higherBetter: true },
          { label: 'Neptune', values: [3.9], higherBetter: true },
          { label: 'Uranus', values: [4.0], higherBetter: true },
          { label: 'Saturn', values: [9.1], higherBetter: true },
          { label: 'Jupiter', values: [11.2], higherBetter: true },
        ],
        highlight: 0,
        footer: 'Jupiter is the heavyweight champ, more than <b>11 Earths</b> wide!',
      },
    },
    {
      type: 'counter',
      col: 5,
      delay: 240,
      id: 'fit',
      props: {
        title: 'Mind-blown fact',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        value: 1300,
        suffix: ' Earths',
        label: 'could fit inside Jupiter',
        color: 'var(--warning)',
        footer: 'Jupiter is so huge you could pour over a thousand Earths into it. Whoa.',
      },
    },
    {
      type: 'herostat',
      col: 5,
      delay: 320,
      props: {
        title: 'And the Sun? Even bigger',
        icon: 'sun',
        iconColor: 'var(--warning)',
        value: '1,300,000',
        unit: 'Earths',
        narrative:
          'That’s how many Earths would fit inside the <b>Sun</b>. It’s a giant ball of glowing gas.',
        trend: 'hot · 27 million °F core',
        trendDir: 'up',
        detail:
          'The Sun’s center is so hot it would melt anything we know of, it’s a nonstop nuclear campfire.',
        color: 'var(--warning)',
        footer: 'The Sun is a star, just like the twinkly ones at night, only much, much closer.',
      },
    },
    {
      type: 'callout',
      col: 7,
      delay: 400,
      props: {
        title: 'Saturn could float in a bathtub',
        icon: 'spark',
        iconColor: 'var(--insight)',
        tone: 'info',
        kicker: 'Whoa fact',
        body: 'If you found a bathtub big enough, <b>Saturn would float</b>! It’s made mostly of gas, so it’s lighter than water. Its famous rings are billions of chunks of ice and rock, some as tiny as a grain of sugar, some as big as a house.',
        points: [
          'Saturn has the brightest, biggest rings of all.',
          'Jupiter, Uranus, and Neptune have rings too, just faint and shy.',
        ],
        footer: 'Don’t actually try this at home. You’ll need a really, really big tub.',
      },
    },

    // ════════ HOW FAR APART? ════════
    {
      type: 'bubble',
      col: 7,
      delay: 480,
      id: 'distances',
      props: {
        title: 'How far is each planet from the Sun?',
        icon: 'sun',
        iconColor: 'var(--warning)',
        xLabel: 'Distance from the Sun →',
        yLabel: 'How big it is ↑',
        xDomain: [0, 100],
        yDomain: [0, 100],
        categories: [
          { name: 'Rocky planets (close + small)', color: 'var(--presence-soft)' },
          { name: 'Giant planets (far + huge)', color: 'var(--insight)' },
        ],
        points: [
          { label: 'Mercury', x: 4, y: 8, size: 8, cat: 'Rocky planets (close + small)' },
          { label: 'Venus', x: 7, y: 18, size: 18, cat: 'Rocky planets (close + small)' },
          { label: 'Earth', x: 10, y: 20, size: 20, cat: 'Rocky planets (close + small)' },
          { label: 'Mars', x: 15, y: 12, size: 12, cat: 'Rocky planets (close + small)' },
          { label: 'Jupiter', x: 52, y: 90, size: 90, cat: 'Giant planets (far + huge)' },
          { label: 'Saturn', x: 70, y: 78, size: 76, cat: 'Giant planets (far + huge)' },
          { label: 'Uranus', x: 86, y: 50, size: 44, cat: 'Giant planets (far + huge)' },
          { label: 'Neptune', x: 96, y: 48, size: 42, cat: 'Giant planets (far + huge)' },
        ],
        footer:
          'See the gap? The little rocky planets huddle near the Sun. The giants live way out in the cold.',
      },
    },
    {
      type: 'counter',
      col: 5,
      delay: 560,
      props: {
        title: 'Sunlight takes its time',
        icon: 'clock',
        iconColor: 'var(--insight)',
        value: 8,
        suffix: ' minutes',
        label: 'for sunlight to reach Earth',
        color: 'var(--insight)',
        footer:
          'The Sun’s light zooms here at the fastest speed there is, and it <i>still</i> takes 8 minutes. Space is BIG.',
      },
    },
    {
      type: 'timeline',
      col: 12,
      delay: 640,
      id: 'order',
      props: {
        eyebrow: 'The order of the planets, near → far from the Sun',
        events: [
          {
            time: '1st',
            title: 'Mercury',
            detail: 'Smallest planet. Zippy and super hot by day, freezing at night.',
            tag: 'rocky',
            color: 'var(--presence-soft)',
          },
          {
            time: '2nd',
            title: 'Venus',
            detail: 'The hottest planet, thick clouds trap the heat like a blanket.',
            tag: 'rocky',
            color: 'var(--warning)',
          },
          {
            time: '3rd',
            title: 'Earth',
            detail: 'Home! Water, air, and the only place with life we know of.',
            tag: 'home',
            color: 'var(--presence)',
          },
          {
            time: '4th',
            title: 'Mars',
            detail: 'The Red Planet. Robots (rovers) are driving around it right now!',
            tag: 'rocky',
            color: 'var(--danger)',
          },
          {
            time: '5th',
            title: 'Jupiter',
            detail: 'The biggest planet, with a giant storm bigger than Earth.',
            tag: 'giant',
            color: 'var(--insight)',
          },
          {
            time: '6th',
            title: 'Saturn',
            detail: 'The ringed beauty, those rings are made of ice and rock.',
            tag: 'giant',
            color: 'var(--insight)',
          },
          {
            time: '7th',
            title: 'Uranus',
            detail: 'A pale blue-green ball that spins on its side, like it rolled over.',
            tag: 'giant',
            color: 'var(--presence-soft)',
          },
          {
            time: '8th',
            title: 'Neptune',
            detail: 'The windiest, farthest planet, deep blue and very, very cold.',
            tag: 'giant',
            color: 'var(--presence)',
          },
        ],
      },
    },

    // ════════ A TOUR OF THE PLANETS (comic strip) ════════
    {
      type: 'storystrip',
      col: 12,
      delay: 720,
      id: 'tour',
      props: {
        title: 'Your tour of the solar system',
        icon: 'play',
        iconColor: 'var(--presence)',
        panels: [
          {
            heading: 'Liftoff! \u{1F680}',
            caption: 'Start',
            color: 'var(--presence)',
            body: 'We leave Earth and fly toward the Sun. First stop: the rocky little planets that live close to the heat.',
          },
          {
            heading: 'Speedy Mercury',
            caption: 'Stop 1',
            color: 'var(--presence-soft)',
            body: 'The tiniest planet races around the Sun in just <b>88 days</b>. A year here is shorter than your summer break!',
          },
          {
            heading: 'Cloudy Venus',
            caption: 'Stop 2',
            color: 'var(--warning)',
            body: 'Venus is wrapped in thick clouds that trap heat. It’s the <b>hottest</b> planet, hot enough to melt lead. No thanks!',
          },
          {
            heading: 'Rusty Red Mars',
            caption: 'Stop 3',
            color: 'var(--danger)',
            body: 'Mars looks red because its dirt is full of rust, like an old bike. Real robots are exploring it for us right now.',
          },
          {
            heading: 'Giant Jupiter',
            caption: 'Stop 4',
            color: 'var(--insight)',
            body: 'The king of the planets has a storm called the Great Red Spot, a hurricane <b>bigger than Earth</b> that’s been spinning for centuries.',
          },
          {
            heading: 'Ringed Saturn',
            caption: 'Stop 5',
            color: 'var(--insight)',
            body: 'Saturn’s shiny rings stretch wide enough to fit almost <b>6 Earths</b> across. The prettiest planet, hands down.',
          },
          {
            heading: 'Far-out Neptune',
            caption: 'Finish',
            color: 'var(--presence)',
            body: 'Way out in the dark, deep-blue Neptune has the <b>fastest winds</b> in the solar system. The end of our trip, and you made it!',
          },
        ],
        footer: 'Tap the arrows to fly from planet to planet.',
      },
    },
    {
      type: 'gallery',
      col: 7,
      delay: 800,
      id: 'photos',
      props: {
        eyebrow: 'Planet photos · from space telescopes',
        items: [
          {
            label: 'Earth, the blue marble',
            source: 'nasa.gov',
            tag: 'home',
            h1: '#3a7bd5',
            h2: '#16314f',
          },
          {
            label: 'Mars, the red planet',
            source: 'nasa.gov',
            tag: 'rusty',
            h1: '#c1440e',
            h2: '#5e2207',
          },
          {
            label: 'Jupiter & the Great Red Spot',
            source: 'esa.int',
            tag: 'biggest',
            h1: '#d9a066',
            h2: '#6e4a28',
          },
          {
            label: 'Saturn and its rings',
            source: 'nasa.gov',
            tag: 'rings',
            h1: '#e0c074',
            h2: '#6b5826',
          },
          {
            label: 'Neptune, deep blue',
            source: 'nasa.gov',
            tag: 'windy',
            h1: '#2c5fb3',
            h2: '#13284f',
          },
          {
            label: 'The Sun, our star',
            source: 'nasa.gov',
            tag: 'star',
            h1: '#ffb347',
            h2: '#8a4b10',
          },
        ],
        footer: 'These are real pictures taken by spacecraft and telescopes. Pretty cool, right?',
      },
    },
    {
      type: 'togglegroup',
      col: 5,
      delay: 880,
      id: 'moons',
      props: {
        title: 'Which planet has the most moons?',
        icon: 'moon',
        iconColor: 'var(--insight)',
        mode: 'single',
        items: [
          { label: 'Earth (1)', title: 'Earth has just our one Moon' },
          { label: 'Mars (2)', title: 'Mars has two tiny potato-shaped moons' },
          { label: 'Saturn (146)', title: 'Saturn is the moon champion!', on: true },
        ],
        hint: 'Tap a planet! Saturn wins with over 140 moons. Earth has just one, the one you see at night.',
        color: 'var(--insight)',
        footer: 'Some moons have oceans hidden under ice. Scientists wonder what might live there!',
      },
    },

    // ════════ A LITTLE QUIZ ════════
    {
      type: 'radiogroup',
      col: 6,
      delay: 960,
      id: 'quiz',
      props: {
        title: 'Quick quiz: which planet do we live on?',
        icon: 'spark',
        iconColor: 'var(--presence)',
        layout: 'card',
        options: [
          { label: 'Mars', caption: 'The red one with rovers', icon: 'globe', value: '4th' },
          {
            label: 'Earth',
            caption: 'The blue one with water and YOU',
            icon: 'check',
            value: '✅ correct!',
          },
          { label: 'Jupiter', caption: 'The giant gas one', icon: 'globe', value: '5th' },
          {
            label: 'The Sun',
            caption: 'Actually a star, not a planet!',
            icon: 'sun',
            value: 'tricky',
          },
        ],
        selected: 1,
        color: 'var(--presence)',
        footer: 'You got it, Earth, the third planet from the Sun. The only home we’ve ever had.',
      },
    },
    {
      type: 'radiogroup',
      col: 6,
      delay: 1040,
      props: {
        title: 'Bonus quiz: which is the BIGGEST planet?',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        layout: 'card',
        options: [
          {
            label: 'Earth',
            caption: 'Our home (but kinda small)',
            icon: 'globe',
            value: '#5 by size',
          },
          {
            label: 'Saturn',
            caption: 'The one with the rings',
            icon: 'globe',
            value: '2nd biggest',
          },
          {
            label: 'Jupiter',
            caption: '1,300 Earths fit inside!',
            icon: 'sparkle',
            value: '✅ biggest!',
          },
          { label: 'Mercury', caption: 'Actually the smallest', icon: 'globe', value: 'tiniest' },
        ],
        selected: 2,
        color: 'var(--warning)',
        footer: 'Jupiter wins! It’s the heavyweight champion of the whole solar system.',
      },
    },

    // ════════ THE BIG QUESTION ════════
    {
      type: 'faq',
      col: 7,
      delay: 1120,
      id: 'pluto',
      props: {
        title: 'Curious questions kids ask',
        icon: 'quote',
        iconColor: 'var(--insight)',
        defaultOpen: 0,
        items: [
          {
            q: 'Wait, why isn’t Pluto a planet anymore?',
            tag: 'Pluto',
            a: 'Great question! In 2006, scientists made a new rule: a real planet has to be the <b>boss of its path</b> around the Sun, sweeping up other space rocks nearby. Pluto is small and shares its zone with lots of icy chunks, so it didn’t clear its path. It got a new title instead: <mark>dwarf planet</mark>. Pluto is still awesome, it just joined a different club!',
          },
          {
            q: 'Why is the sky blue but space is black?',
            tag: 'Sky',
            a: 'Earth’s air scatters blue sunlight all over the sky, so it looks blue. Up in space there’s almost no air to scatter the light, so it stays <b>dark</b>, even though the Sun is shining!',
          },
          {
            q: 'Could I jump higher on the Moon?',
            tag: 'Moon',
            a: 'Yes! The Moon’s gravity is much weaker, so you’d weigh about <b>6 times less</b>. A small hop on Earth turns into a giant floaty leap on the Moon. Astronauts bounced around like kangaroos!',
          },
          {
            q: 'Is there life on other planets?',
            tag: 'Aliens?',
            a: 'We haven’t found any, <i>yet</i>. Earth is the only place we know of with life. But scientists are searching hidden oceans on icy moons and far-away worlds. Maybe you’ll be the one who finds out!',
          },
        ],
        footer: 'Tap any question to flip it open. Keep asking, that’s how scientists are made.',
      },
    },
    {
      type: 'takeaways',
      col: 5,
      delay: 1200,
      props: {
        title: 'What to remember',
        icon: 'check',
        iconColor: 'var(--presence)',
        heading: 'Your space cheat-sheet',
        items: [
          {
            text: 'There are <b>8 planets</b> circling one star, the Sun.',
            color: 'var(--warning)',
            detail:
              'In order: My Very Excellent Mom Just Served Us Nachos, a trick to remember them!',
          },
          {
            text: 'We live on <b>Earth</b>, the 3rd planet, the only one with life.',
            color: 'var(--presence)',
          },
          {
            text: '<b>Jupiter</b> is the biggest; <b>Mercury</b> is the smallest.',
            color: 'var(--insight)',
          },
          {
            text: 'Rocky planets are close & small. Gas giants are far & huge.',
            color: 'var(--presence-soft)',
          },
          {
            text: 'Pluto is now a <b>dwarf planet</b>, still cool, just a new club.',
            color: 'var(--text-muted)',
          },
        ],
        footer: 'Click a takeaway when you’ve got it. You’re basically an astronaut now.',
      },
    },
    // svgblock: orbital diagram, custom SVG illustration, no native block covers this
    {
      type: 'svgblock',
      col: 12,
      delay: 1280,
      props: {
        title: 'The solar system, to (very rough) scale',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        svg: `<svg viewBox="0 0 560 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sun-g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="var(--warning)" stop-opacity="1"/>
      <stop offset="100%" stop-color="var(--warning)" stop-opacity="0.4"/>
    </radialGradient>
  </defs>
  <!-- Sun -->
  <circle cx="28" cy="60" r="22" fill="url(#sun-g)"/>
  <text x="28" y="98" text-anchor="middle" font-size="8" fill="var(--text-secondary)">Sun</text>
  <!-- Mercury -->
  <circle cx="68" cy="60" r="2.4" fill="var(--text-muted)"/>
  <text x="68" y="74" text-anchor="middle" font-size="7" fill="var(--text-muted)">☿</text>
  <!-- Venus -->
  <circle cx="90" cy="60" r="4" fill="var(--warning-soft)"/>
  <text x="90" y="74" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♀</text>
  <!-- Earth -->
  <circle cx="118" cy="60" r="4.2" fill="var(--presence)"/>
  <text x="118" y="74" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♁</text>
  <!-- Mars -->
  <circle cx="150" cy="60" r="3" fill="var(--danger)"/>
  <text x="150" y="74" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♂</text>
  <!-- Asteroid belt -->
  <line x1="168" y1="45" x2="168" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2,3"/>
  <line x1="192" y1="45" x2="192" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2,3"/>
  <text x="180" y="40" text-anchor="middle" font-size="6.5" fill="var(--text-muted)">belt</text>
  <!-- Jupiter -->
  <circle cx="232" cy="60" r="11" fill="var(--warning)"/>
  <text x="232" y="83" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♃</text>
  <!-- Saturn + rings -->
  <ellipse cx="290" cy="60" rx="22" ry="4" fill="none" stroke="var(--warning-soft)" stroke-width="2.5" opacity="0.7"/>
  <circle cx="290" cy="60" r="9" fill="var(--insight-soft)"/>
  <text x="290" y="81" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♄</text>
  <!-- Uranus -->
  <circle cx="340" cy="60" r="6.5" fill="var(--insight)"/>
  <text x="340" y="79" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♅</text>
  <!-- Neptune -->
  <circle cx="390" cy="60" r="6" fill="var(--presence-deep)"/>
  <text x="390" y="78" text-anchor="middle" font-size="7" fill="var(--text-secondary)">♆</text>
  <!-- Scale note -->
  <text x="460" y="58" font-size="8" fill="var(--text-muted)" text-anchor="middle">sizes ≈ relative</text>
  <text x="460" y="70" font-size="8" fill="var(--text-muted)" text-anchor="middle">distances compressed</text>
</svg>`,
        caption:
          'Sizes are roughly proportional; distances are heavily compressed, real gaps are millions of km.',
        footer:
          'Jupiter alone contains more mass than all other planets combined. Saturn’s rings are 99.9% water ice, and only ~10 m thick despite spanning 282,000 km.',
      },
    },
    {
      type: 'scalefelt',
      col: 6,
      delay: 100,
      id: 'scalefelt',
      props: {
        title: 'How Big Is It, Really?',
        icon: 'layers',
        iconColor: 'var(--presence)',
        value: '6.5',
        unit: 'metres across (primary mirror)',
        comparisons: [
          {
            to: 'a tall adult giraffe',
            howMany: 1.2,
            note: "Webb's mirror would slightly out-reach the tallest land animal.",
          },
          {
            to: 'stacked dinner plates edge to edge',
            howMany: 24,
            note: 'Each gold-coated hexagon segment is about a metre wide.',
          },
          {
            to: 'Hubble mirrors by light-collecting area',
            howMany: 6,
            note: "Roughly six times Hubble's gathering power, in infrared.",
          },
          {
            to: 'a school bus, in folded launch width',
            howMany: 'about one',
            note: 'It folded origami-style to fit inside the Ariane 5 fairing.',
          },
        ],
        footer: 'Figures from NASA. Equivalences are approximate, for a feel of the scale.',
      },
    },
    {
      type: 'moonphase',
      col: 6,
      id: 'moon',
      delay: 260,
      props: {
        title: 'The Moon tonight',
        icon: 'moon',
        iconColor: 'var(--presence)',
        illumination: 0.72,
        waxing: true,
        phaseName: 'Waxing Gibbous',
        date: 'Jun 20, 2026',
        upcoming: [
          { date: 'Sat 21', illumination: 0.81 },
          { date: 'Sun 22', illumination: 0.89 },
          { date: 'Mon 23', illumination: 0.95 },
          { date: 'Tue 24', illumination: 0.99 },
        ],
        caption:
          'Brightening toward the full Moon on the 25th — good light for landscapes, tougher for faint stars.',
      },
    },
    {
      type: 'skychart',
      col: 7,
      id: 'sky',
      delay: 240,
      props: {
        title: 'The Summer Triangle, overhead',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        stars: [
          { x: 0.5, y: 0.32, mag: 0.03, name: 'Vega' },
          { x: 0.64, y: 0.58, mag: 0.77, name: 'Altair' },
          { x: 0.36, y: 0.55, mag: 1.25, name: 'Deneb' },
          { x: 0.46, y: 0.46, mag: 3.2 },
          { x: 0.57, y: 0.44, mag: 2.9 },
          { x: 0.4, y: 0.66, mag: 3.7 },
          { x: 0.7, y: 0.7, mag: 3.4 },
        ],
        constellations: [
          {
            name: 'Summer Triangle',
            lines: [
              [0, 1],
              [1, 2],
              [2, 0],
            ],
          },
          {
            name: 'Lyra',
            lines: [
              [0, 3],
              [3, 4],
            ],
          },
        ],
        planets: [{ name: 'Saturn', x: 0.74, y: 0.5 }],
        caption:
          'Three first-magnitude stars across three constellations — the anchor of the northern summer sky.',
      },
    },
    {
      type: 'orbitdiagram',
      col: 7,
      id: 'orbits',
      delay: 300,
      props: {
        title: 'The inner solar system',
        icon: 'globe',
        iconColor: 'var(--warning)',
        center: 'Sun',
        toScale: false,
        bodies: [
          {
            name: 'Mercury',
            orbitRadius: 0.39,
            size: 1,
            distance: '0.39 AU',
            period: '88 days',
            color: 'var(--text-muted)',
          },
          {
            name: 'Venus',
            orbitRadius: 0.72,
            size: 2,
            distance: '0.72 AU',
            period: '225 days',
            color: 'var(--warning)',
          },
          {
            name: 'Earth',
            orbitRadius: 1.0,
            size: 2,
            distance: '1.00 AU',
            period: '365 days',
            color: 'var(--presence)',
          },
          {
            name: 'Mars',
            orbitRadius: 1.52,
            size: 1,
            distance: '1.52 AU',
            period: '687 days',
            color: 'var(--danger)',
          },
        ],
        caption:
          'Orbit spacing is compressed so all four fit; periods grow with distance (Kepler’s third law).',
      },
    },
  ],

  proof: null,
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Making your space poster',
      say: "Here's a one-page space poster you can keep.",
      props: {
        kicker: 'SPACE POSTER · OUR SOLAR SYSTEM',
        head: 'Eight planets, one Sun, endless wonder',
        foot: 'Made by Mavéa · for one curious explorer',
        bullets: [
          {
            color: 'var(--warning)',
            text: 'The <b>Sun</b> is a star so big that 1.3 million Earths could fit inside.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Jupiter</b> is the biggest planet, 1,300 Earths fit in it!',
          },
          {
            color: 'var(--presence)',
            text: 'We live on <b>Earth</b>, the 3rd planet, the only home with life.',
          },
        ],
      },
    },
  },

  group: 'learn',
  tryChip: { label: 'Tell me about the solar system', route: 'topic:space' },
  suggests: [
    { label: 'Why isn’t Pluto a planet?', icon: 'quote', route: 'space:pluto', lead: 'Try' },
    { label: 'Give me the planet tour', icon: 'play', route: 'space:tour' },
    { label: 'How big is Jupiter, really?', icon: 'sparkle', route: 'space:sizes' },
    { label: 'Make me a space poster', icon: 'slides', route: 'slide' },
    { label: 'How’s my Kyoto trip looking?', icon: 'share', route: 'topic:travel' },
  ],
  intents: {
    pluto: { kind: 'spotlight', spotId: 'pluto', say: 'Here’s the friendly truth about Pluto.' },
    tour: { kind: 'spotlight', spotId: 'tour', say: 'Let’s fly from planet to planet!' },
    sizes: {
      kind: 'spotlight',
      spotId: 'sizes',
      say: 'Look how the planets stack up next to Earth.',
    },
    distances: {
      kind: 'spotlight',
      spotId: 'distances',
      say: 'And here’s how far apart everything really is.',
    },
    quiz: { kind: 'spotlight', spotId: 'quiz', say: 'Try the quiz, you’ve got this!' },
    slide: { kind: 'build', key: 'slide' },
  },
  keywords: [
    {
      test: /\bspace\b|solar system|\bplanets?\b|\bsun\b|\bmoon\b|jupiter|saturn|\bmars\b|venus|mercury|neptune|uranus|pluto|\bstars?\b|galaxy|astronaut|rocket/i,
      route: 'topic:space',
      sub: [
        { test: /pluto|dwarf/i, route: 'space:pluto' },
        { test: /tour|trip|visit|fly/i, route: 'space:tour' },
        { test: /big|size|biggest|how (big|large)|fit/i, route: 'space:sizes' },
        { test: /far|distance|how far|away/i, route: 'space:distances' },
      ],
    },
  ],
};

// cookkids.ts, "Let's make mini pizzas!" A joyful, kid-safe cooking plan a parent can
// follow with little hands: a numbered kid-friendly steps flow, a prep→bake timeline, an
// ingredients checklist you tick off, a servings stepper that scales the amounts, a gallery
// of what it looks like, and a big warm safety callout ("a grown-up handles the oven").
// Core blocks: insight / timeline / gallery. Extended: processflow (flows), checkboxgroup
// (forms), numberstepper (pickers), callout + takeaways + faq (layout), kpi + list (core).
import type { ConversationSpec } from '../conversation';

export const cookkids: ConversationSpec = {
  id: 'cookkids',
  workspace: 'Kitchen table',
  title: "Let's make mini pizzas!",
  sub: 'A 30-minute recipe little hands can do, and a grown-up helps with the oven.',
  opener:
    "Mini pizzas! They're forgiving, fast, and made for little hands. I'll do the steps, the timing, and the shopping list, you bring the giggles.",
  switchSay: "Let's cook with the kids.",
  gather: 'Picking a fun, easy recipe',
  found: "Here's a recipe the kids can really help with, let me show you the whole thing.",
  tint: '#ffb347',
  context: [
    { name: 'Cooking with kids', color: 'var(--warning)' },
    { name: '30 minutes', color: 'var(--presence-soft)' },
    { name: 'Ages 4+', color: 'var(--insight)' },
    { name: 'Makes 4 pizzas', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── opener narrative: two warm insight cards ──
    {
      type: 'insight',
      col: 8,
      id: 'why',
      num: '1',
      delay: 0,
      props: {
        title: 'Mini pizzas are the perfect first cook with kids',
        stat: '30 min',
        delta: 'start to first bite',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          "No knives, no stove for the little ones, just squishing, spreading, and sprinkling. Everyone gets their <b>own</b> pizza to design, so there's zero fighting over toppings.",
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'jobs',
      num: '2',
      delay: 80,
      props: {
        title: 'Every kid gets a real job',
        stat: '5 jobs',
        delta: 'spread · sprinkle · decorate',
        deltaDir: 'up',
        conf: 'strong',
        summary:
          'Spreading sauce and sprinkling cheese are perfect little-hand tasks. The grown-up keeps the oven.',
      },
    },

    // ── at-a-glance ──
    {
      type: 'kpi',
      col: 7,
      delay: 160,
      props: {
        title: 'The cook, at a glance',
        icon: 'spark',
        iconColor: 'var(--warning)',
        cols: 4,
        kpis: [
          { val: '10m', label: 'Prep', color: 'var(--presence-soft)' },
          { val: '12m', label: 'Bake', color: 'var(--warning)' },
          { val: '4', label: 'Pizzas', color: 'var(--insight)' },
          { val: 'Easy', label: 'Difficulty', color: 'var(--insight)' },
        ],
        footer: 'Pop on an apron, wash hands, and we’re off.',
      },
    },
    {
      type: 'list',
      col: 5,
      delay: 240,
      props: {
        title: 'What you’ll need from the kitchen',
        icon: 'check',
        iconColor: 'var(--presence-soft)',
        items: [
          '<b>A baking tray</b> + a sheet of parchment',
          '<b>A spoon</b> for spreading sauce, no knives needed',
          'A few <b>little bowls</b> for the toppings',
          'Oven mitts (for the grown-up!)',
        ],
      },
    },

    // ── SAFETY CALLOUT, the heart of the "cooking with kids" tone ──
    {
      type: 'callout',
      col: 12,
      delay: 320,
      id: 'safety',
      props: {
        title: 'A grown-up handles the oven',
        icon: 'shield',
        iconColor: 'var(--warning)',
        tone: 'warn',
        kicker: 'Safety first',
        body: "The oven gets to <b>425°F (220°C)</b>, that's a grown-up job, start to finish. Kids do all the fun building; you do the sliding-in and taking-out.",
        points: [
          '<b>Grown-up only:</b> turning the oven on, putting pizzas in, taking them out.',
          'Use <b>oven mitts</b> every single time, the tray stays hot for a while.',
          'Let pizzas <b>cool 3–4 minutes</b> before little hands touch them.',
          'Keep a damp towel nearby for sticky fingers and quick wipe-ups.',
        ],
        footer: 'When everyone knows their job, the kitchen stays happy and safe.',
      },
    },

    // ── INGREDIENTS CHECKLIST, tick them off as you shop/gather ──
    {
      type: 'checkboxgroup',
      col: 7,
      delay: 400,
      id: 'shopping',
      props: {
        title: 'Ingredients checklist',
        icon: 'cart',
        iconColor: 'var(--insight)',
        allLabel: 'Tick everything as you gather it',
        items: [
          {
            label: '4 mini pizza bases (or English muffins)',
            caption: 'Pre-made = the easy mode',
            checked: true,
          },
          {
            label: '1 cup pizza or pasta sauce',
            caption: 'Smooth, mild, kid-approved',
            checked: true,
          },
          {
            label: '1½ cups shredded mozzarella',
            caption: 'The big handful of cheese',
            checked: true,
          },
          { label: 'Cherry tomatoes, halved', caption: 'Grown-up does the halving' },
          { label: 'Sweetcorn + a little ham or pepperoni', caption: 'Pick your favourites' },
          { label: 'A pinch of dried oregano', caption: 'For the chef sprinkle at the end' },
        ],
        footer: 'Six things, most are probably already in your fridge.',
      },
    },
    // ── SERVINGS STEPPER, scales the amounts ──
    {
      type: 'numberstepper',
      col: 5,
      delay: 480,
      id: 'servings',
      props: {
        title: 'How many little chefs?',
        icon: 'plus',
        iconColor: 'var(--warning)',
        label: 'Pizzas to make',
        value: 4,
        min: 1,
        max: 12,
        step: 1,
        suffix: 'pizzas',
        caption:
          'At <b>4 pizzas</b>: 1 cup sauce · 1½ cups cheese · 4 bases. Tap <b>+</b> and I’ll scale every amount for you.',
        color: 'var(--warning)',
      },
    },

    // ── THE KID-FRIENDLY NUMBERED STEPS ──
    {
      type: 'processflow',
      col: 12,
      delay: 560,
      id: 'steps',
      props: {
        title: 'The steps, one fun job at a time',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        steps: [
          {
            label: 'Wash hands + aprons on',
            detail: 'Soapy hands, sleeves up. This is the official start of being a chef!',
            icon: 'sparkle',
            branch: 'Kids: count to 20 while you scrub.',
          },
          {
            label: 'Lay out the bases',
            detail: 'Put each pizza base on the parchment-lined tray, spaced apart.',
            icon: 'check',
            branch: 'Kids: give everyone their very own base.',
          },
          {
            label: 'Spoon + spread the sauce',
            detail: 'One big spoon of sauce, then swirl it around with the back of the spoon.',
            icon: 'edit',
            branch: 'Kids: leave a little border, that’s the crust!',
          },
          {
            label: 'Sprinkle the cheese',
            detail: 'A handful of mozzarella on each, snow it down evenly.',
            icon: 'sun',
            branch: 'Kids: the best part, make it snow!',
          },
          {
            label: 'Decorate the toppings',
            detail: 'Tomatoes, corn, ham, make a face, a pattern, or just a happy mess.',
            icon: 'spark',
            branch: 'Kids: try a smiley face out of toppings.',
          },
          {
            label: 'Grown-up bakes',
            detail: 'A grown-up slides the tray into the hot oven and sets the timer.',
            icon: 'shield',
            branch: 'Grown-up only, oven mitts on.',
          },
        ],
        footer: 'Six little jobs. Pass the spoon around so everyone gets a turn.',
      },
    },

    // ── PREP → BAKE TIMELINE ──
    {
      type: 'timeline',
      col: 12,
      delay: 640,
      id: 'timing',
      props: {
        eyebrow: 'Prep → bake → eat, minute by minute',
        title: 'How the 30 minutes flow',
        events: [
          {
            time: '0 min',
            title: 'Wash up + set out toppings',
            detail: 'Bowls of cheese and toppings within reach.',
            tag: 'together',
            color: 'var(--presence)',
          },
          {
            time: '3 min',
            title: 'Build the pizzas',
            detail: 'Sauce, cheese, decorate, the squishy, sprinkly fun.',
            tag: 'kids',
            color: 'var(--insight)',
          },
          {
            time: '10 min',
            title: 'Grown-up: into the oven',
            detail: '425°F (220°C), mitts on, timer set.',
            tag: 'grown-up',
            color: 'var(--warning)',
          },
          {
            time: '22 min',
            title: 'Out of the oven',
            detail: 'Golden, bubbly cheese. Grown-up lifts the tray out.',
            tag: 'grown-up',
            color: 'var(--warning)',
          },
          {
            time: '25 min',
            title: 'Cool, then the chef sprinkle',
            detail: 'A pinch of oregano on top while they cool a few minutes.',
            tag: 'together',
            color: 'var(--presence-soft)',
          },
          {
            time: '30 min',
            title: 'Eat your masterpiece!',
            detail: 'Everyone gets the pizza they made themselves.',
            tag: 'yum',
            color: 'var(--insight)',
          },
        ],
      },
    },

    // ── GALLERY, what it looks like along the way ──
    {
      type: 'gallery',
      col: 7,
      delay: 720,
      id: 'looks',
      props: {
        eyebrow: 'What it looks like',
        title: 'From plain base to happy pizza',
        items: [
          {
            label: 'Saucy bases, ready to top',
            source: 'step 3',
            tag: 'spread',
            h1: '#e8743b',
            h2: '#7a3416',
          },
          { label: 'Let it snow, the cheese', source: 'step 4', h1: '#f1c453', h2: '#6e5417' },
          {
            label: 'A smiley made of toppings',
            source: 'step 5',
            tag: 'decorate',
            h1: '#c0392b',
            h2: '#5e1f18',
          },
          {
            label: 'Golden + bubbly, fresh out',
            source: 'step 7',
            tag: 'ta-da!',
            h1: '#d98324',
            h2: '#5e3a13',
          },
        ],
        footer: 'Tap a photo to see that step up close.',
      },
    },
    // ── TAKEAWAYS, quick wins to remember ──
    {
      type: 'takeaways',
      col: 5,
      delay: 800,
      props: {
        title: 'Little tips that help a lot',
        icon: 'spark',
        iconColor: 'var(--insight)',
        heading: 'Keep it happy',
        items: [
          {
            text: 'Set toppings in <b>little bowls</b>, easy hands, less mess.',
            color: 'var(--insight)',
            detail: 'Muffin tins make great topping trays.',
          },
          {
            text: 'Let kids make <b>their own</b>, no two pizzas alike.',
            color: 'var(--warning)',
          },
          {
            text: 'A <b>damp towel</b> nearby saves a hundred wipes.',
            color: 'var(--presence-soft)',
          },
          { text: 'Praise the <b>weird-looking</b> one the loudest.', color: 'var(--presence)' },
        ],
        footer: 'The mess is part of the magic.',
      },
    },

    // ── FAQ, gentle reassurance for the grown-up ──
    {
      type: 'faq',
      col: 12,
      delay: 880,
      id: 'questions',
      props: {
        title: 'Grown-up questions, answered',
        icon: 'chat',
        iconColor: 'var(--presence-soft)',
        defaultOpen: 0,
        items: [
          {
            q: 'My kid is really little, what can they actually do?',
            a: 'Tons! Spreading sauce, sprinkling cheese, and placing toppings are all great for ages <b>3–4+</b>. You handle anything hot or sharp.',
            tag: 'Ages',
          },
          {
            q: 'No pizza bases, what else works?',
            a: 'Halved <b>English muffins</b>, bagels, naan, or flour tortillas all make brilliant mini pizzas. Same steps, same fun.',
            tag: 'Swaps',
          },
          {
            q: 'How do I know they’re done?',
            a: 'When the cheese is <b>fully melted and bubbling</b> and the edges are golden, about <b>12 minutes</b>. Grown-up checks with mitts on.',
            tag: 'Baking',
          },
          {
            q: 'Can we make them ahead?',
            a: 'Yes, build them, cover, and chill for a few hours. Bake fresh when you’re ready to eat.',
            tag: 'Make-ahead',
          },
        ],
        footer: 'Tap any question to open the answer.',
      },
    },
    {
      type: 'picturesequence',
      col: 8,
      id: 'sequence',
      delay: 800,
      props: {
        title: 'How to make a sandwich — put the steps in order',
        icon: 'layers',
        iconColor: 'var(--warning)',
        panels: [
          {
            label: 'Get two slices of bread',
            marker: 'first',
            caption: 'Lay them flat on the plate.',
          },
          {
            label: 'Spread the filling',
            marker: 'then',
            caption: 'Butter, jam, or peanut butter — your pick.',
          },
          {
            label: 'Add what you like',
            marker: 'next',
            caption: 'Cheese, banana slices, or a little honey.',
          },
          {
            label: 'Press the slices together and cut',
            marker: 'last',
            caption: 'Triangles or squares — then take a bite!',
          },
        ],
        caption: 'Read it left to right: first, then, next, last.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll put together the six ingredients you'll need.",
      props: {
        eyebrow: 'Action · shopping list',
        icon: 'cart',
        title: 'Compile the mini-pizza ingredient list',
        lines: [
          { k: 'Lists', v: '6 ingredients' },
          { k: 'Where', v: 'Copy into any list app' },
        ],
        perm: 'Mavéa has no store or list connection, it only compiles the list here.',
        cta: 'Compile the list',
        doneText: 'List ready to copy',
      },
    },
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Making a recipe card',
      say: "Here's a one-card recipe you can stick on the fridge.",
      props: {
        kicker: 'RECIPE CARD · MINI PIZZAS',
        head: 'Mini pizzas the kids can make',
        foot: 'Made by Mavéa · 30 minutes · serves 4',
        eyebrow: 'For the fridge',
        bullets: [
          {
            color: 'var(--presence-soft)',
            text: '<b>Prep 10m, bake 12m</b>, sauce, cheese, decorate, then a grown-up bakes.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Kids do:</b> spread, sprinkle, and design their very own pizza.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Grown-up does:</b> the 425°F oven, in and out, mitts on.',
          },
        ],
      },
    },
  },

  group: 'household',
  tryChip: { label: 'A fun recipe to make with my kids', route: 'topic:cookkids' },
  suggests: [
    { label: 'Compile my ingredient list', icon: 'cart', route: 'send', lead: 'Try' },
    { label: 'Show me the kid-safe steps', icon: 'sparkle', route: 'cookkids:steps' },
    { label: 'Make it a fridge recipe card', icon: 'slides', route: 'slide' },
    { label: 'What about a no-bake snack?', icon: 'spark', route: 'topic:meal' },
    { label: "What's for dinner this week?", icon: 'clock', route: 'topic:week' },
  ],
  intents: {
    steps: {
      kind: 'spotlight',
      spotId: 'steps',
      say: 'Here are the steps, one fun little job at a time.',
    },
    safety: {
      kind: 'spotlight',
      spotId: 'safety',
      say: 'The one grown-up rule: the oven is always yours.',
    },
    timing: {
      kind: 'spotlight',
      spotId: 'timing',
      say: "And here's how the thirty minutes flow, prep to plate.",
    },
  },
  keywords: [
    {
      test: /cook (with|for) (my )?kids?|recipe.*kids?|kids?.*recipe|mini pizza|make pizza|bake.*kids?|kid.?friendly (recipe|meal)|fun (recipe|cooking)/i,
      route: 'topic:cookkids',
      sub: [
        {
          test: /step|how do (i|we) make|instructions/i,
          route: 'cookkids:steps',
        },
        {
          test: /safe|oven|burn|grown.?up|danger/i,
          route: 'cookkids:safety',
        },
      ],
    },
  ],
};

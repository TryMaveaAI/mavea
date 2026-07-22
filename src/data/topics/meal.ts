// "Dinner from what you've got", three dishes you can cook now from a fridge photo,
// the winning garlic-pasta recipe, and a step-by-step with a timer to kick off.
import type { ConversationSpec } from '../conversation';

export const meal: ConversationSpec = {
  id: 'meal',
  workspace: 'Dinner tonight',
  title: "Dinner from what you've got",
  sub: "You showed me the fridge, here's what's doable tonight.",
  opener: "You're closest to a good pasta. Want me to walk you through it?",
  switchSay: "Let's see what's for dinner.",
  tint: '#ff7a85',
  context: [
    { name: 'Fridge photo', color: 'var(--insight)' },
    { name: 'Pantry list', color: 'var(--presence-soft)' },
    { name: '20 min free', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'compare',
      col: 12,
      delay: 0,
      props: {
        eyebrow: 'Three things you can make now',
        options: [
          { name: 'Garlic pasta', sub: '20 min · ready now', pick: true },
          { name: 'Veggie omelette', sub: '12 min' },
          { name: 'Fried rice', sub: '18 min · needs soy' },
        ],
        criteria: [
          {
            label: 'Have everything',
            cells: [{ v: 'Yes', win: true }, { v: 'Yes', win: true }, { v: 'Missing soy' }],
          },
          { label: 'Time', cells: [{ v: '20 min' }, { v: '12 min', win: true }, { v: '18 min' }] },
          {
            label: "Uses what's expiring",
            cells: [{ v: 'Parsley, cream', win: true }, { v: 'Eggs' }, { v: 'Rice' }],
          },
        ],
        recommendation:
          '<b>Go with the garlic pasta.</b> It uses the cream and parsley that are about to turn, and you have every ingredient.',
      },
    },
    {
      type: 'list',
      col: 5,
      delay: 120,
      props: {
        title: "What you'll need",
        icon: 'check',
        items: [
          'Spaghetti (½ box)',
          'Garlic · 4 cloves',
          'Cream · the open carton',
          'Parmesan',
          'Parsley · the rest of it',
        ],
      },
    },
    {
      type: 'timeline',
      col: 7,
      delay: 200,
      id: 'steps',
      props: {
        eyebrow: 'Four steps, 20 minutes',
        events: [
          {
            time: '0:00',
            title: 'Boil the pasta',
            detail: "Salt the water well, it's your only seasoning here.",
            color: 'var(--presence)',
          },
          {
            time: '0:04',
            title: 'Soften the garlic',
            detail: "Low heat, don't brown it. Add the cream as it warms.",
            color: 'var(--presence)',
          },
          {
            time: '0:10',
            title: 'Toss together',
            tag: 'save some pasta water',
            detail: 'Loosen the sauce with a splash of the starchy water.',
            color: 'var(--warning)',
          },
          {
            time: '0:14',
            title: 'Finish + plate',
            detail: 'Parmesan, parsley, black pepper. Done.',
            color: 'var(--insight)',
          },
        ],
      },
    },
    {
      type: 'gallery',
      col: 5,
      delay: 300,
      props: {
        eyebrow: "What it'll look like",
        items: [
          {
            label: 'Creamy garlic pasta',
            source: 'from the web',
            tag: '20 min',
            h1: '#e6c98a',
            h2: '#6e5226',
          },
        ],
        footer: 'Closest match to your ingredients.',
      },
    },
    {
      type: 'web',
      col: 7,
      delay: 360,
      props: {
        title: 'Recipe Mavéa adapted',
        live: false,
        results: [
          {
            domain: 'seriouseats.com',
            color: 'var(--warning)',
            title: 'Pasta al limone, simplified',
            excerpt:
              'Mavéa swapped lemon for the <mark>cream and parsley you have</mark>, and halved it for one.',
          },
          {
            domain: 'yourkitchen',
            color: 'var(--presence)',
            title: 'From your fridge photo',
            excerpt:
              'Detected: <mark>spaghetti, garlic, cream, parmesan, parsley</mark>, enough for tonight.',
          },
        ],
      },
    },
    {
      type: 'recipecard',
      col: 7,
      delay: 480,
      props: {
        title: 'Creamy Garlic Pasta',
        servings: '2',
        prepTime: '5 min',
        cookTime: '20 min',
        difficulty: 'easy',
        ingredients: [
          { qty: '200g', name: 'spaghetti' },
          { qty: '4', name: 'garlic cloves, sliced' },
          { qty: '150ml', name: 'heavy cream' },
          { qty: '40g', name: 'parmesan, grated' },
          { qty: 'handful', name: 'fresh parsley' },
        ],
        steps: [
          'Cook spaghetti in salted water until al dente. Reserve 100ml pasta water.',
          'Gently fry garlic in olive oil until golden, about 2 min. Lower heat.',
          'Add cream and half the parmesan. Simmer 3 min until slightly thickened.',
          'Toss pasta in the sauce with pasta water until glossy. Finish with parsley.',
        ],
        tips: ['Off the heat for the final toss, keeps the sauce silky, not grainy.'],
      },
    },
    {
      type: 'cocktailcard',
      col: 5,
      delay: 540,
      props: {
        title: 'Pairs with: a French 75',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        rating: 4.5,
        pours: [
          { qty: '1 oz', item: 'Gin' },
          { qty: '0.5 oz', item: 'Fresh lemon juice' },
          { qty: '0.5 oz', item: 'Simple syrup' },
          { qty: 'top with', item: 'Chilled champagne' },
        ],
        notes: {
          aroma: 'Bright citrus with a floral gin lift.',
          taste: 'Crisp and tart, the bubbles cut the cream sauce nicely.',
          finish: 'Clean and short, doesn’t fight the garlic.',
        },
      },
    },
    {
      type: 'ingredientmatrix',
      col: 5,
      delay: 570,
      props: {
        title: 'What else you can make',
        recipes: ['Pasta', 'Omelette', 'Fried rice'],
        ingredients: ['Eggs', 'Garlic', 'Cream', 'Parsley', 'Rice'],
        matrix: [
          [false, true, false],
          [true, false, true],
          [true, false, false],
          [true, false, false],
          [false, false, true],
        ],
      },
    },
    {
      type: 'plangrid',
      col: 12,
      delay: 660,
      props: {
        title: 'If you want to plan the week ahead',
        icon: 'clock',
        iconColor: 'var(--insight)',
        caption: 'A loose dinner plan from what you tend to keep stocked — swap any night.',
        columns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        rows: [
          {
            slot: 'Dinner',
            cells: [
              { col: 'Mon', label: 'Garlic pasta', sub: '20 min', accent: 'var(--presence)' },
              { col: 'Tue', label: 'Veggie omelette', sub: '12 min' },
              { col: 'Wed', label: 'Fried rice', sub: '18 min' },
              { col: 'Thu', label: 'Sheet-pan chicken', sub: '35 min' },
              { col: 'Fri', label: 'Pizza night', sub: 'takeout', accent: 'var(--warning)' },
              { col: 'Sat', label: 'Tacos', sub: '25 min' },
              { col: 'Sun', label: 'Roast + leftovers', sub: '60 min', accent: 'var(--insight)' },
            ],
          },
          {
            slot: 'Prep',
            cells: [
              { col: 'Wed', label: 'Defrost chicken', sub: 'overnight' },
              { col: 'Sun', label: 'Chop veg, cook rice', sub: 'for the week' },
            ],
          },
        ],
        summary: ['~650', '~500', '~620', '~700', '~800', '~720', '~750'],
        footer: 'Mostly things you can make from staples; Friday and Sunday are the easy nights.',
      },
    },
    {
      type: 'nutritionlabel',
      col: 5,
      id: 'meal-nutrition',
      delay: 750,
      props: {
        title: 'Nutrition facts',
        icon: 'doc',
        servingSize: '1 cup (55g)',
        servings: 'about 8',
        calories: 210,
        nutrients: [
          { name: 'Total Fat', amount: '3g', dv: 4, bold: true },
          { name: 'Saturated Fat', amount: '0.5g', dv: 3, indent: true },
          { name: 'Trans Fat', amount: '0g', indent: true },
          { name: 'Sodium', amount: '180mg', dv: 8, bold: true },
          { name: 'Total Carbohydrate', amount: '44g', dv: 16, bold: true },
          { name: 'Dietary Fiber', amount: '5g', dv: 18, indent: true },
          { name: 'Total Sugars', amount: '12g', indent: true },
          { name: 'Added Sugars', amount: '9g', dv: 18, indent: true },
          { name: 'Protein', amount: '4g', bold: true },
          { name: 'Iron', amount: '8.1mg', dv: 45 },
        ],
        allergens: ['wheat', 'almonds'],
      },
    },
    {
      type: 'unitconvert',
      col: 4,
      id: 'meal-convert',
      delay: 840,
      props: {
        title: 'Quick conversions',
        icon: 'table',
        quantity: 1,
        from: 'cup',
        category: 'volume',
        equivalents: [
          { value: '240', unit: 'ml' },
          { value: '16', unit: 'tbsp' },
          { value: '48', unit: 'tsp' },
          { value: '8', unit: 'fl oz' },
        ],
      },
    },
    {
      type: 'seasonband',
      col: 8,
      id: 'meal-seasonband',
      delay: 240,
      props: {
        title: 'Produce in season through the year',
        icon: 'spark',
        iconColor: 'var(--presence)',
        nowMonth: 6,
        rows: [
          {
            label: 'Asparagus',
            windows: [
              { from: 3, to: 6, kind: 'available' },
              { from: 4, to: 5, kind: 'peak' },
            ],
            note: 'Best snapped fresh in mid-spring; flavour fades fast after picking.',
          },
          {
            label: 'Tomatoes',
            windows: [
              { from: 6, to: 10, kind: 'available' },
              { from: 7, to: 9, kind: 'peak' },
            ],
            note: 'Vine-ripened and sweetest at the height of summer.',
          },
          {
            label: 'Winter squash',
            windows: [
              { from: 9, to: 12, kind: 'available' },
              { from: 1, to: 2, kind: 'available' },
              { from: 10, to: 11, kind: 'peak' },
            ],
            note: 'Harvested in autumn, it keeps for months in a cool pantry.',
          },
        ],
        caption: 'Northern-hemisphere harvest windows; the dashed line marks the current month.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Setting it up',
      say: "I'll get a 10-minute pasta timer ready, you start it.",
      props: {
        eyebrow: 'Action · timer',
        icon: 'clock',
        title: 'Get a 10-minute pasta timer ready',
        lines: [
          { k: 'Sets up', v: '10:00 timer, named “Pasta”' },
          { k: 'Where', v: 'You start it on your phone' },
        ],
        perm: "Mavéa can't start timers on your phone, it only prepares this one.",
        cta: 'Get it ready',
        doneText: 'Timer ready — start it on your phone',
      },
    },
  },

  group: 'home',
  tryChip: { label: 'What should I cook tonight?', route: 'topic:meal' },
  suggests: [
    { label: 'Walk me through it', icon: 'clock', route: 'meal:steps', lead: 'Try' },
    { label: 'Get the timer ready', icon: 'check', route: 'send' },
    { label: "What's my week look like?", icon: 'sparkle', route: 'topic:week' },
    { label: 'Plan my Lisbon trip', icon: 'layers', route: 'topic:trip' },
  ],
  intents: {
    steps: {
      kind: 'spotlight',
      spotId: 'steps',
      say: 'Start the water, soften the garlic, toss with pasta water. Twenty minutes.',
    },
  },
  keywords: [
    {
      test: /dinner|cook|recipe|eat|hungry|fridge|meal|pasta|food/,
      route: 'topic:meal',
      sub: [{ test: /step|how|walk me|recipe|make it/, route: 'meal:steps' }],
    },
  ],
};

// Domain-coverage block examples — components not exercised in the demo conversations
// (split from authoredExamples.ts). Entries verbatim — do not edit content.
export const COVERAGE_EXAMPLES: Record<string, Record<string, unknown>> = {
  recipecard: {
    title: 'Classic Carbonara',
    icon: 'sparkle',
    iconColor: 'var(--presence)',
    servings: '2',
    prepTime: '10 min',
    cookTime: '15 min',
    difficulty: 'medium',
    ingredients: [
      { qty: '200g', name: 'spaghetti' },
      { qty: '100g', name: 'pancetta or guanciale' },
      { qty: '2', name: 'large eggs' },
      { qty: '50g', name: 'Pecorino Romano, finely grated' },
      { qty: '1 tsp', name: 'black pepper, freshly ground' },
    ],
    steps: [
      'Cook spaghetti in well-salted boiling water until al dente. Reserve 200ml pasta water.',
      'Fry pancetta in a dry pan over medium heat until crisp. Remove from heat.',
      'Whisk eggs with Pecorino and black pepper in a bowl.',
      'Add hot pasta to the pancetta pan off the heat. Pour egg mix over, tossing quickly.',
      'Add pasta water a splash at a time, tossing until glossy and creamy. Serve immediately.',
    ],
    tips: ['Never add the egg mix on direct heat — it will scramble.'],
  },

  workoutplan: {
    title: 'Push/Pull/Legs Split',
    icon: 'chart',
    iconColor: 'var(--presence)',
    goal: 'Hypertrophy',
    weeks: 6,
    sessions: [
      {
        day: 'Day 1',
        focus: 'Push — Chest & Triceps',
        exercises: [
          { name: 'Barbell Bench Press', sets: 4, reps: '8–10', rest: '90 sec' },
          { name: 'Incline Dumbbell Press', sets: 3, reps: '10–12', rest: '75 sec' },
          { name: 'Tricep Dips', sets: 3, reps: 'to failure', rest: '60 sec' },
        ],
      },
      {
        day: 'Day 2',
        focus: 'Pull — Back & Biceps',
        exercises: [
          { name: 'Pull-Ups', sets: 4, reps: 'to failure', rest: '90 sec' },
          { name: 'Barbell Row', sets: 3, reps: '8–10', rest: '90 sec' },
          { name: 'Dumbbell Curls', sets: 3, reps: '10–12', rest: '60 sec' },
        ],
      },
    ],
  },

  medicationschedule: {
    title: 'Daily Medication Schedule',
    icon: 'bell',
    iconColor: 'var(--presence)',
    startDate: 'June 13, 2026',
    medications: [
      {
        name: 'Lisinopril',
        dose: '10 mg',
        frequency: 'once daily',
        times: ['8:00 AM'],
        withFood: false,
        notes: 'Monitor blood pressure weekly',
      },
      {
        name: 'Metformin',
        dose: '500 mg',
        frequency: 'twice a day',
        times: ['8:00 AM', '7:00 PM'],
        withFood: true,
      },
    ],
  },

  macrobreakdown: {
    title: 'Grilled Chicken Bowl — Macros',
    icon: 'chart',
    iconColor: 'var(--presence)',
    calories: 620,
    protein: 52,
    carbs: 58,
    fat: 18,
    fiber: 8,
    items: [
      { label: 'Chicken breast (6 oz)', calories: 280, protein: 52, carbs: 0, fat: 6 },
      { label: 'Brown rice (1 cup)', calories: 215, protein: 5, carbs: 45, fat: 2 },
      { label: 'Avocado (½)', calories: 125, protein: 1, carbs: 6, fat: 12 },
    ],
  },

  chorddiagram: {
    title: 'Em Chord',
    icon: 'sparkle',
    iconColor: 'var(--presence)',
    chordName: 'Em',
    instrument: 'Guitar',
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [null, 2, 3, null, null, null],
    notes: ['E', 'B', 'E', 'G', 'B', 'E'],
  },

  developmentmilestone: {
    title: '18-Month Milestones',
    icon: 'sparkle',
    iconColor: 'var(--presence)',
    ageLabel: '18 months',
    domains: [
      {
        domain: 'motor',
        milestones: [
          { label: 'Walks independently', achieved: true },
          { label: 'Climbs onto low furniture', achieved: true },
          { label: 'Kicks a ball', achieved: false },
        ],
      },
      {
        domain: 'language',
        milestones: [
          { label: 'Says 10+ words', achieved: true },
          { label: 'Points to objects to share interest', achieved: true },
          { label: 'Follows simple 2-step instructions', achieved: false },
        ],
      },
    ],
  },

  argumentmap: {
    title: 'Should Cities Ban Single-Use Plastics?',
    icon: 'proof',
    iconColor: 'var(--presence)',
    claim: 'Cities should ban single-use plastic bags and containers.',
    premises: [
      { type: 'support', text: 'Reduces landfill waste and ocean pollution by up to 40%.' },
      { type: 'support', text: 'Reusable alternatives are widely available and cost-effective.' },
      {
        type: 'objection',
        text: 'Disproportionately burdens low-income residents who rely on cheap packaging.',
      },
      { type: 'objection', text: 'Enforcement is costly and difficult for small businesses.' },
      {
        type: 'qualifier',
        text: 'Effectiveness depends on recycling infrastructure and public compliance.',
      },
    ],
    verdict:
      'On balance, the environmental benefits outweigh economic concerns if paired with subsidies for low-income groups.',
  },

  sportspitch: {
    title: '4-3-3 Formation',
    icon: 'chart',
    iconColor: 'var(--presence)',
    sport: 'soccer',
    positions: [
      { label: 'GK', x: 5, y: 32.5 },
      { label: 'LB', x: 22, y: 10 },
      { label: 'CB', x: 22, y: 25 },
      { label: 'CB', x: 22, y: 40 },
      { label: 'RB', x: 22, y: 55 },
      { label: 'CM', x: 45, y: 20 },
      { label: 'CDM', x: 45, y: 32.5 },
      { label: 'CM', x: 45, y: 45 },
      { label: 'LW', x: 70, y: 10 },
      { label: 'ST', x: 75, y: 32.5 },
      { label: 'RW', x: 70, y: 55 },
    ],
  },

  floorplan: {
    title: '2-Bedroom Apartment',
    icon: 'layers',
    iconColor: 'var(--presence)',
    scale: '1 unit = 1 ft',
    rooms: [
      { name: 'Living Room', x: 2, y: 2, w: 45, h: 40, note: '18×16 ft' },
      { name: 'Kitchen', x: 50, y: 2, w: 30, h: 30, note: '12×12 ft' },
      { name: 'Bedroom 1', x: 2, y: 55, w: 38, h: 40, note: '15×16 ft' },
      { name: 'Bedroom 2', x: 44, y: 55, w: 36, h: 40, note: '14×16 ft' },
      { name: 'Bathroom', x: 83, y: 35, w: 15, h: 25, note: '6×10 ft' },
    ],
  },

  ingredientmatrix: {
    title: 'Weekly Meal Prep — Shared Ingredients',
    icon: 'table',
    iconColor: 'var(--presence)',
    recipes: ['Stir Fry', 'Salad', 'Soup'],
    ingredients: ['Chicken', 'Garlic', 'Olive oil', 'Bell pepper', 'Onion', 'Broth'],
    matrix: [
      [true, false, true],
      [true, true, true],
      [true, true, false],
      [true, false, false],
      [false, true, true],
      [false, false, true],
    ],
  },

  clinicaltimeline: {
    title: 'Patient Health History',
    icon: 'doc',
    iconColor: 'var(--presence)',
    events: [
      {
        date: 'Jan 5, 2026',
        type: 'symptom',
        label: 'Persistent fatigue and joint pain began',
        note: 'Patient reported 6/10 pain severity',
      },
      { date: 'Jan 14, 2026', type: 'visit', label: 'Initial GP consultation' },
      { date: 'Jan 20, 2026', type: 'test', label: 'Blood panel and rheumatoid factor ordered' },
      { date: 'Feb 1, 2026', type: 'result', label: 'Elevated CRP (18 mg/L) and positive RF' },
      {
        date: 'Feb 8, 2026',
        type: 'diagnosis',
        label: 'Rheumatoid Arthritis diagnosed',
        note: 'Referred to rheumatology',
      },
      { date: 'Feb 20, 2026', type: 'treatment', label: 'Methotrexate 15mg/week prescribed' },
    ],
  },

  researchsummary: {
    title: 'Exercise & Cognitive Function',
    icon: 'doc',
    iconColor: 'var(--presence)',
    question: 'Does regular aerobic exercise improve cognitive function in adults over 50?',
    method: 'Meta-analysis of 24 RCTs',
    sampleSize: 'n = 4,800 adults aged 50–80',
    year: '2024',
    findings: [
      'Aerobic exercise 3×/week improved executive function scores by 18% on average.',
      'Memory recall improved significantly after 12+ weeks of sustained exercise.',
      'Benefits were observed across all fitness levels, including previously sedentary participants.',
      'HIIT showed the largest effect size (d = 0.72).',
    ],
    conclusion:
      'Regular aerobic exercise — particularly HIIT — produces meaningful, consistent improvements in cognitive function for adults over 50.',
    limitations:
      'Most studies relied on self-reported exercise compliance; long-term retention of gains (>1 year post-intervention) requires further study.',
    source: 'Journal of Aging & Physical Activity, 2024',
  },

  conjugation: {
    title: 'Hablar — Spanish Present & Preterite',
    verb: 'hablar',
    language: 'Spanish',
    tenses: [
      {
        name: 'Present',
        forms: [
          { pronoun: 'yo', form: 'hablo' },
          { pronoun: 'tú', form: 'hablas' },
          { pronoun: 'él/ella', form: 'habla' },
          { pronoun: 'nosotros', form: 'hablamos' },
          { pronoun: 'vosotros', form: 'habláis' },
          { pronoun: 'ellos', form: 'hablan' },
        ],
      },
      {
        name: 'Preterite',
        forms: [
          { pronoun: 'yo', form: 'hablé' },
          { pronoun: 'tú', form: 'hablaste' },
          { pronoun: 'él/ella', form: 'habló' },
          { pronoun: 'nosotros', form: 'hablamos' },
          { pronoun: 'vosotros', form: 'hablasteis' },
          { pronoun: 'ellos', form: 'hablaron' },
        ],
      },
    ],
  },

  gridmatrix: {
    title: 'Punnett Square — Tt × Tt Cross',
    variant: 'punnett',
    colHeaders: ['T', 't'],
    rowHeaders: ['T', 't'],
    cells: [
      ['TT', 'Tt'],
      ['Tt', 'tt'],
    ],
    highlight: [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    note: 'Three of four offspring show the dominant trait (tall); one is homozygous recessive (short).',
  },

  fractionbar: {
    title: 'Fraction Comparisons',
    fractions: [
      { numerator: 1, denominator: 2, label: '½' },
      { numerator: 3, denominator: 4, label: '¾' },
      { numerator: 2, denominator: 3, label: '⅔' },
    ],
    showPie: true,
  },

  dotplot: {
    title: 'Quiz Scores — Period 2',
    values: [72, 75, 78, 78, 80, 82, 82, 82, 85, 88, 88, 90, 92, 95],
    label: 'Score',
    color: 'var(--presence)',
  },

  controlchart: {
    title: 'Tablet Fill Weight — Batch Control',
    yLabel: 'mg',
    centerLine: 500,
    ucl: 515,
    lcl: 485,
    points: [
      { label: 'Lot 1', value: 498 },
      { label: 'Lot 2', value: 503 },
      { label: 'Lot 3', value: 507 },
      { label: 'Lot 4', value: 494 },
      { label: 'Lot 5', value: 518, outOfControl: true },
      { label: 'Lot 6', value: 501 },
      { label: 'Lot 7', value: 499 },
      { label: 'Lot 8', value: 505 },
    ],
  },

  probabilitytree: {
    title: 'Coin Flip — Two Tosses',
    branches: [
      {
        label: 'Heads',
        prob: 0.5,
        children: [
          { label: 'Heads', prob: 0.5, outcome: 'P = 0.25' },
          { label: 'Tails', prob: 0.5, outcome: 'P = 0.25' },
        ],
      },
      {
        label: 'Tails',
        prob: 0.5,
        children: [
          { label: 'Heads', prob: 0.5, outcome: 'P = 0.25' },
          { label: 'Tails', prob: 0.5, outcome: 'P = 0.25' },
        ],
      },
    ],
  },

  teachdiagram: {
    title: "Newton's Second Law — F = ma",
    icon: 'sparkle',
    iconColor: 'var(--presence)',
    ratio: 1.6,
    baseShapes: [{ kind: 'line', x1: 5, y1: 58, x2: 95, y2: 58, color: 'var(--text-muted)' }],
    steps: [
      {
        caption: 'A 2 kg block sits at rest on a frictionless surface.',
        add: [
          {
            kind: 'rect',
            x: 38,
            y: 44,
            w: 24,
            h: 14,
            fill: 'var(--presence-soft)',
            color: 'var(--presence)',
          },
        ],
        labels: [{ x: 50, y: 51, text: 'm = 2 kg', side: 'bottom' }],
        emphasize: [0],
      },
      {
        caption: 'A net force F = 6 N is applied to the right.',
        add: [
          { kind: 'line', x1: 62, y1: 51, x2: 82, y2: 51, color: 'var(--insight)', arrow: true },
        ],
        labels: [{ x: 72, y: 51, text: 'F = 6 N', side: 'top', color: 'var(--insight)' }],
        emphasize: [0],
      },
      {
        caption: 'F = ma  →  a = F / m = 6 / 2 = 3 m/s². The block accelerates.',
        add: [
          { kind: 'line', x1: 62, y1: 51, x2: 90, y2: 51, color: 'var(--warning)', arrow: true },
        ],
        labels: [{ x: 76, y: 51, text: 'a = 3 m/s²', side: 'top', color: 'var(--warning)' }],
      },
    ],
  },
};

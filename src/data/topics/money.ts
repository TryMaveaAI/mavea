// "Your money this quarter", where spending went, the forgotten subscriptions to cut,
// and whether the savings goal is still on track for December.
import type { ConversationSpec } from '../conversation';

export const money: ConversationSpec = {
  id: 'money',
  workspace: 'Your money',
  title: 'Your money this quarter',
  sub: 'Three things stood out across your files.',
  opener: "Here's your money this quarter. Start with the spending.",
  tint: '#6e8cff',
  context: [
    { name: 'Checking statement.pdf', color: 'var(--danger)' },
    { name: 'Credit card.csv', color: 'var(--presence-soft)' },
    { name: 'Savings.pdf', color: 'var(--danger)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'spend',
      num: '1',
      delay: 0,
      props: {
        title: 'Spending climbed for the third month running',
        stat: '$6,480',
        delta: '+18%',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'Mostly groceries and dining, plus one big travel week in May.',
        sources: [{ file: 'Checking.pdf' }, { file: 'Credit card.csv' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'subs',
      num: '2',
      delay: 90,
      prove: true,
      props: {
        title: 'Subscriptions quietly grew to $214 a month',
        stat: '$214',
        delta: '+$72',
        deltaDir: 'up',
        conf: 'strong',
        summary: "Eleven active subscriptions. Three you haven't touched in months.",
        sources: [{ file: 'Credit card.csv', loc: '6 rows' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'save',
      num: '3',
      delay: 180,
      props: {
        title: "You're still on track to hit your savings goal",
        stat: '$5,200',
        delta: 'by Dec',
        deltaDir: 'good',
        conf: 'inferred',
        summary: "If income holds you'll clear the goal, but two months of records are missing.",
        sources: [{ file: 'Savings.pdf' }],
      },
    },
    {
      type: 'chart',
      col: 8,
      delay: 260,
      props: {
        title: 'Spending vs. your typical month',
        unit: '$',
        labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
        series: [
          {
            name: 'This period',
            color: 'var(--presence)',
            data: [4200, 4500, 4300, 4800, 5200, 6480],
          },
          {
            name: 'Your typical month',
            color: 'var(--text-muted)',
            data: [4400, 4350, 4400, 4500, 4650, 4800],
            area: false,
          },
        ],
        footer: 'Up 18% over three months, May travel was the spike, not a new habit.',
      },
    },
    {
      type: 'ring',
      col: 4,
      delay: 320,
      props: {
        title: 'Savings goal',
        icon: 'spark',
        iconColor: 'var(--insight)',
        rings: [
          {
            label: 'Toward $8k',
            pct: 0.78,
            display: '78%',
            color: 'var(--insight)',
            hint: '$6,240 saved',
          },
        ],
        footer: 'On pace to clear it by December.',
      },
    },
    {
      type: 'stack',
      col: 12,
      delay: 380,
      props: {
        title: 'Where it went · May',
        total: '$6,480',
        segments: [
          { label: 'Groceries', value: 1840, display: '$1,840', color: 'var(--presence)' },
          { label: 'Travel', value: 1460, display: '$1,460', color: 'var(--warning)' },
          { label: 'Dining', value: 1120, display: '$1,120', color: 'var(--presence-soft)' },
          { label: 'Bills & utilities', value: 980, display: '$980', color: 'var(--text-muted)' },
          { label: 'Other', value: 866, display: '$866', color: 'var(--presence-deep)' },
          { label: 'Subscriptions', value: 214, display: '$214', color: 'var(--insight)' },
        ],
        footer: "Travel was the one-off, strip it and you're flat month to month.",
      },
    },
    {
      type: 'messagescriptset',
      col: 7,
      delay: 560,
      props: {
        title: 'What to say to cancel the three you forgot',
        intro:
          'Each one has its own quirks, so the wording differs. Copy the line, send it, and keep the rebuttal handy.',
        scripts: [
          {
            target: 'Streaming bundle (auto-renews Jul 2)',
            channel: 'in-app',
            message:
              'Please cancel my subscription effective at the end of the current billing period. I do not want it to auto-renew. Can you confirm the cancellation in writing?',
            rebuttal:
              'If they offer a discount to stay: "Thanks, but I’d still like to cancel today and reconsider later if I need it."',
          },
          {
            target: 'Gym membership',
            channel: 'email',
            message:
              'I’d like to cancel my membership. Please tell me the exact notice period and the final charge date so there are no surprises, and confirm once it is processed.',
            rebuttal:
              'If they cite a long notice window: "Please send me the clause that requires it, and start the cancellation clock from today."',
          },
          {
            target: 'Cloud storage (annual plan)',
            channel: 'phone',
            message:
              'I’m calling to cancel my plan and turn off auto-renewal. Since I just renewed, am I within the refund window, and what do I need to do to qualify?',
            rebuttal:
              'If they say no refund: "Can you note my account that I asked to cancel today, in case the window is calculated from a different date?"',
          },
        ],
        footer: 'Cancelling all three frees up about <b>$41/month</b> toward your December goal.',
      },
    },
    {
      type: 'eligibilitycheck',
      col: 6,
      delay: 760,
      props: {
        title: 'Do you qualify for the first-time buyer down-payment grant',
        icon: 'proof',
        overall: 'depends',
        requirements: [
          {
            rule: 'First-time buyer (no owned home in the last 3 years)',
            status: 'pass',
            detail: 'You said you have rented for the past 6 years — clears the rule.',
          },
          {
            rule: 'Household income under $96,000',
            status: 'pass',
            detail: 'You stated $78k combined, comfortably under the cap.',
          },
          {
            rule: 'Complete an approved homebuyer education course',
            status: 'needs-info',
            detail: 'You have not mentioned a course, and it is required before closing.',
            fix: 'Finish a HUD-approved class (free, ~8 hours online) and keep the certificate.',
          },
          {
            rule: 'Minimum credit score of 640',
            status: 'fail',
            detail: 'You mentioned a score around 615, below the 640 floor.',
            fix: 'Raise it ~25 points — clearing a balance or two often does it within a cycle.',
          },
        ],
        caveat:
          'This weighs the published rules against what you told me — confirm the exact thresholds with the program office before you apply.',
      },
    },
    {
      type: 'bridge',
      col: 8,
      delay: 240,
      props: {
        title: 'Why net pay changed this month',
        icon: 'chart',
        iconColor: 'var(--presence)',
        prefix: '$',
        start: 4200,
        end: 4615,
        steps: [
          { label: 'Quarterly bonus', delta: 900 },
          { label: 'Overtime hours', delta: 180 },
          { label: 'Higher tax bracket', delta: -410 },
          { label: 'New 401(k) bump', delta: -255 },
        ],
        footer:
          'The bonus did the lifting; a stiffer tax bracket and a bigger retirement contribution gave most of it back, for a net of <b>+$415</b>.',
      },
    },
    {
      type: 'supplydemand',
      col: 8,
      delay: 320,
      props: {
        title: 'Coffee market equilibrium',
        icon: 'chart',
        iconColor: 'var(--presence)',
        pricePrefix: '$',
        priceLabel: 'Price ($/lb)',
        quantityLabel: 'Quantity (k lbs)',
        supply: { intercept: 2, slope: 0.5 },
        demand: { intercept: 14, slope: -0.7 },
        region: 'consumer',
        footer:
          'Where the curves cross, the market clears: <b>P* = $7/lb</b> at <b>Q* = 10k lbs</b>. The shaded wedge is consumer surplus &mdash; the gap between what buyers would have paid and the $7 they actually do.',
      },
    },
    {
      type: 'payoffdiagram',
      col: 8,
      delay: 420,
      props: {
        title: 'Bull call spread on the underlying',
        icon: 'chart',
        iconColor: 'var(--presence)',
        pricePrefix: '$',
        spot: 101,
        legs: [
          { type: 'call', position: 'long', strike: 100, premium: 6 },
          { type: 'call', position: 'short', strike: 110, premium: 2.5 },
        ],
        footer:
          'Buy the $100 call and sell the $110 call for a net debit of <b>$3.50</b>. That caps both ends: the loss can&rsquo;t exceed the $3.50 paid (below $100), and the profit tops out at <b>$6.50</b> (above $110). It turns positive at the break-even of <b>$103.50</b> &mdash; the lower strike plus the debit.',
      },
    },
    {
      type: 'yieldcurve',
      col: 8,
      delay: 480,
      props: {
        title: 'Treasury yield curve',
        icon: 'chart',
        iconColor: 'var(--presence)',
        curve: [
          { tenor: '1M', rate: 5.4 },
          { tenor: '3M', rate: 5.3 },
          { tenor: '6M', rate: 5.1 },
          { tenor: '1Y', rate: 4.7 },
          { tenor: '2Y', rate: 4.3 },
          { tenor: '5Y', rate: 4.0 },
          { tenor: '10Y', rate: 4.1 },
          { tenor: '30Y', rate: 4.3 },
        ],
        compareCurve: [
          { tenor: '1M', rate: 3.2 },
          { tenor: '3M', rate: 3.3 },
          { tenor: '6M', rate: 3.5 },
          { tenor: '1Y', rate: 3.7 },
          { tenor: '2Y', rate: 3.8 },
          { tenor: '5Y', rate: 3.9 },
          { tenor: '10Y', rate: 4.0 },
          { tenor: '30Y', rate: 4.1 },
        ],
        footer:
          'The short end pays more than the long end out to 5 years — the curve has been inverted since short rates rose faster than the market expects them to stay.',
      },
    },
    {
      type: 'efficientfrontier',
      col: 8,
      delay: 540,
      props: {
        title: 'Your portfolio vs. the efficient frontier',
        icon: 'chart',
        iconColor: 'var(--presence)',
        assets: [
          { label: 'Cash', risk: 1, return: 4 },
          { label: 'Bonds', risk: 6, return: 5 },
          { label: 'Your portfolio', risk: 11, return: 8.5, highlight: true },
          { label: 'US stocks', risk: 16, return: 10 },
          { label: 'Intl stocks', risk: 19, return: 9 },
          { label: 'Small-cap', risk: 24, return: 11.5 },
          { label: 'Crypto', risk: 55, return: 14 },
        ],
        frontier: [
          { risk: 1, return: 4 },
          { risk: 4, return: 5.2 },
          { risk: 8, return: 7 },
          { risk: 13, return: 9.2 },
          { risk: 19, return: 10.8 },
          { risk: 30, return: 12.5 },
          { risk: 55, return: 14 },
        ],
        footer:
          'Your portfolio sits just below the frontier at its risk level — trimming a couple points of risk for the same return, or reaching for ~1 more point of return, is on the table without adding funds.',
      },
    },
    {
      type: 'bondladder',
      col: 6,
      delay: 600,
      props: {
        title: 'CD ladder',
        icon: 'chart',
        iconColor: 'var(--presence)',
        rungs: [
          { label: '1-year CD', maturity: '2027-07-01', yieldPct: 4.4, faceValue: 5000 },
          { label: '2-year CD', maturity: '2028-07-01', yieldPct: 4.1, faceValue: 5000 },
          { label: '3-year CD', maturity: '2029-07-01', yieldPct: 4.6, faceValue: 5000 },
          { label: '4-year CD', maturity: '2030-07-01', yieldPct: 4.3, faceValue: 5000 },
          { label: '5-year CD', maturity: '2031-07-01', yieldPct: 4.5, faceValue: 5000 },
        ],
        footer:
          'One CD matures every year — the 3-year rung pays the most, but each one frees up $5,000 to reinvest at whatever rate is current when it comes due.',
      },
    },
    {
      type: 'collectiontracker',
      col: 6,
      delay: 660,
      props: {
        title: 'Your vinyl collection, valued',
        icon: 'layers',
        iconColor: 'var(--presence)',
        items: [
          {
            name: 'Kind of Blue — Miles Davis, 1959 original',
            acquiredDate: 'Mar 2022',
            value: 340,
            condition: 'good',
            notes: 'Light surface noise on side A, otherwise clean.',
          },
          {
            name: 'Rumours — Fleetwood Mac',
            acquiredDate: 'Aug 2023',
            value: 45,
            condition: 'mint',
          },
          {
            name: 'The Dark Side of the Moon — first UK pressing',
            acquiredDate: 'Jan 2024',
            value: 220,
            condition: 'mint',
            notes: 'Solid blue triangle label, no barcode.',
          },
          {
            name: 'Blue Train — John Coltrane',
            acquiredDate: 'Nov 2021',
            value: 95,
            condition: 'fair',
            notes: 'Warped edge, plays fine.',
          },
          {
            name: 'Songs in the Key of Life — Stevie Wonder',
            acquiredDate: 'Jun 2024',
            value: 60,
            condition: 'good',
          },
        ],
        footer:
          'Up about $180 from last appraisal, mostly the Dark Side of the Moon pressing — that one alone doubled.',
      },
    },
    {
      type: 'cma',
      col: 12,
      delay: 720,
      props: {
        title: 'What your house would list for, today',
        icon: 'chart',
        iconColor: 'var(--presence)',
        subject: { address: '412 Larkspur Ave', beds: 3, baths: 2, sqft: 1620, yearBuilt: 1998 },
        comps: [
          {
            address: '398 Larkspur Ave',
            soldPrice: 712000,
            soldDate: 'Apr 2026',
            sqft: 1580,
            distance: 0.1,
            adjustments: [
              { label: '40 sqft smaller', amount: 8000 },
              { label: 'No garage', amount: 12000 },
            ],
          },
          {
            address: '55 Fernwood Ct',
            soldPrice: 745000,
            soldDate: 'Mar 2026',
            sqft: 1690,
            distance: 0.4,
            adjustments: [
              { label: '70 sqft larger', amount: -9000 },
              { label: 'Updated kitchen', amount: -15000 },
            ],
          },
          {
            address: '210 Larkspur Ave',
            soldPrice: 698000,
            soldDate: 'Jan 2026',
            sqft: 1600,
            distance: 0.2,
            adjustments: [{ label: 'Original bathrooms', amount: 10000 }],
          },
        ],
        suggestedListPrice: { low: 715000, high: 735000, point: 725000 },
        footer:
          'All three comps are within 0.4 miles and sold in the last five months, a tight, reliable set. 55 Fernwood pulls the range up; 210 Larkspur pulls it down.',
      },
    },
    {
      type: 'claimagecompare',
      col: 6,
      delay: 660,
      props: {
        title: 'When to claim Social Security',
        icon: 'chart',
        iconColor: 'var(--presence)',
        ages: [
          { age: 62, monthlyBenefit: 1540 },
          { age: 67, monthlyBenefit: 2200 },
          { age: 70, monthlyBenefit: 2728 },
        ],
        breakeven: {
          age: 78,
          note: 'waiting to 70 pays more in total once you live past this age',
        },
        footer:
          'Claiming at 62 gets money sooner but at a lower rate — the crossover only pays off past age 78.',
      },
    },
  ],
  proof: {
    spotId: 'subs',
    say: "Here's every recurring charge. StreamPlus is the quiet one.",
    claim: 'Subscriptions quietly grew to $214 a month',
    conf: 'strong',
    file: { label: 'Credit card.csv', type: 'csv', loc: '6 of 38 rows' },
    rows: [
      { a: 'StreamPlus', b: 'monthly · 7 mo', c: '$13.99', hot: true },
      { a: 'CloudStore 2TB', b: 'monthly', c: '$9.99' },
      { a: 'FitnessApp', b: 'monthly', c: '$19.99' },
      { a: 'NewsDaily', b: 'monthly · unused', c: '$8.00', hot: true },
      { a: 'MusicPro', b: 'monthly', c: '$10.99' },
      { a: 'GameHub', b: 'monthly · unused', c: '$14.99', hot: true },
    ],
    note: 'Mavéa flagged <mark>StreamPlus</mark> because it has billed for <mark>7 consecutive months</mark> with no matching activity in your other files.',
    assumptions: [
      '“Subscription” means a charge that repeats on a regular monthly cadence.',
      'Two months of statements are missing, so the real total may be higher.',
    ],
  },
  extras: {
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a view',
      say: 'Made you a one-pager you can share.',
      props: {
        kicker: 'YOUR MONEY · Q2 2026',
        head: 'Where your money went this quarter',
        foot: 'Made by Mavéa · from 3 of your files',
        bullets: [
          {
            color: 'var(--warning)',
            text: '<b>Spending is up 18%</b> over three months, a May travel week was the spike.',
          },
          {
            color: 'var(--warning)',
            text: '<b>$214 / month in subscriptions</b>, and 3 look forgotten: StreamPlus, NewsDaily, GameHub.',
          },
          {
            color: 'var(--insight)',
            text: '<b>Cancelling the unused 3 saves ~$430 a year</b>, you stay on track for December.',
          },
        ],
      },
    },
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll set a monthly money check-in, you confirm before it's added.",
      props: {
        eyebrow: 'Action · reminder',
        icon: 'clock',
        title: 'Schedule a monthly money check-in',
        lines: [
          { k: 'Repeats', v: 'A recurring reminder to review' },
          { k: 'Adds', v: 'One calendar event' },
        ],
        perm: 'Adds one event to your calendar. No invites are sent.',
        cta: 'Add to calendar',
        doneText: 'Added · monthly money check-in',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Title', value: 'Monthly money check-in' },
          { param: 'start', label: 'Start', value: '2026-08-01T09:00' },
          {
            param: 'notes',
            label: 'Agenda',
            value: 'Review this month’s spending and the three things to know.',
            multiline: true,
          },
        ],
      },
    },
    replay: {
      kind: 'replay',
      col: 6,
      status: 'Rendering a replay',
      say: "Here's a 20-second replay of what we found.",
      props: {},
    },
  },

  group: 'home',
  tryChip: { label: 'Where did my money go?', route: 'analyze' },
  suggests: [
    { label: 'Prove the subscriptions', icon: 'proof', route: 'prove', lead: 'Try' },
    { label: 'Make a one-pager', icon: 'slides', route: 'slide' },
    { label: 'How have I been sleeping?', icon: 'sparkle', route: 'topic:sleep' },
    { label: "How's my running going?", icon: 'chart', route: 'topic:fitness' },
    { label: 'Should I take the offer?', icon: 'layers', route: 'topic:career' },
  ],
  keywords: [
    {
      test: /money|spend|spending|budget|finance|bank|cash/,
      route: 'topic:money',
    },
  ],
};

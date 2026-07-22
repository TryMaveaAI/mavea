// symptom.ts, "My kid has a fever. What should I do?" A calm, warm walk-through for a
// worried parent (a layperson, NOT a doctor). It leads with reassurance + honesty, makes
// the escalation path unmissable (a danger callout of red flags + when to call / go to the
// ER), shows what a fever usually does over a few days (timeline), busts the old myths
// (factcheck, "feed a cold, starve a fever?"), lists comfort measures you can do tonight
// (checklist + takeaways), and is honest about its own limits (an inferred insight +
// confidencemeter) under a prominent, always-visible disclaimer banner. General info,
// never a diagnosis. Components: insight · banner · callout · kpi · timeline · ring ·
// factcheck · checklist · takeaways · faq · confidencemeter · web · sourcelist.
import type { ConversationSpec } from '../conversation';

export const symptom: ConversationSpec = {
  id: 'symptom',
  workspace: 'Family health',
  title: 'Your child has a fever, here’s what to do',
  sub: 'Calm, plain-language guidance, when to watch, comfort, and when to call.',
  opener:
    'Take a breath, most fevers are the body doing its job, and a child who is drinking, peeing, and still has moments of play is usually okay to watch at home. I’ll show you the comfort steps, and the few signs that mean call a doctor right away.',
  switchSay: 'Let’s talk through the fever.',
  gather: 'Pulling pediatric guidance · pediatrician + hospital sources',
  found: 'Here’s a calm plan: comfort first, with a clear line for when to call.',
  tint: '#f0a868',
  context: [
    { name: 'General info · not a diagnosis', color: 'var(--warning)' },
    { name: 'AAP + Mayo Clinic', color: 'var(--insight)' },
    { name: 'NHS guidance', color: 'var(--presence-soft)' },
    { name: 'For ages 3 mo+', color: 'var(--text-muted)' },
  ],
  blocks: [
    // ── prominent disclaimer, always read this first ──
    {
      type: 'banner',
      col: 12,
      delay: 0,
      props: {
        title: 'Please read first',
        tone: 'warning',
        bannerIcon: 'shield',
        iconColor: 'var(--warning)',
        message: 'I’m Mavéa, not a doctor, this is general information, <b>not a diagnosis</b>.',
        detail:
          'Use it to feel calmer and more prepared, then trust your gut. If anything worries you, call your pediatrician or a nurse line, that’s always the right move.',
        action: 'I understand',
        dismissible: false,
        footer: 'When in doubt, a real clinician who can see your child wins over any guide.',
      },
    },

    // ── opener narrative: reassurance, then an honest limit ──
    {
      type: 'insight',
      col: 7,
      id: 'reassure',
      num: '1',
      delay: 80,
      props: {
        title: 'A fever is a symptom, not the illness, and usually a sign the body is fighting',
        stat: 'Watch at home',
        delta: 'for most mild fevers',
        deltaDir: 'good',
        conf: 'strong',
        summary:
          'How your child <b>looks and acts</b> matters more than the exact number. A child who perks up when the fever eases, drinks fluids, and makes wet diapers is usually okay to care for at home.',
        sources: [{ file: 'AAP · HealthyChildren.org', loc: 'Fever and Your Child' }],
      },
    },
    {
      type: 'insight',
      col: 5,
      id: 'limits',
      num: '2',
      delay: 160,
      props: {
        title: 'I can’t see or examine your child, so treat this as a starting point',
        stat: 'General info',
        delta: 'not personal medical advice',
        deltaDir: 'down',
        conf: 'inferred',
        summary:
          'I don’t know your child’s age, history, or how they look right now. The guidance below is the common, cautious baseline, your pediatrician can tailor it.',
        sources: [{ file: 'Mavéa', loc: 'honest limits' }],
      },
    },

    // ── THE most important card: red flags / when to call / ER ──
    {
      type: 'callout',
      col: 12,
      delay: 240,
      id: 'redflags',
      props: {
        title: 'Call a doctor now, or go to the ER',
        icon: 'alert',
        iconColor: 'var(--danger)',
        tone: 'danger',
        kicker: 'Don’t wait',
        body: 'Most fevers are fine to watch, but these signs mean <b>call your pediatrician or an urgent/ER line right away</b>, whatever the thermometer says:',
        points: [
          'Any baby <b>under 3 months</b> with a temp of <b>100.4°F / 38°C</b> or higher, this is always an emergency call.',
          'Trouble breathing, lips or skin turning <b>blue or grey</b>, or a stiff neck.',
          'A rash of small purple-red spots that <b>doesn’t fade</b> when you press a glass against it.',
          'Hard to wake, limp, confused, won’t stop crying, or a <b>seizure</b>.',
          'No wet diaper or pee for <b>8+ hours</b>, no tears, or a sunken soft spot, signs of dehydration.',
          'Fever above <b>104°F / 40°C</b>, or any fever lasting more than <b>3–5 days</b>.',
        ],
        footer:
          'A seizure, blue lips, the non-fading rash, or a baby under 3 months: skip the wait, call emergency services.',
      },
    },

    // ── quick facts at a glance ──
    {
      type: 'kpi',
      col: 7,
      delay: 320,
      props: {
        title: 'Fever, by the numbers',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 4,
        kpis: [
          { val: '100.4°F', label: 'A fever starts here', color: 'var(--insight)' },
          { val: '< 3 mo', label: 'Any fever = call now', color: 'var(--danger)' },
          { val: '3–5 days', label: 'Typical length' },
          { val: '104°F', label: 'Call if above', color: 'var(--warning)' },
        ],
        footer: '100.4°F is 38°C. Numbers guide you, how your child acts matters more.',
      },
    },
    {
      type: 'ring',
      col: 5,
      delay: 400,
      props: {
        title: 'Reading the thermometer',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rings: [
          {
            pct: 0.42,
            display: '99–100.3',
            unit: '°F',
            label: 'Warm, not a fever',
            hint: 'Comfort, fluids, watch.',
            color: 'var(--presence-soft)',
          },
          {
            pct: 0.7,
            display: '100.4–104',
            unit: '°F',
            label: 'A fever',
            hint: 'Treat for comfort if they feel bad.',
            color: 'var(--warning)',
          },
          {
            pct: 1,
            display: '104+',
            unit: '°F',
            label: 'Call your doctor',
            hint: 'Especially if it won’t come down.',
            color: 'var(--danger)',
          },
        ],
        footer: 'The exact number rarely changes the plan, comfort and behavior do.',
      },
    },

    // ── what a fever usually does over days ──
    {
      type: 'timeline',
      col: 12,
      delay: 480,
      id: 'course',
      props: {
        eyebrow: 'What a typical fever does, most run their course in a few days',
        title: 'The usual arc',
        events: [
          {
            time: 'Day 1',
            title: 'It climbs and spikes',
            detail: 'Often highest in the evening. Chills, flushed cheeks, low energy are normal.',
            tag: 'expected',
            color: 'var(--warning)',
          },
          {
            time: 'Day 2–3',
            title: 'It comes and goes',
            detail: 'Rises and falls through the day. Watch how they perk up when it dips.',
            tag: 'watch',
            color: 'var(--insight)',
          },
          {
            time: 'Day 3–4',
            title: 'It starts easing',
            detail: 'Energy and appetite begin to return. Lower peaks each day is a good sign.',
            tag: 'good sign',
            color: 'var(--presence)',
          },
          {
            time: 'Day 5+',
            title: 'Still feverish? Call.',
            detail: 'A fever past 3–5 days, or that climbs again after easing, deserves a check.',
            tag: 'call',
            color: 'var(--danger)',
          },
        ],
      },
    },

    // ── comfort measures you can do tonight ──
    {
      type: 'checklist',
      col: 7,
      delay: 560,
      id: 'comfort',
      props: {
        title: 'Comfort measures for tonight',
        icon: 'check',
        iconColor: 'var(--presence)',
        rows: [
          {
            t: 'Offer small sips often, water, milk, breastmilk, or an oral rehydration drink',
            st: 'doing',
          },
          { t: 'Dress in one light layer; a too-warm room makes a fever feel worse', st: 'doing' },
          {
            t: 'Rest and cuddles, let them sleep; don’t force food, do keep fluids up',
            st: 'todo',
          },
          { t: 'A lukewarm (not cold) sponge or bath if they’re uncomfortable', st: 'todo' },
          { t: 'Check on them overnight; note the time and temp of each reading', st: 'todo' },
        ],
        footer:
          'Standard pediatric guidance (AAP, NHS), not a prescription. Goal is comfort, not chasing a “normal” number — a calm, hydrated child is the win.',
      },
    },
    {
      type: 'takeaways',
      col: 5,
      delay: 640,
      props: {
        title: 'About fever medicine',
        icon: 'shield',
        iconColor: 'var(--insight)',
        heading: 'If you choose to give it',
        items: [
          {
            text: 'Treat the <b>discomfort</b>, not the number, meds help them rest, they don’t cure the illness.',
            color: 'var(--insight)',
          },
          {
            text: 'Dose by <b>weight</b>, not age, and use the cup or syringe that came with it.',
            color: 'var(--presence)',
          },
          {
            text: '<b>Never give aspirin</b> to a child or teen, it’s linked to a rare, dangerous condition.',
            color: 'var(--danger)',
          },
          {
            text: 'Under 6 months or unsure of the dose? <b>Ask your pharmacist or doctor first.</b>',
            color: 'var(--warning)',
          },
        ],
        footer: 'I can’t recommend a specific dose, your pharmacist can, in 30 seconds.',
      },
    },

    // ── myth-busting: the old wives’ tales ──
    {
      type: 'factcheck',
      col: 12,
      delay: 720,
      id: 'myths',
      props: {
        title: 'Common fever myths, checked',
        icon: 'proof',
        iconColor: 'var(--presence-soft)',
        claims: [
          {
            claim: '“Feed a cold, starve a fever.”',
            verdict: 'false',
            confidence: 92,
            sources: ['mayoclinic.org', 'nhs.uk'],
            detail:
              'Old folklore, don’t starve anyone. Appetite often dips with a fever, and that’s fine, but <mark>fluids matter most</mark>. Offer food when they want it.',
          },
          {
            claim: 'A high fever will “fry the brain.”',
            verdict: 'false',
            confidence: 90,
            sources: ['healthychildren.org'],
            detail:
              'Fevers from ordinary infections don’t cause brain damage. The body has its own thermostat that keeps a fever from climbing dangerously on its own.',
          },
          {
            claim: 'You must wake your child to give fever medicine.',
            verdict: 'false',
            confidence: 85,
            sources: ['healthychildren.org'],
            detail:
              'Sleep is healing. If they’re resting comfortably, <mark>let them sleep</mark>, you don’t need to wake them just to dose.',
          },
          {
            claim: 'A fever that doesn’t drop with medicine means something serious.',
            verdict: 'partly',
            confidence: 70,
            sources: ['mayoclinic.org'],
            detail:
              'Medicine often only lowers a fever a degree or two, and that’s normal. It’s <mark>how your child looks</mark>, not the number, that signals when to call.',
          },
          {
            claim: 'Teething causes high fevers.',
            verdict: 'partly',
            confidence: 68,
            sources: ['nhs.uk'],
            detail:
              'Teething can nudge the temperature up slightly, but a <mark>true fever (100.4°F+)</mark> shouldn’t be blamed on teeth, look for another cause.',
          },
        ],
        footer: 'Green = clearly a myth · amber = a kernel of truth, but commonly overstated.',
      },
    },

    // ── is this a bad season? context, not a diagnosis ──
    {
      type: 'epicurve',
      col: 12,
      delay: 760,
      id: 'season',
      props: {
        title: 'Local flu + RSV activity this season',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        cases: [
          { period: 'Wk 1', count: 40, classification: 'confirmed' },
          { period: 'Wk 1', count: 22, classification: 'probable' },
          { period: 'Wk 2', count: 58, classification: 'confirmed' },
          { period: 'Wk 2', count: 30, classification: 'probable' },
          { period: 'Wk 3', count: 86, classification: 'confirmed' },
          { period: 'Wk 3', count: 34, classification: 'probable' },
          { period: 'Wk 4', count: 101, classification: 'confirmed' },
          { period: 'Wk 4', count: 28, classification: 'probable' },
          { period: 'Wk 5', count: 79, classification: 'confirmed' },
          { period: 'Wk 5', count: 21, classification: 'probable' },
          { period: 'Wk 6', count: 52, classification: 'confirmed' },
          { period: 'Wk 6', count: 15, classification: 'probable' },
        ],
        threshold: { value: 100, label: 'Elevated-activity threshold' },
        phases: [{ label: 'School break', period: 'Wk 5' }],
        footer:
          'This season peaked right at the elevated-activity line, then eased once school let out for break, a <b>typical</b> shape, not an unusual spike.',
      },
    },

    // ── how sure am I, honesty about the guidance ──
    {
      type: 'confidencemeter',
      col: 7,
      delay: 800,
      id: 'confidence',
      props: {
        title: 'How solid is this guidance?',
        icon: 'shield',
        iconColor: 'var(--insight)',
        claim: '<b>Watch most mild fevers at home; escalate on the red-flag signs above.</b>',
        overall: 88,
        segments: [
          {
            label: 'Matches major guidance',
            weight: 40,
            band: 'strong',
            basis: 'The AAP, Mayo Clinic, and NHS all give the same core advice for children.',
          },
          {
            label: 'Red-flag list is well established',
            weight: 30,
            band: 'strong',
            basis: 'The “when to call” signs are consistent across pediatric sources.',
          },
          {
            label: 'Fits your specific child',
            weight: 20,
            band: 'partial',
            basis: 'I don’t know their age, weight, or history, only your doctor can tailor it.',
          },
          {
            label: 'Replaces a real exam',
            weight: 10,
            band: 'none',
            basis: 'It can’t. Nothing here substitutes for a clinician seeing your child.',
          },
        ],
        footer:
          'High confidence in the general advice, low confidence that it fits every situation.',
      },
    },
    {
      type: 'faq',
      col: 5,
      delay: 880,
      props: {
        title: 'Quick questions parents ask',
        icon: 'chat',
        iconColor: 'var(--presence-soft)',
        defaultOpen: 0,
        items: [
          {
            q: 'Should I alternate two different fever medicines?',
            a: 'Many doctors say not to alternate on your own, it’s easy to mis-dose. Ask your pediatrician before doing it.',
            tag: 'Medicine',
          },
          {
            q: 'My child had a brief seizure with the fever. Now what?',
            a: 'A febrile seizure is frightening but usually brief and not harmful. Keep them safe on their side and <b>call your doctor</b>; call emergency services if it lasts over 5 minutes or it’s the first one.',
            tag: 'Seizure',
          },
          {
            q: 'How do I know they’re drinking enough?',
            a: 'Wet diapers or regular trips to pee, tears when crying, and a moist mouth are the green lights. Fewer of these = call.',
            tag: 'Fluids',
          },
          {
            q: 'They have a fever but seem fine otherwise?',
            a: 'That’s reassuring. A child who plays between spikes and stays hydrated is usually okay to watch at home.',
            tag: 'Behavior',
          },
        ],
        footer: 'Tap a question to expand. Still unsure? A nurse line is free and fast.',
      },
    },

    // ── trusted sources ──
    {
      type: 'web',
      col: 5,
      delay: 960,
      props: {
        title: 'Where this comes from',
        live: true,
        results: [
          {
            domain: 'healthychildren.org',
            path: ' · AAP',
            color: 'var(--insight)',
            title: 'Fever and Your Child',
            excerpt:
              'The American Academy of Pediatrics: focus on <mark>comfort and behavior</mark>, not the exact temperature.',
          },
          {
            domain: 'mayoclinic.org',
            color: 'var(--presence)',
            title: 'Fever in children, first aid',
            excerpt: 'When to seek care, and how to <mark>safely lower a fever</mark> at home.',
          },
          {
            domain: 'nhs.uk',
            color: 'var(--presence-soft)',
            title: 'High temperature (fever) in children',
            excerpt:
              'The NHS guide, including the <mark>glass test</mark> for a rash that doesn’t fade.',
          },
        ],
      },
    },
    {
      type: 'sourcelist',
      col: 7,
      delay: 1040,
      id: 'sources',
      props: {
        title: 'Sources I leaned on',
        icon: 'doc',
        iconColor: 'var(--insight)',
        sources: [
          {
            domain: 'healthychildren.org',
            titleText: 'Fever and Your Child (American Academy of Pediatrics)',
            relevance: 97,
            glyph: 'A',
            color: 'var(--insight)',
            date: 'AAP',
            snippet: 'The anchor for “treat comfort, not the number” and the under-3-months rule.',
          },
          {
            domain: 'mayoclinic.org',
            titleText: 'Fever in children: First aid & when to call',
            relevance: 94,
            glyph: 'M',
            color: 'var(--presence)',
            date: 'Mayo',
            snippet: 'Home care, safe medication principles, and escalation thresholds.',
          },
          {
            domain: 'nhs.uk',
            titleText: 'High temperature (fever) in children',
            relevance: 91,
            glyph: 'N',
            color: 'var(--presence-soft)',
            date: 'NHS',
            snippet: 'The non-fading rash glass test and dehydration warning signs.',
          },
          {
            domain: 'who.int',
            titleText: 'Managing fever and danger signs in young children',
            relevance: 82,
            glyph: 'W',
            color: 'var(--text-muted)',
            date: 'WHO',
          },
        ],
        footer:
          'Major pediatric bodies agree on the core advice, that’s why I can be calm about it.',
      },
    },

    // ── closing reassurance ──
    {
      type: 'callout',
      col: 12,
      delay: 1120,
      props: {
        title: 'You’re doing the right thing',
        icon: 'sun',
        iconColor: 'var(--presence)',
        tone: 'success',
        kicker: 'One more time',
        body: 'Comfort, fluids, rest, and a watchful eye carry most fevers through. Keep the red-flag list close, trust what you’re seeing, and <b>call your pediatrician whenever your gut says to</b>, that’s never an overreaction.',
        footer:
          'Reminder: I’m a guide, not a clinician. A real doctor who can see your child always comes first.',
      },
    },
    {
      type: 'positioncard',
      col: 6,
      delay: 760,
      props: {
        title: 'How worried should you be tonight?',
        icon: 'alert',
        levels: [
          {
            label: 'Usually fine',
            tone: 'good',
            detail:
              'Alert between spikes, drinking, wetting diapers — a fever the body is handling.',
          },
          {
            label: 'Watch closely',
            tone: 'caution',
            detail: 'Clingy and drained but still responsive; recheck in a few hours.',
          },
          {
            label: 'Call tonight',
            tone: 'bad',
            detail: 'Hard to rouse, breathing fast, or under 3 months with any fever.',
          },
        ],
        atLevel: 0,
        marker: 'From what you described',
        reason:
          'A playful-between-spikes, drinking child sits at the reassuring end — how they look matters more than the number.',
        watchFor: [
          'Under 3 months with any fever',
          'A stiff neck, a rash that does not fade under a glass, or trouble breathing',
          'No wet diaper in 8 hours, or no tears when crying',
        ],
        caveat:
          'This places the situation, it does not diagnose it — your read of your child wins.',
      },
    },
    {
      type: 'differential',
      col: 6,
      delay: 820,
      props: {
        title: 'What is usually behind a fever like this',
        icon: 'eye',
        causes: [
          {
            name: 'A common viral infection',
            likelihood: 'common',
            tell: 'Runny nose or cough, comes and goes over a few days',
            pointsAway: 'A fever lasting past day 5 with no other symptoms',
          },
          {
            name: 'Ear or throat infection',
            likelihood: 'common',
            tell: 'Tugging at an ear, pain swallowing, or fussier lying down',
            pointsAway: 'No ear or throat complaints at all',
          },
          {
            name: 'A urinary infection',
            likelihood: 'less-common',
            tell: 'Fever with no cold symptoms, especially in younger kids',
            pointsAway: 'An obvious cold already explaining it',
          },
          {
            name: 'A serious bacterial infection',
            likelihood: 'rare',
            serious: true,
            tell: 'Very drowsy, stiff neck, or a non-fading rash',
            pointsAway: 'Alert and interactive between spikes',
          },
        ],
        prompt:
          'Look for the tell-tale signs above — a cough or runny nose usually points to the common, harmless causes.',
        caveat:
          'These are possibilities with honest odds, not a diagnosis; a clinician can examine and confirm.',
      },
    },
    {
      type: 'growthcurve',
      col: 8,
      id: 'infant-weight',
      delay: 120,
      props: {
        title: 'Weight-for-age · boys, 0–12 months',
        iconColor: 'var(--presence)',
        metric: 'weight',
        unit: 'kg',
        ageUnit: 'months',
        percentiles: [
          {
            p: 3,
            points: [
              { age: 0, value: 2.5 },
              { age: 2, value: 4.4 },
              { age: 4, value: 5.6 },
              { age: 6, value: 6.4 },
              { age: 9, value: 7.1 },
              { age: 12, value: 7.7 },
            ],
          },
          {
            p: 15,
            points: [
              { age: 0, value: 2.9 },
              { age: 2, value: 5.0 },
              { age: 4, value: 6.2 },
              { age: 6, value: 7.1 },
              { age: 9, value: 7.9 },
              { age: 12, value: 8.6 },
            ],
          },
          {
            p: 50,
            points: [
              { age: 0, value: 3.3 },
              { age: 2, value: 5.6 },
              { age: 4, value: 7.0 },
              { age: 6, value: 7.9 },
              { age: 9, value: 8.9 },
              { age: 12, value: 9.6 },
            ],
          },
          {
            p: 85,
            points: [
              { age: 0, value: 3.9 },
              { age: 2, value: 6.3 },
              { age: 4, value: 7.8 },
              { age: 6, value: 8.8 },
              { age: 9, value: 9.9 },
              { age: 12, value: 10.8 },
            ],
          },
          {
            p: 97,
            points: [
              { age: 0, value: 4.4 },
              { age: 2, value: 7.0 },
              { age: 4, value: 8.6 },
              { age: 6, value: 9.7 },
              { age: 9, value: 11.0 },
              { age: 12, value: 12.0 },
            ],
          },
        ],
        plotted: [
          { age: 0, value: 3.4 },
          { age: 2, value: 5.7 },
          { age: 4, value: 7.1 },
          { age: 6, value: 8.0 },
          { age: 9, value: 9.0 },
          { age: 12, value: 9.7 },
        ],
        caption:
          'Every measurement lands right on the 50th-percentile curve — steady tracking along one band, not the absolute number, is what reassures.',
      },
    },
    {
      type: 'painscale',
      col: 6,
      id: 'pain-faces',
      delay: 1200,
      props: {
        title: 'How bad is the pain right now?',
        icon: 'sparkle',
        iconColor: 'var(--warning)',
        kind: 'faces',
        value: 6,
        caption: 'Moderate — interferes with focus',
        anchors: ['No pain', 'Worst imaginable'],
        footer: 'Six or higher is worth flagging to a clinician if it persists past a few days.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll add the first overnight temperature check to your calendar.",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'clock',
        title: 'Add the first overnight check, in 4 hours',
        lines: [
          { k: 'Adds', v: 'One event · first of 3 checks, every 4 hours' },
          { k: 'To', v: 'Your personal calendar' },
        ],
        perm: 'Adds one event to your calendar. No invites are sent.',
        cta: 'Add reminder',
        doneText: 'Added the first check-in, repeat every 4 hours',
        mcpId: 'calendar.addEvent',
        fields: [
          {
            param: 'title',
            label: 'Event title',
            value: 'Check temperature · overnight fever watch',
          },
          { param: 'start', label: 'Start', value: '2026-06-12T23:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '10' },
          {
            param: 'notes',
            label: 'Notes',
            value: 'First of 3 checks, every 4 hours through the night.',
          },
        ],
      },
    },
    slide: {
      kind: 'slide',
      col: 6,
      status: 'Building a one-pager',
      say: 'Here’s a fridge-friendly one-pager you can keep handy.',
      props: {
        kicker: 'FEVER · QUICK REFERENCE',
        head: 'Comfort first, and the signs that mean call now',
        foot: 'Made by Mavéa · general info, not a diagnosis',
        bullets: [
          {
            color: 'var(--presence)',
            text: '<b>Watch at home</b> if they drink, pee, and perk up between spikes.',
          },
          {
            color: 'var(--warning)',
            text: '<b>Treat for comfort</b>, fluids, light layers, rest; dose meds by weight.',
          },
          {
            color: 'var(--danger)',
            text: '<b>Call now</b>: baby under 3 mo, trouble breathing, non-fading rash, hard to wake, or fever past 3–5 days.',
          },
        ],
      },
    },
  },

  group: 'health',
  tryChip: { label: 'My kid has a fever, what do I do?', route: 'topic:symptom' },
  suggests: [
    {
      label: 'When should I call the doctor?',
      icon: 'alert',
      route: 'symptom:redflags',
      lead: 'Try',
    },
    { label: 'How sure are you about this?', icon: 'shield', route: 'symptom:confidence' },
    { label: 'Make me a fridge one-pager', icon: 'slides', route: 'slide' },
    { label: 'Set the first check-in reminder', icon: 'clock', route: 'send' },
    { label: 'Help me sleep better tonight', icon: 'moon', route: 'topic:sleep' },
  ],
  intents: {
    redflags: {
      kind: 'spotlight',
      spotId: 'redflags',
      say: 'Here are the signs that mean call a doctor right away.',
    },
    course: {
      kind: 'spotlight',
      spotId: 'course',
      say: 'And here’s what a fever usually does over a few days.',
    },
    myths: {
      kind: 'spotlight',
      spotId: 'myths',
      say: 'Let me clear up a few common myths, too.',
    },
    confidence: {
      kind: 'spotlight',
      spotId: 'confidence',
      say: 'Here’s how solid this guidance is, and where it can’t replace your doctor.',
    },
  },
  keywords: [
    {
      test: /fever|temperature|my (kid|child|baby|son|daughter|toddler) (has|is)|feverish|high temp|sick (kid|child|baby)|febrile/i,
      route: 'topic:symptom',
      sub: [
        {
          test: /when (to|should).*(call|doctor|er|hospital)|red flag|emergency|worried|serious|dangerous/i,
          route: 'symptom:redflags',
        },
        {
          test: /how (sure|confident|reliable)|trust|accurate|certain/i,
          route: 'symptom:confidence',
        },
      ],
    },
  ],
};

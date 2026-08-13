// "Help me write and communicate", email drafts, chat threads, dialogues, text variants,
// poems, presentation outlines, and a news draft in inverted-pyramid structure. Exercises
// the full compose family plus docs' storystructure for journalism-style writing.
import type { ConversationSpec } from '../conversation';

export const compose: ConversationSpec = {
  id: 'compose',
  workspace: 'Write with me',
  title: 'Help me write and communicate',
  sub: "From a quick email to a keynote outline, I'll shape the words.",
  opener: "Here's the email draft, adjust the tone chip to swap formality, then copy it.",
  switchSay: "Let's write something together.",
  tint: '#8b7cf8',
  context: [
    { name: 'Email · to Sarah', color: 'var(--presence-soft)' },
    { name: 'Tone · friendly', color: 'var(--insight)' },
    { name: 'Chat example', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'messagedraft',
      col: 8,
      delay: 0,
      props: {
        title: 'Draft Email',
        icon: 'mail',
        iconColor: 'var(--presence)',
        subject: 'Following up on the project timeline',
        to: 'Sarah Chen <sarah@example.com>',
        from: 'Alex',
        greeting: 'Hi Sarah,',
        body: "I wanted to follow up on our conversation from last Tuesday. We're making good progress on the timeline, but I'd love to sync before Thursday's review. Would a 30-minute call on Wednesday afternoon work for you?\n\nI'll have the updated milestones ready by then, should only take a few minutes to walk through.",
        closing: 'Thanks so much,',
        signature: 'Alex',
        tone: 'friendly',
        footer: 'Adjust the subject or tone before sending.',
      },
    },
    {
      type: 'chatthread',
      col: 8,
      delay: 120,
      props: {
        title: 'Example Chat',
        icon: 'chat',
        iconColor: 'var(--insight)',
        participants: 'You + Support',
        messages: [
          {
            role: 'other',
            name: 'Support',
            text: 'Hi! How can I help you today?',
            time: '10:30 AM',
          },
          {
            role: 'user',
            name: 'You',
            text: "I'm having trouble resetting my password, the link in the email expired.",
            time: '10:31 AM',
          },
          {
            role: 'other',
            name: 'Support',
            text: "No problem! I'll send a new reset link to your registered email right now. It'll be valid for 24 hours.",
            time: '10:31 AM',
            status: 'read',
          },
          {
            role: 'user',
            name: 'You',
            text: 'Got it, thank you!',
            time: '10:33 AM',
          },
        ],
        footer: 'Example support thread, adapt for your own context.',
      },
    },
    {
      type: 'dialogue',
      col: 12,
      delay: 200,
      props: {
        title: 'Interview Script',
        icon: 'chat',
        iconColor: 'var(--presence)',
        context: 'Mock job interview for a senior product manager role.',
        lines: [
          {
            speaker: 'Interviewer',
            text: 'Tell me about a product decision you made with incomplete data. How did you approach it?',
          },
          {
            speaker: 'Candidate',
            text: 'At my last role we had to decide whether to rebuild our checkout flow before Black Friday, three weeks out. We had mixed signals from A/B tests. I triangulated: qualitative user sessions, a competitor teardown, and gut-checked with our top customers. We shipped a targeted fix rather than a full rebuild.',
            note: 'Strong: shows structured thinking under pressure.',
          },
          {
            speaker: 'Interviewer',
            text: 'What would you have done differently with more time?',
          },
          {
            speaker: 'Candidate',
            text: "I would have run the full cohort analysis we skipped. We got lucky, the fix held, but I'd rather not rely on luck for revenue-critical paths.",
          },
        ],
        footer: 'Use this as a practice script, the interviewer lines are yours to adapt.',
      },
    },
    {
      type: 'variants',
      col: 10,
      delay: 280,
      props: {
        title: 'Tone Variants',
        icon: 'layers',
        iconColor: 'var(--insight)',
        prompt: 'Rewrite: "We need this fixed ASAP."',
        variants: [
          {
            label: 'Professional',
            text: 'This issue is blocking our release, prioritizing a fix by end of day would be greatly appreciated.',
          },
          {
            label: 'Direct',
            text: 'This is blocking us. Please fix it today.',
          },
          {
            label: 'Collaborative',
            text: "We're a bit stuck on this one, any chance we can tackle it together this afternoon?",
            note: 'Good for teammates you know well.',
          },
        ],
        footer: 'Pick the tone that fits the relationship.',
      },
    },
    {
      type: 'verse',
      col: 6,
      delay: 360,
      props: {
        title: 'Haiku',
        icon: 'spark',
        iconColor: 'var(--presence)',
        form: 'Haiku',
        stanzas: [
          {
            lines: [
              { text: 'Morning fog lifts slow,' },
              { text: 'the harbor fills with birdsong, ' },
              { text: 'coffee, then the code.' },
            ],
          },
        ],
        footer: '5–7–5. A small thing.',
      },
    },
    {
      type: 'slidedeck',
      col: 10,
      delay: 440,
      props: {
        title: 'Presentation Outline',
        icon: 'layers',
        iconColor: 'var(--insight)',
        deck: 'Q3 Product Review',
        slides: [
          {
            title: 'Q3 in Three Numbers',
            layout: 'title',
            bullets: ['42% DAU growth', '$1.2M ARR milestone hit', 'NPS +18 points'],
            note: 'Open strong, lead with the wins before the challenges.',
          },
          {
            title: 'What Worked',
            layout: 'content',
            bullets: [
              'Search redesign drove 3× session depth',
              'Onboarding wizard cut time-to-value by 40%',
              'Mobile app launch: 28K installs in 4 weeks',
            ],
          },
          {
            title: 'What We Learned',
            layout: 'content',
            bullets: [
              'Notifications fatigue: unsubscribes spiked in week 3',
              'Power users wanted API access, we shipped it too late',
            ],
            note: 'Be honest here, credibility moment.',
          },
          {
            title: 'Q4 Bets',
            layout: 'content',
            bullets: [
              'AI-assisted search (2 sprints)',
              'Enterprise SSO (compliance gate)',
              'Team collaboration features (waitlist: 1,800)',
            ],
          },
          {
            title: 'Ask',
            layout: 'title',
            bullets: ['Approve $280K additional headcount (2 engineers)', 'Extend runway to Q2'],
            note: 'Make the ask explicit and specific.',
          },
        ],
        footer: 'Add your own data before presenting.',
      },
    },
    {
      type: 'screenplay',
      col: 8,
      id: 'compose-screenplay',
      delay: 240,
      props: {
        title: 'Scene — The Last Train',
        icon: 'doc',
        iconColor: 'var(--presence)',
        caption: 'A short night-platform scene: two strangers, one departing train.',
        elements: [
          { kind: 'slug', text: 'INT. SUBWAY PLATFORM - NIGHT' },
          {
            kind: 'action',
            text: 'Fluorescent light hums over an empty platform. MAYA (30s), coat buttoned to the chin, watches the departure board flicker. A man, ELLIOT (40s), steps from the shadows of the far stairwell, out of breath.',
          },
          { kind: 'character', text: 'Elliot' },
          { kind: 'parenthetical', text: 'Still catching his breath' },
          { kind: 'dialogue', text: 'Did the 11:48 leave already?' },
          { kind: 'character', text: 'Maya' },
          {
            kind: 'dialogue',
            text: 'Thirty seconds ago. You can still see the tail lights if you lean out far enough to regret it.',
          },
          { kind: 'action', text: 'Elliot lets his shoulders drop. He almost laughs.' },
          { kind: 'transition', text: 'CUT TO:' },
        ],
        footer:
          'Standard screenplay margins applied automatically — adjust the dialogue and let the format follow.',
      },
    },
    {
      type: 'socialpost',
      col: 6,
      delay: 520,
      props: {
        title: 'Post Preview',
        icon: 'globe',
        iconColor: 'var(--presence)',
        platform: 'x',
        handle: 'alexrivera',
        displayName: 'Alex Rivera',
        timestamp: '2h',
        body: 'Shipped the new onboarding flow today, three months of user interviews boiled down to four screens instead of eleven. Early numbers are already trending up, and none of it would have happened without the design and support teams grinding through QA all week.',
        media: [{ alt: 'Before/after screenshot of the onboarding flow' }],
        footer: 'Trim a sentence if you want room for a reply-friendly line.',
      },
    },
    {
      type: 'storystructure',
      col: 8,
      delay: 600,
      props: {
        title: 'Draft: council approves bridge funding',
        icon: 'doc',
        iconColor: 'var(--presence)',
        lede: 'The City Council voted 5-2 Tuesday night to approve $12 million in emergency funding for a new pedestrian bridge over Route 9, after two years of delay following a fatal crossing accident.',
        nutGraf:
          'The vote ends a contentious two-year debate that pitted residents demanding safer crossings against a council wary of the price tag. Construction is expected to begin next spring and finish by 2028, funded largely by a state safety grant secured last month.',
        body: [
          'Council member Elena Vasquez, who sponsored the funding measure, said the vote “finally puts safety ahead of cost” after years of near-misses at the intersection.',
          'The bridge will connect the Riverside neighborhood to the transit hub on the north side of Route 9, a stretch pedestrians currently cross at grade despite a 45 mph speed limit.',
          'Two council members who voted no, Raymond Chu and Priya Patel, said they support the bridge in principle but wanted a competitive bid process before locking in a contractor.',
          "Construction is slated to begin in April, with the city's public works department targeting a completion date in late 2027.",
        ],
        background: [
          'The push for a bridge gained urgency after a cyclist was struck and killed at the intersection in March 2025, prompting a petition that collected more than 3,000 signatures.',
          'The city considered a traffic-light-only fix in 2023 but shelved it after a traffic study found it would only reduce, not eliminate, the crossing risk.',
          "The $12 million project includes an $8 million state Safe Streets grant awarded last month, with the remaining $4 million drawn from the city's capital reserve fund.",
        ],
        wordCount: 179,
        wordCountBudget: 250,
        footer:
          'Inverted pyramid: the vote and its stakes lead, the who-said-what follows, history stays below the fold.',
      },
    },
    {
      type: 'ideaboard',
      col: 8,
      delay: 680,
      props: {
        title: 'Name Ideas',
        icon: 'sparkle',
        iconColor: 'var(--insight)',
        ask: 'Name the newsletter — a weekly note about running small internet projects.',
        ideas: [
          {
            angle: 'Plain and clear',
            label: 'The Weekly Build',
            note: 'Says exactly what it is; nobody has to guess.',
          },
          {
            angle: 'Plain and clear',
            label: 'Small Projects',
            note: 'Boring on purpose, and it ages well.',
          },
          {
            angle: 'Plain and clear',
            label: 'Ship Notes',
            note: 'Short enough to survive a screenshot.',
          },
          {
            angle: 'With some edge',
            label: 'Nothing Scales',
            note: 'A wink at the advice everyone gives you.',
          },
          {
            angle: 'With some edge',
            label: 'Unfinished',
            note: 'Honest about what a side project actually is.',
          },
          {
            angle: 'With some edge',
            label: 'Quietly Shipping',
            note: 'Owns the lack of a launch announcement.',
          },
          {
            angle: 'Left-field',
            label: 'Tuesday Is a Verb',
            note: 'Odd enough that people ask what it means.',
          },
          {
            angle: 'Left-field',
            label: 'The Long Tail Café',
            note: 'Warm, a little silly, hard to forget.',
          },
          {
            angle: 'Left-field',
            label: 'Room 204',
            note: 'Means nothing yet — that is the point.',
          },
          {
            angle: 'Left-field',
            label: 'Marginalia',
            note: 'For readers who like footnotes more than headlines.',
          },
        ],
        footer: 'Nothing here is ranked. Read across the angles first, then narrow.',
      },
    },
    {
      type: 'longread',
      col: 7,
      delay: 760,
      props: {
        title: 'Blog Post Draft',
        icon: 'edit',
        iconColor: 'var(--presence)',
        standfirst:
          'A year ago I sent the first issue to fifty-three people, most of whom I had met in person. Last Tuesday it went to 4,100. Here is the honest version of what happened in between, not the growth-hacking version.',
        readingTime: 2,
        copySections: true,
        sections: [
          {
            heading: 'The first fifty were friends',
            paragraphs: [
              'For the first three months, nothing I did mattered much. I wrote on Sunday nights, published on Monday mornings, and watched the subscriber count move by two or three a week. The people opening it were people who would have opened anything I sent them, which is a lovely thing and a useless signal. I kept a spreadsheet anyway, because the alternative was admitting I had no idea whether any of it was working.',
              'What that stretch bought me was a voice. By issue twelve I had stopped writing like someone auditioning for a job and started writing like someone talking to a friend on a train. Nobody subscribed because of that change — it is invisible from the outside — but almost everyone who has arrived since has stayed because of it, and I do not think the rest of the year happens without those quiet twelve weeks.',
            ],
          },
          {
            heading: 'What actually moved the needle',
            paragraphs: [
              'Three things, in order of how uncomfortable they were: writing about one narrow subject instead of five interesting ones, sending on a schedule I could survive rather than one that looked impressive, and asking once, in plain language, for readers to forward the issue to a single person who would like it.',
              'The forward request was worth more than everything else combined. It added about nine hundred subscribers over six weeks, and every one of them arrived already trusting whoever sent it to them, which is an introduction no ad can buy. I tried paid acquisition twice, spent four hundred dollars, and got sixty subscribers, a third of whom were gone inside a month.',
            ],
          },
          {
            heading: "What I'd do differently",
            paragraphs: [
              'I would start the public archive on day one. For eight months the back issues lived only in inboxes, which meant a year of writing was invisible to anyone who found me later: no search results, nothing to send a friend, nothing for a new reader to judge me by. Moving it to a plain page doubled the traffic within a month and cost me one afternoon.',
              'And I would have written less. The issues people quote back to me are the short ones — six hundred words, one idea, no preamble. The two-thousand-word essays I was proudest of are the ones nobody finished, and I can see it in the scroll map: attention falls off a cliff two screens in. That is a hard lesson to accept and an easy one to act on, which is the best kind.',
            ],
          },
        ],
        footer:
          'Copy one section or take the whole piece — no filename, no page numbers, just the writing.',
      },
    },
    {
      type: 'variantswitch',
      col: 8,
      delay: 840,
      props: {
        title: 'Same news, three temperatures',
        icon: 'sliders',
        iconColor: 'var(--insight)',
        accent: 'var(--insight)',
        axis: 'Tone',
        subject: 'Telling a client the launch slips two weeks.',
        defaultVariant: 1,
        variants: [
          {
            label: 'Warm',
            icon: 'chat',
            when: 'A long relationship you would rather protect than win.',
            paragraphs: [
              'I wanted to get ahead of this rather than let it surprise you: the launch is going to land two weeks later than we planned, on the 24th.',
              'The short version is that the migration turned up far more legacy data than the audit found, and rushing it is the one thing that would make this worse instead of better.',
              "I'll send the revised plan tomorrow morning, and I'm happy to walk you through it whenever suits.",
            ],
          },
          {
            label: 'Neutral',
            when: 'The default — clear, unhedged, no temperature either way.',
            paragraphs: [
              'The launch date moves from the 10th to the 24th.',
              'The migration surfaced about 40% more legacy records than the audit projected, and validating them properly takes two weeks.',
              'A revised plan follows tomorrow. Nothing else in the scope changes.',
            ],
          },
          {
            label: 'Firm',
            icon: 'alert',
            when: 'The date has already slipped once and the reset has to stick.',
            paragraphs: [
              'The launch moves to the 24th, and that date is now fixed.',
              'The migration carries 40% more legacy records than the audit we were handed, and we will not ship unvalidated customer data to meet a calendar.',
              'The revised plan lands tomorrow. If the 24th does not work, the conversation we need is about scope, not about the date.',
            ],
          },
        ],
        footer: 'Same facts in all three — only the temperature moves.',
      },
    },
  ],
  proof: null,
  extras: {},
  group: 'home',
  suggests: [
    { label: 'Write a follow-up email', icon: 'mail', route: 'topic:compose' },
    { label: 'Make it more formal', icon: 'layers', route: 'topic:compose' },
    { label: "What's on my schedule?", icon: 'clock', route: 'topic:week' },
  ],
  keywords: [
    {
      test: /\bwrite\b|\bdraft\b|\bcompose\b|\bslide(s|deck)?\b|\bpoem\b|\blyrics?\b|\bverse\b|\bchat\b/,
      route: 'topic:compose',
    },
  ],
};

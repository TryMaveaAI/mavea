// screenshot.ts, "What does this screenshot mean?" (content.md §2.6).
// New spec. Components: InsightCard + ListCard + BreakdownCard + ActionCard.
// The understand-a-screenshot case (an unexpected bank hold notice). proof: null (image is the only source).
import type { ConversationSpec } from '../conversation';

export const screenshot: ConversationSpec = {
  id: 'screenshot',
  workspace: 'Screenshot',
  title: 'What that screenshot means',
  sub: 'A hold on a pending charge, not a lost payment.',
  opener: "It's a hold on a pending charge, not a lost payment. Here's what it actually says.",
  switchSay: "Let's figure out what that screenshot is telling you.",
  tint: '#4fc3e8',
  context: [
    { name: 'Screenshot.png', color: 'var(--insight)' },
    { name: 'Your account', color: 'var(--presence-soft)' },
    { name: 'Plain English', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'mean',
      num: '1',
      delay: 0,
      props: {
        title: "It's a temporary hold, not a charge",
        stat: '$84.50',
        delta: 'pending',
        deltaDir: 'up',
        conf: 'strong',
        summary: 'A merchant reserved the amount; it usually clears or drops in a few days.',
        sources: [{ file: 'Screenshot.png' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'who',
      num: '2',
      delay: 90,
      props: {
        title: "It's your hotel pre-authorization",
        conf: 'partial',
        summary: 'The merchant code matches the Lisbon hotel from your trip files.',
        sources: [{ file: 'Screenshot.png', loc: 'merchant line' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'do',
      num: '3',
      delay: 180,
      props: {
        title: 'Nothing to do unless it sticks',
        conf: 'inferred',
        summary: "If it's still 'pending' after 7 days, that's when to call.",
        sources: [{ file: 'Your account' }],
      },
    },
    {
      type: 'breakdown',
      col: 4,
      delay: 260,
      props: {
        title: 'What the screen shows',
        icon: 'table',
        rows: [
          { name: 'Amount', val: '$84.50', pct: 100 },
          { name: 'Status', val: 'Pending', pct: 60, tag: 'temporary', tagColor: 'var(--insight)' },
          { name: 'Merchant', val: 'Hotel · Lisbon', pct: 45 },
          { name: 'Date', val: '3 days ago', pct: 30 },
        ],
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 320,
      props: {
        title: 'The hold, at a glance',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        cols: 3,
        kpis: [
          { val: '$84.50', label: 'Amount held' },
          { val: 'Pending', label: 'Status', color: 'var(--insight)' },
          { val: '3 days', label: 'In so far', color: 'var(--text-muted)' },
        ],
        footer: 'Day 3 of a typical 3–7 day window, still well inside normal.',
      },
    },
    {
      type: 'timeline',
      col: 7,
      delay: 380,
      props: {
        eyebrow: 'What happens next, typically',
        events: [
          {
            time: 'Day 0',
            title: 'Hold placed',
            detail: 'Hotel reserved $84.50 against your card.',
            color: 'var(--text-muted)',
          },
          {
            time: 'Today',
            title: 'Still pending',
            tag: 'day 3',
            detail: 'Normal, nothing to do yet.',
            color: 'var(--insight)',
          },
          {
            time: 'Day 3–7',
            title: 'Usually clears or drops',
            detail: 'It either posts as a real charge or falls off.',
            color: 'var(--presence)',
          },
          {
            time: 'After day 7',
            title: 'Call the bank',
            tag: 'only if it lingers',
            detail: "If it's still pending past a week, that's the signal.",
            color: 'var(--warning)',
          },
        ],
      },
    },
    {
      type: 'list',
      col: 5,
      delay: 440,
      props: {
        title: 'In plain words',
        icon: 'check',
        items: [
          'A hold ≠ a final charge',
          "It's tied to your Lisbon hotel",
          'It typically releases in 3–7 days',
          'Only call the bank if it lingers past a week',
        ],
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Setting it up',
      say: "I'll add a calendar reminder to check back in 7 days.",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'bell',
        title: 'Add a reminder to check this in 7 days',
        lines: [
          { k: 'Adds', v: 'One event · 7 days from now' },
          { k: 'Does', v: 'Nudges you to see if the hold cleared' },
        ],
        perm: 'Adds one event to your calendar. Mavéa never contacts your bank for you.',
        cta: 'Add reminder',
        doneText: 'Added a reminder for 7 days from now',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Event title', value: 'Check the Lisbon hotel hold cleared' },
          { param: 'start', label: 'Start', value: '2026-06-19T09:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '15' },
        ],
      },
    },
  },

  group: 'docs',
  suggests: [
    { label: 'Who is it from?', icon: 'layers', route: 'screenshot:who', lead: 'Try' },
    { label: 'Remind me in a week', icon: 'bell', route: 'screenshot:action' },
    { label: 'Did my lease change?', icon: 'layers', route: 'topic:lease' },
    { label: 'Back to my money', icon: 'chart', route: 'topic:money' },
  ],
  intents: {
    who: {
      kind: 'spotlight',
      spotId: 'who',
      say: "It's a pre-authorization from your Lisbon hotel, the merchant code lines up with your trip files.",
    },
    action: { kind: 'build', key: 'action' },
  },
  keywords: [
    {
      // word-boundary anchored so 'pending' never substring-matches 's-pending' etc.
      test: /\bscreenshot\b|screen shot|\b(pending|hold)\b|what does this|what is this|charge.*mean/,
      route: 'topic:screenshot',
      sub: [
        { test: /\b(who|from|merchant)\b/, route: 'screenshot:who' },
        { test: /\bremind\b|check later/, route: 'screenshot:action' },
      ],
    },
  ],
};

// "Your Kyoto trip, mapped", five days for $2,400: the bookings, the route, the budget split, and crowd-beating tips.
import type { ConversationSpec } from '../conversation';

export const travel: ConversationSpec = {
  id: 'travel',
  workspace: 'Kyoto trip',
  title: 'Your Kyoto trip, mapped',
  sub: 'Five days, $2,400 all in, built around the temples.',
  opener: 'Five days in Kyoto for $2,400. Start the big sights early and you beat every crowd.',
  switchSay: "Let's plan Kyoto.",
  gather: 'Reading your flights + notes',
  found: "A plan that flows, here's the shape of it.",
  tint: '#ff9a6b',
  context: [
    { name: 'Flights.pdf', color: 'var(--presence-soft)' },
    { name: 'Kyoto notes', color: 'var(--insight)' },
    { name: 'Budget · $2,400', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'kpi',
      col: 5,
      delay: 0,
      props: {
        title: 'The trip at a glance',
        icon: 'spark',
        iconColor: 'var(--insight)',
        cols: 3,
        kpis: [
          { val: 'Kyoto', label: 'Destination' },
          { val: 'Apr 12–16', label: 'Dates', color: 'var(--insight)' },
          { val: '$2,400', label: 'All in', color: 'var(--insight)' },
        ],
        footer: 'Five days, nonstop both ways, walkable base in Gion.',
      },
    },
    {
      type: 'list',
      col: 7,
      delay: 90,
      props: {
        title: 'What I booked you toward',
        icon: 'check',
        iconColor: 'var(--presence-soft)',
        items: [
          '<b>ANA · nonstop</b>, 11h 20m · $910 (a 1-stop saver is available)',
          '<b>Machiya townhouse</b> · Gion, 4.8★ · walkable · $140/nt',
          'An ICOCA transit card for every bus and train',
          'One kaiseki dinner in Gion, reserve a week ahead',
        ],
      },
    },
    {
      type: 'geomap',
      col: 8,
      delay: 180,
      props: {
        title: 'Your Kyoto, mapped',
        icon: 'share',
        markers: [
          {
            lat: 35.0037,
            lng: 135.7788,
            name: 'Gion, your townhouse',
            detail: 'Your stay',
            color: 'var(--presence)',
          },
          {
            lat: 34.9671,
            lng: 135.7727,
            name: 'Fushimi Inari',
            detail: 'Day 2',
            color: 'var(--warning)',
          },
          {
            lat: 35.005,
            lng: 135.7649,
            name: 'Nishiki Market',
            detail: 'Day 2',
            color: 'var(--insight)',
          },
          {
            lat: 35.0094,
            lng: 135.6722,
            name: 'Arashiyama',
            detail: 'Day 3',
            color: 'var(--insight)',
          },
        ],
        footer: 'Gion is central, most days start and end within a short walk.',
      },
    },
    {
      type: 'donut',
      col: 4,
      delay: 260,
      props: {
        title: 'Where the budget goes',
        icon: 'chart',
        iconColor: 'var(--presence-soft)',
        rows: [
          { label: 'Flights', pct: 42, color: 'var(--presence)' },
          { label: 'Hotel', pct: 28, color: 'var(--presence-soft)' },
          { label: 'Food', pct: 18, color: 'var(--warning)' },
          { label: 'Activities', pct: 12, color: 'var(--insight)' },
        ],
        footer: 'Flights are the big line, the rest is comfortably flexible.',
      },
    },
    {
      type: 'timeline',
      col: 12,
      delay: 320,
      id: 'plan',
      props: {
        eyebrow: 'Five days, mapped to the light',
        events: [
          {
            time: 'Day 1',
            title: 'Arrive + Gion stroll',
            detail: 'Higashiyama lanes at dusk, ease in.',
            color: 'var(--presence)',
          },
          {
            time: 'Day 2',
            title: 'Fushimi Inari + Nishiki',
            tag: 'start early',
            detail: 'Beat the crowds at the torii gates, then the market.',
            color: 'var(--warning)',
          },
          {
            time: 'Day 3',
            title: 'Arashiyama day-trip',
            detail: 'Bamboo grove + monkey park.',
            color: 'var(--insight)',
          },
          {
            time: 'Day 4',
            title: 'Temples + tea',
            detail: 'Kinkaku-ji, then Ryoan-ji.',
            color: 'var(--insight)',
          },
          {
            time: 'Day 5',
            title: 'Market + fly home',
            detail: 'Last bowl of ramen.',
            color: 'var(--presence)',
          },
        ],
      },
    },
    {
      type: 'gallery',
      col: 7,
      delay: 400,
      props: {
        eyebrow: 'Photos · from the web',
        items: [
          {
            label: 'Fushimi Inari at dawn',
            source: 'japan-guide.com',
            tag: 'go early',
            h1: '#c0392b',
            h2: '#5e1f18',
          },
          {
            label: 'Arashiyama bamboo grove',
            source: 'lonelyplanet.com',
            h1: '#3e8a5a',
            h2: '#1c4430',
          },
          { label: 'Gion lanterns at dusk', source: 'timeout.com', h1: '#c9a24a', h2: '#4a3c1e' },
          {
            label: 'Kinkaku-ji, the gold pavilion',
            source: 'tripadvisor.com',
            h1: '#e0b65e',
            h2: '#6e4f24',
          },
        ],
        footer: 'Tap any photo to add it to your trip notes.',
      },
    },
    {
      type: 'web',
      col: 5,
      delay: 460,
      props: {
        title: 'Tips Mavéa pulled',
        live: true,
        results: [
          {
            domain: 'reddit.com',
            path: ' · r/JapanTravel',
            color: 'var(--warning)',
            title: 'Beat the crowds at Fushimi Inari',
            excerpt:
              'Arrive <mark>before 8am</mark>, the torii gates are nearly empty and the light is best.',
          },
          {
            domain: 'japan-guide.com',
            color: 'var(--insight)',
            title: 'Grab an ICOCA transit card',
            excerpt:
              'Tap-to-ride every bus and train; top it up at any <mark>station kiosk</mark> in seconds.',
          },
          {
            domain: 'tabelog.com',
            color: 'var(--presence)',
            title: 'Book one kaiseki in Gion',
            excerpt: 'Reserve <mark>a week ahead</mark>, seasonal courses, about ¥6,000.',
          },
        ],
      },
    },
    {
      type: 'maproute',
      col: 10,
      id: 'walk',
      delay: 280,
      props: {
        title: 'Old Town to the Castle — a walking morning',
        icon: 'walk',
        iconColor: 'var(--presence)',
        waypoints: [
          {
            lat: 50.0875,
            lng: 14.4213,
            label: 'Old Town Square',
            leg: 'Start · coffee under the Astronomical Clock',
          },
          {
            lat: 50.0865,
            lng: 14.4137,
            label: 'Charles Bridge',
            leg: '0.6 km · 9 min · cross before the crowds',
          },
          {
            lat: 50.0903,
            lng: 14.4006,
            label: 'Prague Castle gate',
            leg: '1.4 km · 24 min · the uphill stretch',
          },
          {
            lat: 50.0909,
            lng: 14.4009,
            label: 'St. Vitus Cathedral',
            leg: '0.2 km · 4 min · finish inside the courtyard',
          },
        ],
        distanceKm: 2.2,
        elevationGainM: 96,
        caption: 'A flat riverside start, then one steady climb to the castle district.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll add the five days to your calendar.",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'clock',
        title: 'Add the Kyoto trip to your calendar',
        lines: [
          { k: 'Adds', v: '1 event · Apr 12–16' },
          { k: 'To', v: 'Your personal calendar' },
        ],
        perm: 'Mavéa will create 1 event spanning the trip. Nothing is shared with anyone.',
        cta: 'Add to calendar',
        doneText: 'Added Apr 12–16 to your calendar',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Event title', value: 'Kyoto trip' },
          { param: 'start', label: 'Start', value: '2026-04-12T10:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '5760' },
          {
            param: 'notes',
            label: 'Notes',
            value:
              'ANA nonstop both ways, Machiya townhouse in Gion, ICOCA card, one kaiseki dinner.',
          },
        ],
      },
    },
  },

  group: 'home',
  tryChip: { label: 'Plan my Kyoto trip', route: 'topic:travel' },
  suggests: [
    { label: 'Add it to my calendar', icon: 'check', route: 'send', lead: 'Try' },
    { label: 'Plan my Lisbon weekend', icon: 'share', route: 'topic:trip' },
    { label: "How's my running going?", icon: 'chart', route: 'topic:fitness' },
    { label: "What's my week look like?", icon: 'clock', route: 'topic:week' },
  ],
  keywords: [
    {
      test: /kyoto|japan|tokyo|temple|five.?day|5.?day/,
      route: 'topic:travel',
    },
  ],
};

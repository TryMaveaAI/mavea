// "Your Lisbon weekend", three walkable days built around what's booked, with the Sintra train and the map to match.
import type { ConversationSpec } from '../conversation';

export const trip: ConversationSpec = {
  id: 'trip',
  workspace: 'Lisbon weekend',
  title: 'Your Lisbon weekend',
  sub: "Three days, built around what's already booked.",
  opener: "Lisbon in three days, here's a plan that flows.",
  switchSay: "Love it, let's plan Lisbon.",
  tint: '#ff9a6b',
  context: [
    { name: 'Flights.pdf', color: 'var(--presence-soft)' },
    { name: 'Hotel booking.pdf', color: 'var(--danger)' },
    { name: 'Lisbon notes', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'shape',
      num: '1',
      delay: 0,
      props: {
        title: 'Three days, mostly walkable',
        stat: '3 days',
        conf: 'strong',
        summary: 'Your hotel in Baixa is about 10 minutes from most of your stops.',
        sources: [{ file: 'Hotel.pdf' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'sintra',
      num: '2',
      delay: 90,
      props: {
        title: 'Book the Sintra train now',
        conf: 'partial',
        summary: 'Saturday trains sell out, reserve the 9:10 to be safe.',
        sources: [{ file: 'Lisbon notes' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'weather',
      num: '3',
      delay: 180,
      props: {
        title: 'Clear skies all weekend',
        stat: '21°',
        delta: 'sunny',
        deltaDir: 'good',
        conf: 'inferred',
        summary: 'Pack light layers, one evening dips to about 14°.',
        sources: [{ file: 'Weather' }],
      },
    },
    {
      type: 'geomap',
      col: 8,
      delay: 260,
      props: {
        title: 'Your Lisbon, mapped',
        icon: 'share',
        markers: [
          {
            lat: 38.7139,
            lng: -9.1335,
            name: 'Alfama + Castelo',
            detail: 'Friday-evening sunset wander',
            color: 'var(--presence)',
          },
          {
            lat: 38.711,
            lng: -9.1393,
            name: 'Hotel · Baixa',
            detail: 'Your central base',
            color: 'var(--text-muted)',
          },
          {
            lat: 38.6916,
            lng: -9.216,
            name: 'Belém + pastéis',
            detail: 'Sunday morning by the river',
            color: 'var(--insight)',
          },
          {
            lat: 38.7876,
            lng: -9.3905,
            name: 'Pena Palace, Sintra',
            detail: 'Saturday day trip',
            color: 'var(--warning)',
          },
        ],
        footer: 'Everything but Sintra is a short walk from your hotel, tap a pin to open it.',
      },
    },
    {
      type: 'list',
      col: 4,
      delay: 320,
      props: {
        title: "Don't forget",
        icon: 'check',
        items: [
          'Passport + EU adapter',
          'Comfortable walking shoes',
          'Reserve the Sintra train (Sat)',
          'Some cash for small tascas',
        ],
      },
    },
    {
      type: 'timeline',
      col: 12,
      delay: 380,
      id: 'plan',
      props: {
        eyebrow: 'Your itinerary',
        events: [
          {
            time: 'Fri · evening',
            title: 'Land + wander Alfama',
            detail: 'Drop bags, dinner at a tasca, sunset at Portas do Sol.',
            color: 'var(--presence)',
          },
          {
            time: 'Sat · all day',
            title: 'Sintra day trip',
            tag: 'book the 9:10',
            detail: 'Pena Palace, Quinta da Regaleira, back in the city by 6.',
            color: 'var(--warning)',
          },
          {
            time: 'Sun · morning',
            title: 'Belém + pastéis',
            detail: 'The tower, the monastery, and the original custard tarts.',
            color: 'var(--insight)',
          },
        ],
      },
    },
    {
      type: 'gallery',
      col: 7,
      delay: 440,
      props: {
        eyebrow: 'Photos · from the web',
        items: [
          {
            label: 'Pena Palace, Sintra',
            source: 'wikimedia',
            tag: 'must-see',
            h1: '#c47e3a',
            h2: '#5e3b1e',
          },
          { label: 'Tram 28, Alfama', source: 'unsplash', h1: '#c9a24a', h2: '#4a3c1e' },
          { label: 'Belém Tower', source: 'unsplash', h1: '#6f93c4', h2: '#26354f' },
          { label: 'Pastéis de Belém', source: 'unsplash', h1: '#e0b65e', h2: '#6e4f24' },
        ],
        footer: 'Tap any photo to add it to your trip notes.',
      },
    },
    {
      type: 'web',
      col: 5,
      delay: 500,
      props: {
        title: 'Pulled for Saturday',
        live: true,
        results: [
          {
            domain: 'cp.pt',
            path: ' · trains',
            color: 'var(--insight)',
            title: 'Lisbon → Sintra · 9:10 train',
            excerpt:
              'Runs every 30 min from Rossio. <mark>Saturdays sell out by mid-morning</mark>, buy ahead.',
          },
          {
            domain: 'parquesdesintra.pt',
            color: 'var(--insight)',
            title: 'Pena Palace tickets',
            excerpt: 'Timed entry. Book the <mark>10:30 slot</mark> to beat the tour buses.',
          },
        ],
      },
    },
    {
      type: 'packlist',
      col: 6,
      id: 'trip-packlist',
      delay: 720,
      props: {
        title: 'Packing checklist',
        icon: 'check',
        context: '3 days · mild, light rain',
        groups: [
          {
            name: 'Clothes',
            items: [
              { label: 'T-shirts', count: 3, packed: true },
              { label: 'Jeans', count: 1, packed: true },
              { label: 'Light rain jacket', count: 1, packed: false },
              { label: 'Socks', count: 4, packed: true },
              { label: 'Underwear', count: 4, packed: false },
            ],
          },
          {
            name: 'Toiletries',
            items: [
              { label: 'Toothbrush', count: 1, packed: true },
              { label: 'Travel toothpaste', count: 1, packed: false },
              { label: 'Deodorant', count: 1, packed: true },
            ],
          },
          {
            name: 'Tech',
            items: [
              { label: 'Phone charger', count: 1, packed: true },
              { label: 'Power bank', count: 1, packed: false },
              { label: 'EU travel adapter', count: 1, packed: false },
            ],
          },
        ],
      },
    },
    {
      type: 'weathernow',
      col: 6,
      id: 'trip-weathernow',
      delay: 780,
      props: {
        title: 'Lisbon right now',
        icon: 'sun',
        iconColor: 'var(--warning)',
        location: 'Lisbon, Portugal',
        tempF: 70,
        feelsLikeF: 69,
        condition: 'Partly cloudy',
        hi: 74,
        lo: 61,
        asOf: '2:14 PM local time',
        hourly: [
          { time: 'Now', tempF: 70, icon: 'sun', precipPct: 0 },
          { time: '3 PM', tempF: 71, icon: 'sun', precipPct: 0 },
          { time: '4 PM', tempF: 70, icon: 'cloud', precipPct: 10 },
          { time: '5 PM', tempF: 68, icon: 'cloud', precipPct: 20 },
          { time: '6 PM', tempF: 65, icon: 'rain', precipPct: 40 },
          { time: '7 PM', tempF: 63, icon: 'rain', precipPct: 30 },
        ],
        tiles: [
          { label: 'UV Index', value: '6 of 10', icon: 'sun' },
          { label: 'Wind', value: '9 mph W', icon: 'wind' },
          { label: 'Humidity', value: '58%', icon: 'cloud' },
        ],
      },
    },
    {
      type: 'pictogramchart',
      col: 6,
      id: 'trip-pictogram',
      delay: 810,
      props: {
        title: 'Lisbon in June, typical days',
        icon: 'sun',
        iconColor: 'var(--warning)',
        unitValue: 1,
        categories: [
          { label: 'Sunny', count: 18, icon: 'sun', color: 'var(--warning)' },
          { label: 'Partly cloudy', count: 8, icon: 'cloud', color: 'var(--presence-soft)' },
          { label: 'Rainy', count: 4, icon: 'rain', color: 'var(--presence)' },
        ],
        footer:
          'Pack for sun with a light layer for the evenings, rain gear is a backup, not the plan.',
      },
    },
    {
      type: 'menucard',
      col: 6,
      id: 'trip-menucard',
      delay: 840,
      props: {
        title: 'Dinner reservation, Saturday night',
        icon: 'sparkle',
        iconColor: 'var(--presence)',
        venue: 'Taberna Riverside',
        subtitle: 'Tasting menu · Baixa waterfront',
        sections: [
          {
            name: 'Starters',
            items: [
              {
                name: 'Bacalhau croquettes',
                price: '€8',
                desc: 'Salt cod, potato, parsley aioli',
              },
              { name: 'Grilled octopus', price: '€14', tags: ['gluten-free'] },
            ],
          },
          {
            name: 'Mains',
            items: [
              {
                name: 'Cataplana de marisco',
                price: '€26',
                desc: 'Shellfish stew, tomato, coriander',
              },
              {
                name: 'Wild mushroom risotto',
                price: '€19',
                tags: ['vegetarian'],
              },
            ],
          },
          {
            name: 'Dessert',
            items: [{ name: 'Pastel de nata, two ways', price: '€6' }],
          },
        ],
        footer: 'Reservation for two at 8:30 PM — mention the window table when you arrive.',
      },
    },
  ],
  proof: null,
  extras: {
    action: {
      kind: 'action',
      col: 6,
      status: 'Preparing',
      say: "I'll add the three days to your calendar.",
      props: {
        eyebrow: 'Action · calendar',
        icon: 'clock',
        title: 'Add the weekend to your calendar',
        lines: [
          { k: 'Adds', v: '1 event · Friday to Sunday' },
          { k: 'To', v: 'Your personal calendar' },
        ],
        perm: 'Mavéa will create 1 event spanning the weekend. Nothing is shared with anyone.',
        cta: 'Add to calendar',
        doneText: 'Added Fri–Sun to your calendar',
        mcpId: 'calendar.addEvent',
        fields: [
          { param: 'title', label: 'Event title', value: 'Lisbon weekend' },
          { param: 'start', label: 'Start', value: '2026-06-12T17:00:00' },
          { param: 'durationMin', label: 'Duration (min)', value: '3120' },
          {
            param: 'notes',
            label: 'Notes',
            value: 'Fri: Alfama. Sat: Sintra day trip, 9:10 train. Sun: Belém + pastéis.',
          },
        ],
      },
    },
  },

  group: 'home',
  tryChip: { label: 'Plan my Lisbon weekend', route: 'topic:trip' },
  suggests: [
    { label: "What's Saturday?", icon: 'clock', route: 'trip:sintra', lead: 'Try' },
    { label: 'Add it to my calendar', icon: 'check', route: 'trip:calendar' },
    { label: "What's for dinner tonight?", icon: 'table', route: 'topic:meal' },
    { label: "How's my running?", icon: 'chart', route: 'topic:fitness' },
  ],
  intents: {
    sintra: {
      kind: 'spotlight',
      spotId: 'sintra',
      say: "Saturday's the big one, Sintra. Reserve the 9:10 train.",
    },
    calendar: { kind: 'build', key: 'action' },
  },
  keywords: [
    {
      test: /lisbon|trip|travel|vacation|holiday|itinerary/,
      route: 'topic:trip',
      sub: [
        { test: /calendar|add it|add them|schedule|book all/, route: 'trip:calendar' },
        { test: /saturday|sintra|which day|what.*day/, route: 'trip:sintra' },
      ],
    },
  ],
};

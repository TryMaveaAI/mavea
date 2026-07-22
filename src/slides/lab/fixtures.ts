// The two decks #/slidelab exercises every skin against — factored out of SlidesLab so a headless
// driver (scripts/slide-gate.mts) builds the exact same decks a human clicking through the lab
// would see.
//   • buildDeck — one representative deck that hits every real slide layout, including a figure.
//   • buildTortureDeck — every slot at its worst-case length, every list at its item cap.
import type { Block } from '../../data/conversation';
import type { ExportMeta, Section } from '../../export/model/ExportDoc';
import { composeSlides } from '../model/compose';
import type { Slide } from '../model/Slide';

const META: ExportMeta = {
  title: 'The State of Urban Mobility',
  sub: 'A field study across twelve cities',
  topic: 'Strategy',
  sources: [{ name: 'City Atlas' }, { name: 'Transit Authority' }, { name: 'OECD' }],
  generatedAt: 1_700_000_000_000,
};

let n = 0;
const sec = <K extends Section['kind']>(
  kind: K,
  data: Extract<Section, { kind: K }>['data'],
  source = 0,
  lead = false,
): Section => ({ kind, id: `lab-${n++}`, source, lead, data }) as Section;

/** A figure section from a real embeddable block — exercises the full-fidelity figure slide. */
const fig = (
  block: Record<string, unknown>,
  embed: 'fluid' | 'flow',
  heading?: string,
  caption?: string,
): Section => sec('figure', { block: block as unknown as Block, embed, heading, caption });

const REP: Section[] = [
  sec('findingCallout', {
    num: '01',
    conf: 'Inferred',
    title: 'Density drives ridership',
    summary:
      'The densest quartile of neighbourhoods generated 58% of all transit trips, concentrating demand where service is cheapest to run.',
  }),
  sec('metricTiles', {
    heading: 'At a glance',
    tiles: [
      { value: '2.4M', label: 'daily riders' },
      { value: '92%', label: 'on-time' },
      { value: '$1.10', label: 'avg fare' },
      { value: '48', label: 'lines' },
    ],
  }),
  sec('figureGrid', {
    heading: 'Ridership by corridor',
    caption: 'Share of weekday trips',
    cells: [
      { title: 'North Line', pct: 1, value: '100%' },
      { title: 'Harbor Loop', pct: 0.72, value: '72%' },
      { title: 'Airport Express', pct: 0.54, value: '54%' },
      { title: 'Cross-town', pct: 0.38, value: '38%' },
    ],
  }),
  fig(
    {
      type: 'sankey',
      props: {
        title: 'Mode-share flow',
        unit: 'k',
        nodes: [
          { id: 'all', label: 'All trips', layer: 0 },
          { id: 'rail', label: 'Rail', layer: 1 },
          { id: 'bus', label: 'Bus', layer: 1 },
          { id: 'walk', label: 'Walk', layer: 1 },
          { id: 'cbd', label: 'Downtown', layer: 2 },
          { id: 'local', label: 'Local', layer: 2 },
        ],
        links: [
          { source: 'all', target: 'rail', value: 52 },
          { source: 'all', target: 'bus', value: 31 },
          { source: 'all', target: 'walk', value: 17 },
          { source: 'rail', target: 'cbd', value: 40 },
          { source: 'rail', target: 'local', value: 12 },
          { source: 'bus', target: 'cbd', value: 18 },
          { source: 'bus', target: 'local', value: 13 },
        ],
      },
    },
    'fluid',
    'How trips move through the network',
    'Weekday mode share, in thousands.',
  ),
  fig(
    {
      type: 'statemachine',
      props: {
        title: 'Fare-gate states',
        states: [
          { id: 'idle', label: 'Idle', start: true },
          { id: 'tapped', label: 'Tapped' },
          { id: 'open', label: 'Open' },
          { id: 'done', label: 'Cleared', final: true },
        ],
        transitions: [
          { from: 'idle', to: 'tapped', label: 'tap' },
          { from: 'tapped', to: 'open', label: 'valid' },
          { from: 'tapped', to: 'idle', label: 'invalid' },
          { from: 'open', to: 'done', label: 'pass' },
          { from: 'done', to: 'idle', label: 'reset' },
        ],
      },
    },
    'fluid',
    'The fare gate, as a state machine',
  ),
  sec('distributionBars', {
    heading: 'Where the budget goes',
    total: '$1.2B',
    bars: [
      { label: 'Operations', pct: 0.46, value: '46%' },
      { label: 'Capital', pct: 0.31, value: '31%' },
      { label: 'Maintenance', pct: 0.23, value: '23%' },
    ],
    note: 'Fiscal year 2026.',
  }),
  sec('rankedList', {
    heading: 'Busiest stations',
    items: [
      { name: 'Union Central', meta: '112k / day' },
      { name: 'Harbor Gate', meta: '88k / day' },
      { name: 'Market Square', meta: '74k / day' },
      { name: 'Airport T2', meta: '61k / day' },
      { name: 'Old Mill', meta: '52k / day' },
    ],
  }),
  sec('ratingMatrix', {
    heading: 'Build vs. expand',
    columns: ['Build new line', 'Expand bus rapid transit'],
    rows: [
      { label: 'Upfront cost', values: ['$900M', '$240M'] },
      { label: 'Time to launch', values: ['6 years', '18 months'] },
      { label: 'Daily capacity', values: ['180k', '120k'] },
      { label: 'Flexibility', values: ['Low', 'High'] },
    ],
  }),
  sec('ratingMatrix', {
    heading: 'Corridor scorecard',
    scale: 3,
    columns: ['Demand', 'Cost', 'Equity'],
    rows: [
      { label: 'North Line', values: [3, 2, 3] },
      { label: 'Harbor Loop', values: [2, 3, 2] },
      { label: 'Cross-town', values: [3, 1, 3] },
    ],
  }),
  sec('checklist', {
    heading: 'Readiness checklist',
    items: [
      { title: 'Secure right-of-way', status: 'done' },
      { title: 'Community review', status: 'done' },
      { title: 'Procure rolling stock', status: 'doing' },
      { title: 'Operator training', status: 'todo' },
    ],
  }),
  sec('verticalTimeline', {
    heading: 'Rollout',
    events: [
      { marker: 'Q1', title: 'Groundbreaking', body: 'Three corridors begin.' },
      { marker: 'Q2', title: 'Track laid', body: 'Northern segment complete.' },
      { marker: 'Q3', title: 'Testing', body: 'Signal + safety trials.' },
      { marker: 'Q4', title: 'Service opens', body: 'Public launch.' },
    ],
  }),
  sec('numberedMilestones', {
    heading: 'How a line gets built',
    items: [
      { title: 'Plan', body: 'Model demand and route.' },
      { title: 'Fund', body: 'Bond + federal match.' },
      { title: 'Build', body: 'Civil works and track.' },
      { title: 'Operate', body: 'Run and refine.' },
    ],
  }),
  sec('specTable', {
    heading: 'Fares by zone',
    columns: ['Zone', 'Peak', 'Off-peak', 'Monthly'],
    rows: [
      ['Inner', '$1.10', '$0.90', '$48'],
      ['Middle', '$1.80', '$1.40', '$72'],
      ['Outer', '$2.60', '$2.00', '$96'],
    ],
  }),
  sec('spotlightCard', {
    label: 'The takeaway',
    title:
      'Frequency is the network. Riders show up when the wait is short enough to stop checking the schedule.',
    body: 'Transit Authority, 2026',
  }),
  sec('prose', {
    heading: 'Why frequency wins',
    body: 'When headways drop below ten minutes, riders stop planning around the timetable and simply show up — the turn-up-and-go threshold. Crossing it on a corridor lifts ridership more than any single capital project, because it changes how people think about the trip, not just how fast it is.',
  }),
  sec('prose', { body: 'A city moves at the speed of its slowest necessary trip.' }),
  // A second answer → exercises the section divider.
  sec('prose', { heading: 'Funding the plan', body: 'How the region pays for it.' }, 1, true),
  sec(
    'metricTiles',
    {
      heading: 'The ask',
      tiles: [
        { value: '$1.2B', label: 'total programme' },
        { value: '40%', label: 'federal match' },
        { value: '12 yr', label: 'bond term' },
      ],
    },
    1,
  ),
];

// Bundled placeholders keep the slide QA deterministic/offline while still clearing the same
// same-origin media boundary as production content (data: image payloads are intentionally denied).
const IMG = '/demo-assets/images/slide-placeholder.svg';

// A near-white placeholder for the torture deck's full-bleed slide — the worst case for the hero
// scrim, exercising white-on-light-photo legibility without pixel-sampling the (real) image.
const LIGHT_IMG = '/demo-assets/images/slide-placeholder-light.svg';

export function buildDeck(): Slide[] {
  const base = composeSlides(REP, META);
  const media: Slide[] = [
    {
      kind: 'teamGrid',
      id: 'lab-team',
      source: 0,
      kicker: 'Team',
      data: {
        title: 'The study team',
        members: [
          {
            name: 'Ada Vance',
            role: 'Lead',
            bio: 'Mobility strategy and demand modelling.',
            img: IMG,
          },
          { name: 'Ravi Menon', role: 'Data', bio: 'Ridership and equity analysis.', img: IMG },
          {
            name: 'Lena Ortiz',
            role: 'Field',
            bio: 'Twelve-city interviews and counts.',
            img: IMG,
          },
          { name: 'Sam Cole', role: 'Policy', bio: 'Funding and procurement.', img: IMG },
        ],
      },
    },
    {
      kind: 'fullBleed',
      id: 'lab-full',
      source: 0,
      kicker: 'In the field',
      data: { img: IMG, title: 'Twelve cities, one question' },
    },
  ];
  // Insert the media slides just before the closing slide.
  return [...base.slice(0, -1), ...media, base[base.length - 1]];
}

// ── Torture deck — every slot at its worst-case length, every list at its item cap ──────────────
const rep = (s: string, times: number): string => Array.from({ length: times }, () => s).join(' ');
const LIPSUM =
  'Across the twelve study cities the pattern repeated with remarkable consistency, and the implication for planners is both unambiguous and uncomfortable: ';

export function buildTortureDeck(): Slide[] {
  let k = 0;
  const t = <K extends Section['kind']>(
    kind: K,
    data: Extract<Section, { kind: K }>['data'],
    source = 0,
    lead = false,
  ): Section => ({ kind, id: `tort-${k++}`, source, lead, data }) as Section;
  const meta: ExportMeta = {
    title:
      'An Exhaustive and Deliberately Overlong Title About the Comprehensive State of Urban Mobility Across Continents',
    sub: 'A multi-year, multi-city field study whose subtitle also runs uncomfortably long to test the cover and closing slides under pressure',
    topic: 'Strategy and Long-Range Regional Transportation Planning',
    sources: [
      { name: 'City Atlas' },
      { name: 'Transit Authority' },
      { name: 'OECD' },
      { name: 'National Bureau' },
      { name: 'Regional Council' },
      { name: 'Field Notes' },
    ],
    generatedAt: 1_700_000_000_000,
  };
  const sections: Section[] = [
    t('findingCallout', {
      num: '01',
      conf: 'Inferred',
      title:
        'Density is destiny, but only when frequency, reliability and fare policy all align at once',
      summary: rep(LIPSUM, 8),
    }),
    t('metricTiles', {
      heading: 'Seven metrics that will not fit a hero figure and must fall back to a table',
      tiles: Array.from({ length: 7 }, (_, i) => ({
        value: `$${(i + 1) * 137},${i}00,000`,
        label: `An unusually long metric label number ${i + 1} that should ellipsize`,
      })),
    }),
    t('metricTiles', {
      heading: 'A single enormous figure',
      tiles: [
        {
          value: '$1,284,000,000,000',
          label: 'cumulative regional investment required over the planning horizon',
        },
        {
          value: '99.97%',
          label: 'an overlong supporting statistic label that must truncate cleanly',
        },
        {
          value: '40 years',
          label: 'another long supporting label to fill the right column fully',
        },
        {
          value: '12,500 km',
          label: 'a fourth supporting figure with a wordy descriptor attached',
        },
      ],
    }),
    t('figureGrid', {
      heading: 'Eight corridors with verbose names',
      caption: rep('Share of weekday trips measured across the study period.', 3),
      cells: Array.from({ length: 8 }, (_, i) => ({
        title: `Corridor number ${i + 1} with a deliberately long descriptive name`,
        pct: 1 - i * 0.1,
        value: `${100 - i * 9}% of weekday`,
      })),
    }),
    t('rankedList', {
      heading: 'Six busiest stations, each with a long name and metadata',
      items: Array.from({ length: 6 }, (_, i) => ({
        name: `Station number ${i + 1} with an extremely long official name that should clamp to two lines`,
        meta: `${112 - i * 9}k riders / day`,
      })),
    }),
    t('ratingMatrix', {
      heading: 'Build versus expand, seven rows of long labels',
      columns: [
        'Build an entirely new heavy-rail line',
        'Expand the existing bus rapid transit network',
      ],
      rows: Array.from({ length: 7 }, (_, i) => ({
        label: `Decision criterion ${i + 1} described at uncomfortable length for testing`,
        values: [`$${900 - i * 80}M upfront`, `${18 + i} months to launch`],
      })),
    }),
    t('specTable', {
      heading: 'A wide seven-column fare table',
      columns: ['Zone', 'Peak', 'Off-peak', 'Weekend', 'Monthly', 'Annual', 'Concession'],
      rows: Array.from({ length: 7 }, (_, i) => [
        `Zone ${i + 1}`,
        `$${1 + i}.10`,
        `$${1 + i}.90`,
        `$${i}.80`,
        `$${48 + i * 12}`,
        `$${480 + i * 120}`,
        `$${24 + i * 6}`,
      ]),
    }),
    t('checklist', {
      heading: 'Five readiness steps with long bodies',
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `Readiness step number ${i + 1} with a long title`,
        body: rep(
          'This step has a long explanatory body to stress the five-column process layout.',
          2,
        ),
        status: (i === 0 ? 'done' : i === 1 ? 'doing' : 'todo') as 'done' | 'doing' | 'todo',
      })),
    }),
    t('verticalTimeline', {
      heading: 'Five rollout phases with long bodies',
      events: Array.from({ length: 5 }, (_, i) => ({
        marker: `Quarter ${i + 1}`,
        title: `Phase ${i + 1} with a fairly long title that may wrap`,
        body: rep('A long phase description to stress the roadmap column.', 2),
      })),
    }),
    t('spotlightCard', {
      label: 'The single most important takeaway from the entire study',
      title: rep('Frequency is the network and reliability is the promise.', 4),
      body: 'Transit Authority, Office of Long-Range Planning, 2026',
    }),
    t('prose', {
      heading: 'An overlong heading that should shrink and clamp on the prose slide',
      body: rep(LIPSUM, 18),
    }),
  ];
  const base = composeSlides(sections, meta);
  const media: Slide[] = [
    {
      kind: 'teamGrid',
      id: 'tort-team',
      source: 0,
      kicker: 'Team',
      data: {
        title: 'The study team, with no photographs to test the monogram fallback',
        members: Array.from({ length: 4 }, (_, i) => ({
          name: `Researcher Number ${i + 1} With A Long Name`,
          role: `An overlong role title ${i + 1}`,
          bio: rep('A long biography that should clamp to a few lines per card.', 2),
        })),
      },
    },
    {
      kind: 'fullBleed',
      id: 'tort-full',
      source: 0,
      kicker: 'In the field',
      // Deliberately light: torture-tests the scrim against a photo that offers no natural
      // darkness of its own, the case that used to wash out the title.
      data: {
        img: LIGHT_IMG,
        title: rep('Twelve cities and one stubbornly persistent question.', 3),
      },
    },
  ];
  return [...base.slice(0, -1), ...media, base[base.length - 1]];
}

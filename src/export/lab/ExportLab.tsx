// #/exportlab — a QA gallery for the DOCUMENT skins, the counterpart to #/slidelab. It lays out one
// representative document that exercises every section archetype (plus a deliberately-overflowing
// stress block), then renders it in any of the ten print skins so fit/overflow and per-skin fidelity
// can be checked at a glance, and exported through the real PDF pipeline. A dev tool, not shipped UI.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ensureFigureReady } from '../../canvas/embed';
import type { Block } from '../../data/conversation';
import { nextFrame } from '../../lib/nextFrame';
import type { ExportDoc, ExportMeta, Section, SourceMeta } from '../model/ExportDoc';
import { pageSize, PAGE_W, type PageFormat } from '../paginate/geometry';
import { numberSections, pdfProperties } from '../model/normalize';
import { layoutDoc } from '../render/buildDoc';
import { ExportDocView } from '../render/ExportDoc';
import { SKINS, SKIN_ORDER } from '../skins/registry';
import type { SkinId } from '../skins/types';
import { auditDoc, type ExportAuditFailure } from './audit';

const META: ExportMeta = {
  title: 'The State of Urban Mobility',
  sub: 'A field study across twelve cities',
  topic: 'Strategy',
  sources: [{ name: 'City Atlas' }, { name: 'Transit Authority' }, { name: 'OECD', url: '#' }],
  generatedAt: 1_700_000_000_000,
};

// The torture preset's own source list: enough entries to clear the sources-appendix threshold,
// including one with a real, `safeHttpUrl`-passing address — the only way to see the appendix's
// live-link row (and linkLayer.ts's PDF annotation over it) rendered in the lab instead of only in
// a unit test's mocked jsPDF.
const TORTURE_SOURCES: SourceMeta[] = [
  { name: 'City Atlas' },
  { name: 'Transit Authority' },
  {
    name: 'OECD Transport Outlook 2025',
    url: 'https://www.oecd.org/en/publications/oecd-transport-outlook-2025',
  },
  { name: 'Federal Transit Administration' },
  { name: 'Bureau of Transportation Statistics' },
];

function metaFor(stress: boolean): ExportMeta {
  return stress ? { ...META, sources: TORTURE_SOURCES } : META;
}

// A several-thousand-character paragraph — the torture preset's stress case for the prose splitter
// (splitProse in paginate/split.ts), which must break it cleanly across a page boundary and carry
// the remainder as a `cont` fragment rather than silently clipping it against the page's bottom edge.
const LONG_PROSE =
  'Frequency reads as an operating detail until you look at what riders actually do once headways ' +
  'cross a threshold. Below roughly twelve minutes between trains, people plan around a schedule: ' +
  'they check a departure time, pad the walk to the platform, and count a missed train as a real ' +
  'cost against their day. Above that threshold, the same riders stop checking almost entirely — ' +
  'the wait itself becomes short enough that showing up unplanned costs less than looking anything ' +
  'up, and the corridor starts to behave less like a timetable and more like a tap. That shift shows ' +
  'up everywhere in the twelve-city sample: ridership per revenue-hour rises fastest not when a line ' +
  'gets faster or longer, but when it crosses from an every-twenty-minutes service into an ' +
  'every-eight-minutes one, even holding speed and coverage constant. It is the single strongest ' +
  'predictor in the dataset, ahead of density, ahead of fare, ahead of parking supply near the station.\n\n' +
  'The practical difficulty is that frequency is also the most expensive lever to pull, because it ' +
  'is priced in operating dollars — drivers, power, maintenance cycles — rather than the one-time ' +
  'capital dollars that dominate a typical transit budget conversation. A new line is a ' +
  'ribbon-cutting; a frequency upgrade is a recurring line item a board has to defend every single ' +
  'budget cycle, with no photograph to show for it. That asymmetry pushes agencies toward capital ' +
  'projects even when the frequency upgrade would move more riders per dollar, because the capital ' +
  'project is visible and the operating commitment is not. Several cities in this sample built ' +
  'exactly that mistake into their long-range plans: a new rail extension penciled out at roughly ' +
  'four times the cost per new daily rider of simply running the existing bus network every seven ' +
  'minutes instead of every fifteen along its busiest corridors.\n\n' +
  'Equity follows the same frequency logic, for a different reason. Riders with a car have an exit ' +
  'option — a bad headway just pushes them to drive — so a low-frequency line quietly self-selects ' +
  'for riders with no alternative, and its ridership numbers end up looking stable even as service ' +
  'quality erodes, because the people who could have left already did. That stability is often read ' +
  'internally as evidence the line does not need investment, when it is closer to evidence the line ' +
  'has already lost every rider capable of leaving. The corridors that scored highest on the equity ' +
  'index in this study were, without exception, also the highest-frequency corridors in their city; ' +
  'no low-frequency corridor scored above the regional median.\n\n' +
  'None of this argues against capital investment — a corridor that has hit its frequency ceiling on ' +
  'existing infrastructure genuinely needs more track or more lanes, and no amount of scheduling ' +
  'cleverness fixes a signal system that cannot safely run trains closer together. But it does argue ' +
  'for sequencing: fund the frequency increase on corridors that can already support it before ' +
  'committing to the next expansion, because the frequency dollar is cheaper, faster to deliver, and ' +
  "— on this sample's evidence — more reliably converts into new riders than the next mile of track " +
  'does. A board that wants a ribbon to cut will resist that sequencing every time; a board that ' +
  'wants to move the most people per dollar spent will not.';

/** A long, realistic deploy/test session — the torture preset's figure stress case. `terminal` is
 *  a FLOW-class embed (embedClass.ts: family 'code'), so its frame gets no height cap and the
 *  paginator must measure its true, un-shrunk height and split it across pages like any other
 *  over-tall section — the "eighty-plus line code listing" the audit exists to prove doesn't clip. */
function buildTortureTerminalBlock(): Record<string, unknown> {
  const routes = [
    'North Line',
    'Harbor Loop',
    'Airport Express',
    'Cross-town',
    'Riverside',
    'Old Port',
    'Stadium Shuttle',
    'Uptown Local',
    'Market Express',
    'Canal Line',
  ];
  const lines: { kind: string; text: string }[] = [
    { kind: 'command', text: 'pnpm test:routes --all --verbose' },
  ];
  for (let i = 0; i < 50; i += 1) {
    const route = routes[i % routes.length];
    lines.push({
      kind: 'stdout',
      text: `✓ ${route} #${i + 1} — schedule integrity check passed (${120 + i * 3}ms)`,
    });
  }
  lines.push(
    { kind: 'command', text: 'pnpm build:gtfs && pnpm deploy --env prod' },
    { kind: 'stdout', text: 'building GTFS feed for 48 routes…' },
    { kind: 'stdout', text: 'validating shape geometry against right-of-way survey…' },
    { kind: 'stdout', text: 'compiling fare rules for 3 zones × 2 fare periods…' },
    { kind: 'stdout', text: 'packaging static feed — 4.8 MB, 48 routes, 812 stops' },
    { kind: 'stdout', text: 'uploaded feed · invalidated CDN · warmed realtime cache' },
  );
  for (let i = 0; i < 26; i += 1) {
    const route = routes[i % routes.length];
    lines.push({
      kind: 'stdout',
      text: `deployed ${route} to us-east-1, eu-west-1 (region ${i + 1}/24)`,
    });
  }
  lines.push(
    { kind: 'comment', text: '# live in us-east, eu-west — rollback window closes in 30 minutes' },
    { kind: 'stdout', text: 'all health checks green · p99 latency 84ms' },
  );
  return {
    type: 'terminal',
    props: {
      title: 'Full network deploy',
      prompt: '~/transit %',
      lines,
      exitCode: 0,
      caption: 'Every route validated and redeployed in one run.',
    },
  };
}

let n = 0;
const sec = <K extends Section['kind']>(
  kind: K,
  data: Extract<Section, { kind: K }>['data'],
  source = 0,
  lead = false,
): Section => ({ kind, id: `lab-${n++}`, source, lead, data }) as Section;

/** A figure section from a real embeddable block — exercises the full-fidelity figure path. */
const fig = (
  block: Record<string, unknown>,
  embed: 'fluid' | 'flow',
  heading?: string,
  caption?: string,
): Section => sec('figure', { block: block as unknown as Block, embed, heading, caption });

/** Real embeddable blocks, one per fit class — rendered as their actual components in the document. */
const FIGURE_BLOCKS = {
  sankey: {
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
  statemachine: {
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
  terminal: {
    type: 'terminal',
    props: {
      title: 'Deploy check',
      prompt: '~/transit %',
      lines: [
        { kind: 'command', text: 'pnpm build && pnpm deploy --env prod' },
        { kind: 'stdout', text: 'building 48 routes…' },
        { kind: 'stdout', text: 'uploaded 2.4 MB · invalidated CDN' },
        { kind: 'comment', text: '# live in us-east, eu-west' },
      ],
      exitCode: 0,
      caption: 'Green across both regions.',
    },
  },
  geomap: {
    type: 'geomap',
    props: {
      title: 'Where the new lines run',
      zoom: 11,
      markers: [
        { name: 'Union Central', lat: 41.8789, lng: -87.6359, detail: 'Hub · 112k/day' },
        { name: 'Harbor Gate', lat: 41.8919, lng: -87.6051 },
        { name: 'Market Square', lat: 41.8675, lng: -87.6243 },
        { name: 'Airport T2', lat: 41.9742, lng: -87.9073 },
      ],
    },
  },
} as const;

/** A representative document: every archetype once, then a stress block that forces a page split. */
function repSections(stress: boolean): Section[] {
  n = 0;
  const base: Section[] = [
    sec('findingCallout', {
      conf: 'Inferred',
      title: 'Density drives ridership',
      summary:
        'The densest quartile of neighbourhoods generated 58% of all transit trips, concentrating demand where service is cheapest to run.',
    }),
    // Exercises the Contents renderer (contents.tsx) — including its FitLine-shrunk title, forced
    // to shrink hard by an entry long enough that its natural width blows well past the dotted
    // leader row's available space.
    sec('contents', {
      heading: 'Contents',
      items: [
        { title: 'Executive summary', page: 1 },
        {
          title:
            'How density and frequency interact across twelve metro systems, and what that implies for where to invest next',
          page: 1,
        },
        { title: 'Funding the plan', page: 2 },
        { title: 'Appendix — sources', page: 2 },
      ],
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
    sec('figureGrid', {
      heading: 'Revenue trend',
      caption: 'Quarterly farebox revenue, in $M.',
      chart: {
        labels: ['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25'],
        series: [
          { name: 'Actual', data: [12.5, 13.2, 12.1, 14.8, 15.6, 16.9] },
          { name: 'Forecast', data: [12, 13, 13.5, 14, 15, 16] },
        ],
        unit: 'M',
      },
      cells: [{ title: 'Latest quarter', value: '$16.9M', pct: 1 }],
    }),
    fig(
      FIGURE_BLOCKS.sankey,
      'fluid',
      'How trips move through the network',
      'Weekday mode share, in thousands.',
    ),
    fig(FIGURE_BLOCKS.statemachine, 'fluid', 'The fare gate, as a state machine'),
    fig(
      FIGURE_BLOCKS.geomap,
      'fluid',
      'Where the new lines run',
      'Four corridors, one downtown spine.',
    ),
    fig(FIGURE_BLOCKS.terminal, 'flow', 'Deploy is automated', 'One command ships both regions.'),
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
    sec('rankedList', {
      heading: 'Busiest stations',
      items: [
        { name: 'Union Central', meta: '112k / day' },
        { name: 'Harbor Gate', meta: '88k / day' },
        { name: 'Market Square', meta: '74k / day' },
        { name: 'Airport T2', meta: '61k / day' },
      ],
    }),
    sec('specTable', {
      heading: 'Quarterly performance',
      columns: ['Metric', 'This Q', 'vs. Plan', 'YoY'],
      rows: [
        ['Ridership', '2.4M', '+6%', '+12%'],
        ['Farebox revenue', '$16.9M', '−2%', '+8%'],
        ['Cost per trip', '$0.92', '+3%', '−4%'],
        ['On-time rate', '92%', '+1%', '+5%'],
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
    // Second answer → exercises the section divider / lead.
    sec('prose', { heading: 'Funding the plan', body: 'How the region pays for it.' }, 1, true),
    // Exercises the Sources appendix renderer (sources.tsx) — including the real, `safeHttpUrl`
    // clickable row that linkLayer.ts draws a genuine PDF annotation over.
    sec('sourcesAppendix', { heading: 'Sources', items: metaFor(stress).sources }, 1),
  ];

  if (!stress) {
    numberSections(base);
    return base;
  }
  // A long table + long list that must split across pages — exercises the re-measure→split fit path.
  const fares = Array.from({ length: 18 }, (_, i) => [
    `Route ${i + 1}`,
    `$${(1 + i * 0.1).toFixed(2)}`,
    `$${(0.8 + i * 0.1).toFixed(2)}`,
    `$${40 + i * 4}`,
  ]);
  base.push(
    sec(
      'specTable',
      {
        heading: 'Every route fare',
        columns: ['Route', 'Peak', 'Off-peak', 'Monthly'],
        rows: fares,
      },
      1,
    ),
    sec(
      'rankedList',
      {
        heading: 'All stations by ridership',
        items: Array.from({ length: 16 }, (_, i) => ({
          name: `Station ${i + 1} — a deliberately long station name that wraps across more than one line to stress the row height`,
          meta: `${100 - i * 3}k / day`,
        })),
      },
      1,
    ),
    // A long unbreakable single-token label per row — no spaces, so it can only be wrapped by
    // `overflow-wrap: break-word` (export.css) inside a table cell far narrower than the token.
    sec(
      'specTable',
      {
        heading: 'Realtime data endpoints',
        columns: ['Route', 'Endpoint'],
        rows: [
          [
            'North Line',
            'https://api.transit.example.gov/v2/routes/north-line/realtime-arrivals?stop=1042&format=json&include=alerts,accessibility,vehicle-position,crowding',
          ],
          [
            'Harbor Loop',
            'https://api.transit.example.gov/v2/routes/harbor-loop/realtime-arrivals?stop=2214&format=json&include=alerts,accessibility',
          ],
          ['Cross-town', 'TXN-88f0c3e1a2b74d6f9c0011223344556677889900aabbccddeeff0011223344'],
        ],
      },
      1,
    ),
    // A several-thousand-character paragraph — the prose splitter's torture case.
    sec('prose', { heading: 'Why frequency wins, at length', body: LONG_PROSE }, 1),
    // A giant finding summary — the findingCallout splitter's torture case.
    sec(
      'findingCallout',
      {
        conf: 'Inferred',
        title: 'Every fare policy in the sample, compared line by line',
        summary: LONG_PROSE.replace(/\n\n/g, ' '),
      },
      1,
    ),
    // A giant spotlight body — the spotlightCard splitter's torture case.
    sec(
      'spotlightCard',
      {
        label: 'In their own words',
        title: 'What twelve transit directors told us about the frequency-versus-capital tradeoff',
        body: LONG_PROSE.replace(/\n\n/g, ' '),
      },
      1,
    ),
    // An eighty-plus line code listing — the FLOW-class figure splitter's torture case (the
    // "primary bug" this whole track fixed: silent clipping in prose/findingCallout/
    // spotlightCard/figure sections under real, un-shrunk content).
    fig(buildTortureTerminalBlock(), 'flow', 'Every route, validated and redeployed'),
  );
  numberSections(base);
  return base;
}

/** Read `?gate=1` from the hash query (`#/exportlab?gate=1`) — the automated-gate escape hatch
 *  scripts/export-gate.mts opts into; the interactive lab ignores it and behaves exactly as before. */
function readGateMode(): boolean {
  if (typeof window === 'undefined') return false;
  const q = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q).get('gate') === '1';
}

const GATE_FORMATS: PageFormat[] = ['letter', 'a4'];
type GateCombo = { skinId: SkinId; format: PageFormat };
/** Every skin × both page formats, in the order the gate walks them. */
const GATE_COMBOS: GateCombo[] = SKIN_ORDER.flatMap((skinId) =>
  GATE_FORMATS.map((format) => ({ skinId, format })),
);

export type ExportGateFailure = ExportAuditFailure & { skin: SkinId; format: PageFormat };

export interface ExportGateResult {
  failures: ExportGateFailure[];
  done: boolean;
}

/** Poll `check` on animation frames until it's true or `timeoutMs` elapses. */
async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await nextFrame();
  }
  return check();
}

export function ExportLab() {
  const [id, setId] = useState<SkinId>('editorial');
  // Gate mode always sweeps the torture preset — computed once at mount so the gate's very first
  // build already uses it (no extra render round-trip toggling it on after the fact).
  const [stress, setStress] = useState<boolean>(() => readGateMode());
  const [format, setFormat] = useState<PageFormat>('letter');
  const [doc, setDoc] = useState<ExportDoc | null>(null);
  const [building, setBuilding] = useState(true);
  const [busy, setBusy] = useState(false);
  const [audited, setAudited] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<ExportAuditFailure[]>([]);
  // What (skin, format) the currently-mounted `doc` was actually built for — the gate driver's
  // cue that the combo it just requested has landed, since layoutDoc is async and re-renders
  // don't happen synchronously with the state update that requested them.
  const builtForRef = useRef<{ skin: SkinId; format: PageFormat } | null>(null);

  const skin = SKINS[id];
  const meta = useMemo(() => metaFor(stress), [stress]);
  const sections = useMemo(() => repSections(stress), [stress]);

  useEffect(() => {
    let cancelled = false;
    setBuilding(true);
    layoutDoc(meta, sections, skin, undefined, format)
      .then((d) => {
        if (!cancelled) {
          setDoc(d);
          setBuilding(false);
          builtForRef.current = { skin: id, format };
        }
      })
      .catch(() => !cancelled && setBuilding(false));
    return () => {
      cancelled = true;
    };
  }, [meta, sections, skin, id, format]);

  // The real fit check: walk every rendered page and flag any element whose content is actually
  // being clipped (audit.ts — shared with the headless gate driver below). Bounded by
  // ensureFigureReady so an async figure (a map's tiles, a chart's fonts) is given the chance to
  // settle before being judged, the same wait the raster pipeline itself relies on.
  const runAudit = useCallback(async () => {
    const host = overflowRef.current;
    if (!host) return;
    await ensureFigureReady(host);
    setOverflow(auditDoc(host));
    setAudited(true);
  }, []);

  useEffect(() => {
    if (!doc || readGateMode()) return; // the gate drives its own sweep + audit timing below
    let cancelled = false;
    (async () => {
      await nextFrame();
      await nextFrame();
      if (!cancelled) await runAudit();
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, runAudit]);

  // Gate mode (#/exportlab?gate=1): drive `id`/`format` through every skin × both page formats in
  // turn, on the torture preset, auditing each combo the moment its document lands — instead of
  // badging results on screen — then publish the sweep on `window.__exportGateResult` for
  // scripts/export-gate.mts to read. A human opening the lab without `gate=1` never runs this.
  const gateMode = useMemo(readGateMode, []);
  const gateFailuresRef = useRef<ExportGateFailure[]>([]);
  const [gateDone, setGateDone] = useState(false);

  useEffect(() => {
    if (!gateMode || gateDone) return;
    let cancelled = false;
    const run = async () => {
      for (const combo of GATE_COMBOS) {
        if (cancelled) return;
        setId(combo.skinId);
        setFormat(combo.format);
        const settled = await waitUntil(
          () =>
            builtForRef.current?.skin === combo.skinId &&
            builtForRef.current?.format === combo.format,
          20_000,
        );
        if (cancelled) return;
        if (!settled) {
          gateFailuresRef.current.push({
            page: 0,
            reason: 'timed out waiting for layout',
            skin: combo.skinId,
            format: combo.format,
          });
          continue;
        }
        await nextFrame();
        await nextFrame();
        const host = overflowRef.current;
        if (!host) continue;
        await ensureFigureReady(host);
        for (const hit of auditDoc(host)) {
          gateFailuresRef.current.push({ ...hit, skin: combo.skinId, format: combo.format });
        }
      }
      if (cancelled) return;
      (window as unknown as { __exportGateResult?: ExportGateResult }).__exportGateResult = {
        failures: gateFailuresRef.current,
        done: true,
      };
      setGateDone(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [gateMode, gateDone]);

  const onExport = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const { exportDocToPdf } = await import('../pipeline/exportPdf');
      // The same document-info dictionary a real export gets — so a PDF produced from the lab is
      // representative of production output, not a metadata-less stand-in.
      const blob = await exportDocToPdf(doc, skin, { scale: 2.5, properties: pdfProperties(meta) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exportlab-${id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error('[exportlab] export failed', e);
    } finally {
      setBusy(false);
    }
  };

  const COL = 760;
  const pageW = doc ? pageSize(doc.format).width : PAGE_W;
  const previewScale = COL / pageW;

  return (
    <div style={S.root}>
      <div style={S.bar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>
            Export lab — {doc?.pages.length ?? '…'} pages · {skin.label} · {format.toUpperCase()}
          </div>
          <button type="button" onClick={onExport} disabled={busy || !doc} style={primary(busy)}>
            {busy ? 'Exporting…' : '⬇ Export PDF'}
          </button>
          <button type="button" onClick={runAudit} disabled={!doc} style={secondary()}>
            🔍 Run overflow audit
          </button>
          <label style={S.toggle}>
            <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />
            Max content
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {GATE_FORMATS.map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} style={tab(format === f)}>
                {f === 'letter' ? 'Letter' : 'A4'}
              </button>
            ))}
          </div>
          {overflow.length > 0 && (
            <span style={S.warn}>
              ⚠ {overflow.length} overflow: {overflow.map((f) => `p${f.page}`).join(', ')}
            </span>
          )}
          {overflow.length === 0 && audited && <span style={S.ok}>✓ clean</span>}
          {building && <span style={{ fontSize: 12, color: '#9AA0AD' }}>composing…</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SKIN_ORDER.map((sid) => {
            const s = SKINS[sid];
            const on = sid === id;
            return (
              <button key={sid} type="button" onClick={() => setId(sid)} style={tab(on)}>
                <span style={{ ...S.dot, background: s.tokens.accent }} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={S.stage}>
        {doc && (
          <div ref={overflowRef} style={{ width: pageW * previewScale }}>
            <div
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
                width: pageW,
              }}
            >
              <ExportDocView doc={doc} skin={skin} />
            </div>
          </div>
        )}
      </div>
      {gateMode && (
        // scripts/export-gate.mts reads window.__exportGateResult directly; this sentinel is a
        // visual confirmation only, for a human watching a headed run.
        <div data-gate-done={gateDone ? 'true' : 'false'} style={{ display: 'none' }} />
      )}
    </div>
  );
}

const S = {
  root: {
    height: '100vh',
    overflowY: 'auto',
    background: '#1B1E24',
    color: '#E8EAF0',
    fontFamily: '-apple-system, system-ui, sans-serif',
    padding: '20px 24px 80px',
    boxSizing: 'border-box',
  },
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: '#1B1E24',
    paddingBottom: 14,
    marginBottom: 18,
    borderBottom: '1px solid rgba(255,255,255,.1)',
  },
  stage: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 },
  dot: { width: 11, height: 11, borderRadius: '50%' },
  toggle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#C9CDD6' },
  warn: { fontSize: 12.5, fontWeight: 600, color: '#FF9B8A' },
  ok: { fontSize: 12.5, fontWeight: 600, color: '#7FD99A' },
} satisfies Record<string, CSSProperties>;

function primary(busy: boolean): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.16)',
    background: busy ? 'rgba(255,255,255,.06)' : '#5B8CFF',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? 'default' : 'pointer',
  };
}

function secondary(): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.16)',
    background: 'rgba(255,255,255,.05)',
    color: '#E8EAF0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function tab(on: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 11px',
    borderRadius: 8,
    cursor: 'pointer',
    border: `1px solid ${on ? '#5B8CFF' : 'rgba(255,255,255,.12)'}`,
    background: on ? 'rgba(91,140,255,.16)' : 'rgba(255,255,255,.05)',
    color: '#E8EAF0',
    fontSize: 12.5,
  };
}

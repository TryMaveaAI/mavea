import { describe, expect, it } from 'vitest';
import type {
  ExportMeta,
  Section,
  SectionDataMap,
  SectionKind,
} from '../src/export/model/ExportDoc';
import { composeSlides } from '../src/slides/model/compose';
import type { Slide, SlideKind } from '../src/slides/model/Slide';
import type { Block } from '../src/data/conversation';

let n = 0;
function sec<K extends SectionKind>(
  kind: K,
  data: SectionDataMap[K],
  opts: { source?: number; lead?: boolean } = {},
): Section {
  return { kind, id: `s${n++}`, source: opts.source ?? 0, lead: opts.lead, data } as Section;
}

const meta = (over: Partial<ExportMeta> = {}): ExportMeta => ({
  title: 'Chicago Trip',
  topic: 'Travel',
  sources: [],
  generatedAt: 1_700_000_000_000,
  ...over,
});

const kinds = (slides: Slide[]): SlideKind[] => slides.map((s) => s.kind);
const only = <K extends SlideKind>(slides: Slide[], kind: K): Extract<Slide, { kind: K }>[] =>
  slides.filter((s) => s.kind === kind) as Extract<Slide, { kind: K }>[];

describe('composeSlides', () => {
  it('always opens with a cover, and an empty answer invents nothing after it', () => {
    const out = composeSlides([], meta());
    expect(out[0].kind).toBe('cover');
    // No sources → no closing: the deck ends on substance, not a filler card.
    expect(out).toHaveLength(1);
    const cover = out[0] as Extract<Slide, { kind: 'cover' }>;
    expect(cover.data.title).toBe('Chicago Trip');
    expect(cover.kicker).toBe('Travel');
  });

  it('renders an embedded figure as one atomic figure slide carrying the real block', () => {
    const block = { type: 'sankey', props: { title: 'Energy flow' } } as unknown as Block;
    const out = composeSlides(
      [sec('figure', { block, embed: 'fluid', heading: 'Energy flow', caption: 'Q2 mix' })],
      meta(),
    );
    const figs = only(out, 'figure');
    expect(figs).toHaveLength(1);
    expect(figs[0].data.block.type).toBe('sankey');
    expect(figs[0].data.embed).toBe('fluid');
    expect(figs[0].data.heading).toBe('Energy flow');
    expect(figs[0].kicker).toBe('Figure');
  });

  it('maps each archetype to its slide layout', () => {
    const sections: Section[] = [
      sec('findingCallout', {
        num: '01',
        conf: 'Inferred',
        title: 'The strategy',
        summary: 'Stay central.',
      }),
      sec('metricTiles', {
        heading: 'Targets',
        tiles: [
          { value: '2,600', label: 'kcal' },
          { value: '8', label: 'hrs' },
        ],
      }),
      sec('figureGrid', {
        heading: 'Itinerary',
        cells: [{ title: 'Day 1', pct: 1, value: '100%' }],
      }),
      sec('distributionBars', {
        heading: 'Macros',
        bars: [{ label: 'Protein', pct: 0.29, value: '29%' }],
      }),
      sec('rankedList', {
        heading: 'Museums',
        items: [{ name: 'Art Institute', meta: 'Impressionist' }],
      }),
      sec('checklist', { heading: 'Food', items: [{ title: 'Deep dish', status: 'done' }] }),
      sec('verticalTimeline', {
        heading: 'Plan',
        events: [{ marker: '4 WEEKS', title: 'Book cruise' }],
      }),
      sec('numberedMilestones', { heading: 'Steps', items: [{ title: 'Phase 1' }] }),
      sec('specTable', { heading: 'Logistics', columns: ['A', 'B'], rows: [['x', 'y']] }),
      sec('prose', {
        heading: 'Closing thought',
        body: 'A long reflective paragraph that runs well beyond the short-quote threshold so it stays prose rather than collapsing into a pull quote on the slide.',
      }),
    ];
    const got = kinds(composeSlides(sections, meta()));
    // cover, agenda (10 titled content slides), …content — and no closing without sources
    expect(got[0]).toBe('cover');
    expect(got).toContain('agenda');
    expect(got).not.toContain('closing');
    expect(got).toContain('keyFigure'); // metricTiles
    expect(got).toContain('chart'); // figureGrid + distributionBars
    expect(got).toContain('agenda'); // rankedList (+ derived)
    expect(got).toContain('process'); // checklist + numberedMilestones
    expect(got).toContain('roadmap'); // verticalTimeline
    expect(got).toContain('dataTable'); // specTable
    expect(got).toContain('prose'); // long prose
    // finding with a summary becomes a heading+body prose slide
    expect(only(composeSlides([sections[0]], meta()), 'prose')[0].data.heading).toBe(
      'The strategy',
    );
  });

  it('routes a 2-column rating matrix to comparison, wider matrices to a rating table', () => {
    const two = composeSlides(
      [
        sec('ratingMatrix', {
          columns: ['Build', 'Buy'],
          rows: [{ label: 'Cost', values: ['High', 'Low'] }],
        }),
      ],
      meta(),
    );
    expect(kinds(two)).toContain('comparison');
    const wide = composeSlides(
      [
        sec('ratingMatrix', {
          columns: ['A', 'B', 'C'],
          scale: 3,
          rows: [{ label: 'Loop', values: [3, 2, 1] }],
        }),
      ],
      meta(),
    );
    const tbl = only(wide, 'dataTable')[0];
    expect(tbl.data.ratingScale).toBe(3);
    expect(tbl.data.columns[0]).toBe('');
  });

  it('splits oversize sections into bounded continuation slides', () => {
    // Short single-line cells earn the raised nine-row cap; the layout's compact rhythm holds it.
    const rows = Array.from({ length: 20 }, (_, i) => [`r${i}`, `v${i}`]);
    const out = composeSlides(
      [sec('specTable', { heading: 'Big', columns: ['K', 'V'], rows })],
      meta(),
    );
    const tables = only(out, 'dataTable');
    expect(tables.length).toBeGreaterThan(1);
    // No slide exceeds the cap, and continuations are marked.
    for (const t of tables) expect(t.data.rows.length).toBeLessThanOrEqual(9);
    expect(tables[0].data.title).toBe('Big');
    expect(tables[1].data.title).toBe('Big (cont.)');

    // Wordy cells keep the conservative seven-row cap so no row is ever clipped.
    const wordy = Array.from({ length: 20 }, (_, i) => [
      `A deliberately verbose row label ${i}`,
      `an equally long value ${i}`,
    ]);
    const wordyTables = only(
      composeSlides(
        [sec('specTable', { heading: 'Big', columns: ['K', 'V'], rows: wordy })],
        meta(),
      ),
      'dataTable',
    );
    for (const t of wordyTables) expect(t.data.rows.length).toBeLessThanOrEqual(7);
  });

  it('splits an over-long prose body into bounded continuation slides', () => {
    const body = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} explains one point in careful and unhurried detail.`,
    ).join(' ');
    const out = composeSlides([sec('prose', { heading: 'Big idea', body })], meta());
    const proses = only(out, 'prose');
    expect(proses.length).toBeGreaterThan(1);
    for (const p of proses) expect(p.data.body.length).toBeLessThanOrEqual(620);
    // The heading stays on the first slide; continuations are marked and never fabricate one.
    // With no chapter divider yet, the kicker carries the deck topic instead of a generic "Note".
    expect(proses[0].kicker).toBe('Travel');
    expect(proses[0].data.heading).toBe('Big idea');
    expect(proses[1].kicker).toBe('Travel (cont.)');
    expect(proses[1].data.heading).toBeUndefined();
  });

  it('labels prose after a chapter divider with the chapter title', () => {
    const out = composeSlides(
      [
        sec('prose', { heading: 'Answer one', body: 'Intro' }),
        sec(
          'prose',
          { heading: 'How the region pays', body: 'A chapter break' },
          {
            source: 1,
            lead: true,
          },
        ),
        sec(
          'prose',
          {
            heading: 'Funding detail',
            body: 'A long reflective paragraph that runs well beyond the short-quote threshold so it stays prose rather than collapsing into a pull quote.',
          },
          { source: 1 },
        ),
      ],
      meta(),
    );
    const proses = only(out, 'prose');
    expect(proses.at(-1)?.kicker).toBe('How the region pays');
  });

  it('drops empty sections and never fabricates content', () => {
    const out = composeSlides(
      [
        sec('metricTiles', { tiles: [] }),
        sec('figureGrid', { cells: [] }),
        sec('prose', { body: '' }),
      ],
      meta(),
    );
    expect(out).toHaveLength(1); // just the cover
  });

  it('inserts a section divider at each additional answer boundary', () => {
    const out = composeSlides(
      [
        sec('findingCallout', { num: '01', title: 'Answer one' }),
        sec('prose', { heading: 'Second answer', body: 'Intro' }, { source: 1, lead: true }),
        sec('metricTiles', { tiles: [{ value: '5', label: 'x' }] }, { source: 1 }),
      ],
      meta(),
    );
    const dividers = only(out, 'sectionDivider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0].data.title).toBe('Second answer');
    expect(dividers[0].data.number).toBe('02');
  });

  it('adds a Sources closing only when there is provenance to attribute', () => {
    // Without sources the deck simply ends — no "Thank you" filler card.
    expect(composeSlides([], meta()).some((s) => s.kind === 'closing')).toBe(false);

    const out = composeSlides([], meta({ sources: [{ name: 'Wikipedia' }, { name: 'NPS.gov' }] }));
    const closing = out.at(-1) as Extract<Slide, { kind: 'closing' }>;
    expect(closing.kind).toBe('closing');
    expect(closing.data.title).toBe('Sources');
    expect(closing.data.sources).toEqual(['Wikipedia', 'NPS.gov']);
  });
});

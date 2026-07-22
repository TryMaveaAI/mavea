import { describe, it, expect } from 'vitest';
import { TOPIC_LIST } from '../src/data/topics';
import type { Block } from '../src/data/conversation';
import { DATA_SHAPES } from '../src/canvas/blocks/catalog/meta';
import { buildMeta, normalize, CORE_EXTRACTOR_TYPES } from '../src/export/model/normalize';
import { CORE_ARCHETYPE, DATASHAPE_ARCHETYPE, archetypeFor } from '../src/export/model/mapping';
import type { Section, SectionKind } from '../src/export/model/ExportDoc';

const KINDS: SectionKind[] = [
  'findingCallout',
  'spotlightCard',
  'figureGrid',
  'figure',
  'rankedList',
  'ratingMatrix',
  'checklist',
  'metricTiles',
  'distributionBars',
  'verticalTimeline',
  'numberedMilestones',
  'specTable',
  'prose',
];

/** A section is structurally sound: a known kind whose payload carries its required field(s). */
function assertWellFormed(s: Section): void {
  expect(KINDS).toContain(s.kind);
  expect(typeof s.id).toBe('string');
  switch (s.kind) {
    case 'findingCallout':
    case 'spotlightCard':
      expect(typeof s.data.title).toBe('string');
      break;
    case 'prose':
      expect(typeof s.data.body).toBe('string');
      break;
    case 'figureGrid':
      expect(Array.isArray(s.data.cells)).toBe(true);
      expect(s.data.cells.length).toBeGreaterThan(0);
      break;
    case 'figure':
      expect(s.data.block).toBeTypeOf('object');
      expect(typeof s.data.block.type).toBe('string');
      expect(['fluid', 'flow']).toContain(s.data.embed);
      break;
    case 'rankedList':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'ratingMatrix':
      expect(s.data.rows.length).toBeGreaterThan(0);
      break;
    case 'checklist':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'metricTiles':
      expect(s.data.tiles.length).toBeGreaterThan(0);
      break;
    case 'distributionBars':
      expect(s.data.bars.length).toBeGreaterThan(0);
      break;
    case 'verticalTimeline':
      expect(s.data.events.length).toBeGreaterThan(0);
      break;
    case 'numberedMilestones':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'specTable':
      expect(s.data.rows.length).toBeGreaterThan(0);
      break;
  }
}

describe('mapping coverage', () => {
  it('routes every DataShape (to an archetype or an intentional drop)', () => {
    for (const shape of DATA_SHAPES) {
      expect(shape in DATASHAPE_ARCHETYPE).toBe(true);
      const target = DATASHAPE_ARCHETYPE[shape];
      if (target !== null) expect(KINDS).toContain(target);
    }
  });

  it('has a precise extractor for every core archetype entry', () => {
    for (const type of Object.keys(CORE_ARCHETYPE)) {
      expect(CORE_EXTRACTOR_TYPES).toContain(type);
    }
  });

  it('falls back to prose for an unknown block type', () => {
    const unknown = {
      type: 'totally-unknown-xyz',
      col: 6,
      props: { title: 'Hi', text: 'there' },
    } as unknown as Block;
    expect(archetypeFor(unknown)).toBe('prose');
    const sections = normalize([{ ...sampleSpec(), blocks: [unknown] }]);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('prose');
    expect(sections[0].data).toMatchObject({ heading: 'Hi' });
  });
});

describe('normalize on real topic data', () => {
  it('never throws and yields well-formed, uniquely-keyed sections for every demo answer', () => {
    for (const spec of TOPIC_LIST) {
      const sections = normalize([spec]);
      expect(Array.isArray(sections)).toBe(true);
      const ids = new Set<string>();
      for (const s of sections) {
        assertWellFormed(s);
        expect(s.source).toBe(0);
        ids.add(s.id);
      }
      expect(ids.size).toBe(sections.length); // ids are unique
    }
  });

  it('keeps each answer addressable by source index when several are combined', () => {
    const pick = TOPIC_LIST.slice(0, 3);
    const sections = normalize(pick);
    const sources = new Set(sections.map((s) => s.source));
    expect(sources).toEqual(new Set([0, 1, 2]));
    // Each later answer opens with a lead section restating its real title.
    const intro = sections.find((s) => s.source === 1 && s.lead);
    expect(intro?.kind).toBe('prose');
  });
});

describe('precise core extractors', () => {
  it('insight → findingCallout with its title + confidence', () => {
    const block = {
      type: 'insight',
      id: 'x',
      num: '1',
      col: 4,
      props: { title: 'The strategy', summary: 'Lean on the train.', conf: 'inferred' },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('findingCallout');
    if (s.kind === 'findingCallout') {
      expect(s.data).toMatchObject({ num: '1', conf: 'Inferred', title: 'The strategy' });
    }
  });

  it('heat → ratingMatrix with numeric levels', () => {
    const block = {
      type: 'heat',
      col: 12,
      props: {
        title: 'Vibe',
        cols: ['A', 'B'],
        rows: [{ label: 'Loop', cells: [3, { lvl: 1 }] }],
        legend: ['low', 'high'],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('ratingMatrix');
    if (s.kind === 'ratingMatrix') {
      expect(s.data.columns).toEqual(['A', 'B']);
      expect(s.data.rows[0]).toEqual({ label: 'Loop', values: [3, 1] });
      expect(s.data.scale).toBe(3);
    }
  });

  it('kpi → metricTiles', () => {
    const block = {
      type: 'kpi',
      col: 6,
      props: { title: 'Logistics', kpis: [{ val: 'CTA Ventra', label: 'Transit' }] },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('metricTiles');
    if (s.kind === 'metricTiles')
      expect(s.data.tiles[0]).toEqual({ value: 'CTA Ventra', label: 'Transit' });
  });

  it('strips HTML from list items', () => {
    const block = {
      type: 'list',
      col: 4,
      props: { title: 'Eat', items: ['<b>Deep-dish</b> &mdash; the classic'] },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('rankedList');
    if (s.kind === 'rankedList') expect(s.data.items[0].name).toBe('Deep-dish — the classic');
  });
});

describe('buildMeta', () => {
  it('derives masthead facts from the first answer', () => {
    const spec = {
      ...sampleSpec(),
      title: 'Chicago in Four Days',
      sub: 'A compact field guide.',
      topic: 'Travel',
      context: [{ name: 'notes.pdf', color: 'var(--text-muted)' as const }],
    };
    const meta = buildMeta([spec], 1_700_000_000_000);
    expect(meta).toMatchObject({
      title: 'Chicago in Four Days',
      sub: 'A compact field guide.',
      topic: 'Travel',
      sources: [{ name: 'notes.pdf' }],
      generatedAt: 1_700_000_000_000,
    });
  });

  it('carries each source as a {name, url?} object, preserving a real web citation URL', () => {
    const spec = {
      ...sampleSpec(),
      context: [{ name: 'notes.pdf', color: 'var(--text-muted)' as const }],
      sources: [{ title: 'Wikipedia: Chicago', url: 'https://en.wikipedia.org/wiki/Chicago' }],
    };
    const meta = buildMeta([spec], 1_700_000_000_000);
    // A context pill never carries a URL — the demo/scripted model has nowhere to put one.
    expect(meta.sources[0]).toEqual({ name: 'notes.pdf' });
    expect(meta.sources[0].url).toBeUndefined();
    // A real web citation's URL is kept verbatim, not discarded.
    expect(meta.sources[1]).toEqual({
      name: 'Wikipedia: Chicago',
      url: 'https://en.wikipedia.org/wiki/Chicago',
    });
  });
});

describe('document numbering & table humanization', () => {
  it('numbers findings 01/02/03 and figures 1/2 in document order', () => {
    const finding = (title: string) =>
      ({ type: 'insight', col: 4, props: { title } }) as unknown as Block;
    const chart = (title: string) =>
      ({
        type: 'chart',
        col: 6,
        props: { title, labels: ['A', 'B'], series: [{ name: 's', data: [1, 2] }] },
      }) as unknown as Block;
    const sections = normalize([
      {
        ...sampleSpec(),
        blocks: [finding('One'), chart('Fig A'), finding('Two'), chart('Fig B'), finding('Three')],
      },
    ]);
    const nums = sections.flatMap((s) => (s.kind === 'findingCallout' ? [s.data.num] : []));
    expect(nums).toEqual(['01', '02', '03']);
    const figs = sections.flatMap((s) => (s.kind === 'figureGrid' ? [s.data.fig] : []));
    expect(figs).toEqual(['1', '2']);
  });

  it('chart → figureGrid carries a real chart payload (labels + numeric series) for the doc renderer', () => {
    const block = {
      type: 'chart',
      col: 8,
      props: {
        title: 'Revenue trend',
        unit: 'M',
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Revenue', data: [12, 13, 12, 15] }],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('figureGrid');
    if (s.kind === 'figureGrid') {
      expect(s.data.chart).toBeDefined();
      expect(s.data.chart?.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
      expect(s.data.chart?.series[0]).toEqual({ name: 'Revenue', data: [12, 13, 12, 15] });
      // The figure is still numbered, and cells remain as the fallback/slide representation.
      expect(s.data.fig).toBe('1');
      expect(s.data.cells.length).toBeGreaterThan(0);
    }
  });

  it('humanizes machine field-name table columns and drops internal keys', () => {
    const block = {
      type: 'datatable',
      col: 12,
      props: {
        rows: [
          { id: 'a1', orderName: 'Acme', unit_price: '9.00', created_at: '2026-01-01' },
          { id: 'a2', orderName: 'Globex', unit_price: '12.50', created_at: '2026-01-02' },
        ],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('specTable');
    if (s.kind === 'specTable') {
      // id / created_at are dropped; orderName / unit_price become reader-facing headers.
      expect(s.data.columns).toEqual(['Order Name', 'Unit Price']);
      expect(s.data.rows[0]).toEqual(['Acme', '9.00']);
    }
  });
});

describe('figure routing — rich visuals render as their real component', () => {
  const mk = (type: string, props: Record<string, unknown>) =>
    ({ type, col: 8, props }) as unknown as Block;

  const sankey = () =>
    mk('sankey', {
      title: 'Energy flow',
      nodes: [
        { id: 'a', label: 'A', layer: 0 },
        { id: 'b', label: 'B', layer: 1 },
      ],
      links: [{ source: 'a', target: 'b', value: 5 }],
    });

  it('routes an embeddable chart to a figure that carries the real block', () => {
    const [s] = normalize([{ ...sampleSpec(), blocks: [sankey()] }]);
    expect(s.kind).toBe('figure');
    if (s.kind === 'figure') {
      expect(s.data.block.type).toBe('sankey');
      expect(s.data.embed).toBe('fluid');
      expect(s.data.heading).toBe('Energy flow');
      expect(s.data.fig).toBe('1');
    }
  });

  it('keeps a data table on its designed archetype (not every extended block embeds)', () => {
    expect(archetypeFor(mk('datatable', {}))).toBe('specTable');
  });

  it('numbers embedded figures in the same FIG. sequence as figure grids', () => {
    const chart = mk('chart', {
      title: 'Trend',
      labels: ['A', 'B'],
      series: [{ name: 's', data: [1, 2] }],
    });
    const sections = normalize([{ ...sampleSpec(), blocks: [sankey(), chart] }]);
    const figs = sections.flatMap((s) =>
      s.kind === 'figure' || s.kind === 'figureGrid' ? [s.data.fig] : [],
    );
    expect(figs).toEqual(['1', '2']);
  });

  it('falls back honestly when an embeddable block carries no real data', () => {
    // Missing nodes/links — no figure is drawn; the real-data-only guard never invents a blank one.
    const [s] = normalize([{ ...sampleSpec(), blocks: [mk('sankey', { title: 'Energy flow' })] }]);
    expect(s?.kind).not.toBe('figure');
  });
});

/** A minimal valid ConversationSpec scaffold for unit cases (blocks overridden per test). */
function sampleSpec() {
  return {
    id: 'test' as unknown as import('../src/types/mavea').TopicId,
    workspace: 'test',
    title: 'Test',
    sub: 'Sub',
    opener: '',
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'home' as const,
    suggests: [],
    keywords: [],
  };
}

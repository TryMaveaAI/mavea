// A card must never count rows it cannot show.
//
// A keyed table looks each cell up by a key owned by a SIBLING array — row[column.key]. Keyed by
// anything else, every cell resolves to nothing while `rows.length` still counts, so the card draws
// a header, five blank lines, and a footer reading "5 of 5 rows". It looks like data and says so.
// Two guards, because they catch it at different moments: the validator drops such a block before
// it reaches the canvas, and the renderer refuses it outright — which is the one that also covers
// a baked demo frame, since replay never revisits the validator.
import { beforeAll, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { ensureDetails } from '../src/canvas/blocks/catalog';
import { DataTable } from '../src/canvas/blocks/tables/DataTable';
import { ComparisonMatrix } from '../src/canvas/ComparisonMatrix';
import { hydrateFromSession } from '../src/live/useLiveTurn';
import type { ConversationSpec } from '../src/data/conversation';
import { hasKeyedRows, resolvesKeyedRows, usableBlock } from '../src/canvas/lib/empty';

const COLUMNS = [
  { key: 'metric', label: 'Bridge Element', align: 'left' as const },
  { key: 'value', label: 'Value', align: 'right' as const },
];

/** `datatable` is a cutting-tier type, so the allowed set has to name it explicitly. */
function validated(rows: unknown) {
  return validateLiveResponse(
    {
      title: 'Q2',
      narration: 'Here is the bridge.',
      blocks: [
        {
          type: 'datatable',
          props: { title: 'The Q2 ARR Bridge', columns: COLUMNS, rows, footer: 'Net +$2.7M' },
        },
      ],
    },
    new Set(['datatable']),
    1,
  );
}

describe('hasKeyedRows tells "present" from "usable"', () => {
  it('is false for rows that resolve nothing under the keys', () => {
    expect(hasKeyedRows([{}, {}, {}], ['metric', 'value'])).toBe(false);
    expect(hasKeyedRows([{ 'Bridge Element': 'New logos' }], ['metric', 'value'])).toBe(false);
    expect(hasKeyedRows([{ metric: '   ' }], ['metric'])).toBe(false);
  });

  it('is true as soon as one cell anywhere carries something', () => {
    expect(hasKeyedRows([{}, { value: '$0.8M' }], ['metric', 'value'])).toBe(true);
    expect(hasKeyedRows([{ metric: 0 }], ['metric'])).toBe(true); // a real zero is a real value
    expect(hasKeyedRows([{ metric: false }], ['metric'])).toBe(true);
  });

  it('is false with no keys to look up by', () => {
    expect(hasKeyedRows([{ a: 'x' }], [])).toBe(false);
  });
});

describe('the validator drops a table that would render blank', () => {
  it('drops rows keyed by the column LABELS instead of the keys', () => {
    // The still-live lane: open-record props keep the model's own keys, so nothing used to notice
    // these rows resolve no cells at all.
    const spec = validated([
      { 'Bridge Element': 'Starting ARR', Value: '$12.4M' },
      { 'Bridge Element': 'New logos', Value: '$0.8M' },
    ]);
    expect(spec?.blocks.some((b) => b.type === 'datatable')).toBe(false);
  });

  it('drops literally empty rows', () => {
    const spec = validated([{}, {}, {}, {}, {}]);
    expect(spec?.blocks.some((b) => b.type === 'datatable')).toBe(false);
  });

  it('keeps a table whose rows match its columns', () => {
    const spec = validated([
      { metric: 'Starting ARR', value: '$12.4M' },
      { metric: 'New logos', value: '$0.8M' },
    ]);
    const table = spec?.blocks.find((b) => b.type === 'datatable');
    expect(table).toBeTruthy();
    expect((table?.props as { rows: Record<string, string>[] }).rows[0].metric).toBe(
      'Starting ARR',
    );
  });

  it('keeps a table where only some cells landed — partial data is still data', () => {
    const spec = validated([{ metric: 'Starting ARR' }, {}]);
    expect(spec?.blocks.some((b) => b.type === 'datatable')).toBe(true);
  });
});

describe('the renderer refuses it too, for frames the validator never sees', () => {
  it('says there is nothing here instead of drawing five blank lines', () => {
    render(
      <DataTable
        title="The Q2 ARR Bridge"
        columns={COLUMNS}
        rows={[{}, {}, {}, {}, {}]}
        footer="Net addition of $2.7M over the quarter."
      />,
    );
    expect(screen.getByText('No rows to show')).toBeInTheDocument();
    // The footer's row count was the thing that made a blank card read as a full one.
    expect(screen.queryByText(/of 5 rows/)).not.toBeInTheDocument();
    expect(screen.getByText('The Q2 ARR Bridge')).toBeInTheDocument();
  });

  it('renders normally the moment the rows match', () => {
    render(
      <DataTable
        title="The Q2 ARR Bridge"
        columns={COLUMNS}
        rows={[{ metric: 'Starting ARR', value: '$12.4M' }]}
      />,
    );
    expect(screen.getByText('Starting ARR')).toBeInTheDocument();
    expect(screen.queryByText('No rows to show')).not.toBeInTheDocument();
  });
});

describe('a baked demo frame cannot paint one either', () => {
  // Shards are frozen artifacts whose trust came from the validator that baked them, and replay
  // never revisits that judgement — so the loader re-asks the one question that matters.
  it('drops the block the CFO shard froze, and leaves the rest of the frame alone', async () => {
    const { loadDemoConversation } = await import('../src/demo/corpus');
    const convo = await loadDemoConversation('cfo');
    expect(convo).not.toBeNull();
    const blanks = (convo?.frames ?? []).flatMap((f) =>
      f.spec.blocks.filter((b) => !resolvesKeyedRows(b.type, b.props)),
    );
    expect(blanks).toEqual([]);
    // Nothing else was thrown away with it.
    expect((convo?.frames ?? []).every((f) => f.spec.blocks.length > 0)).toBe(true);
  });

  it('keeps every tour stop pointing at the block it was written about', async () => {
    const { loadDemoConversation } = await import('../src/demo/corpus');
    const convo = await loadDemoConversation('cfo');
    for (const frame of convo?.frames ?? []) {
      for (const stop of frame.tour ?? []) {
        expect(stop.index).toBeGreaterThanOrEqual(0);
        expect(stop.index).toBeLessThan(frame.spec.blocks.length);
      }
    }
  });
});

// The same defect, reached a different way and seen in the wild: a `checklist` whose rows the
// model wrote as {label, done} rather than the schema's terse {t, st}. With no itemShapes to
// repair the alias, every row coerced to `{}` — three rows survived with the count intact and
// the card drew three empty circles under "WAYS TO PAY".
describe('checklist — a row the model spelled differently still shows its words', () => {
  // Alias repair reads the component's itemShapes, and those live in the catalog's detail shards
  // — fetched per turn in the app (generateLive awaits this before validating), so the test has
  // to load them too or it would be pinning the fails-closed path instead of the real one.
  beforeAll(async () => {
    await ensureDetails(['checklist']);
  });

  function checklist(rows: unknown) {
    return validateLiveResponse(
      {
        title: 'Paying',
        narration: 'Here is how to pay.',
        blocks: [{ type: 'checklist', props: { title: 'Ways to pay', rows } }],
      },
      new Set(['checklist']),
      1,
    );
  }

  it('repairs the aliased text field instead of blanking the row', () => {
    const r = checklist([
      { label: 'Credit card', status: 'done' },
      { label: 'Bank transfer', status: 'todo' },
    ]);
    const block = r?.blocks.find((b) => b.type === 'checklist');
    expect(block, 'the block survives rather than being dropped').toBeDefined();
    const shown = (block!.props as { rows: { t?: string }[] }).rows.map((row) => row.t);
    expect(shown).toEqual(['Credit card', 'Bank transfer']);
  });

  it('drops a checklist whose rows carry no readable text at all', () => {
    // Nothing to repair and nothing to draw — a heading over three empty bullets is worse than
    // no card, so the block must not reach the canvas.
    for (const rows of [[{}, {}, {}], [{ st: 'todo' }, { st: 'done' }], [{ label: '   ' }]]) {
      const r = checklist(rows);
      expect(r?.blocks.some((b) => b.type === 'checklist')).toBe(false);
    }
  });
});

// A KPI grid is its NUMBERS. Every tile carries a label, so the counted-but-blank guards see a
// populated block — but with no value resolved on any tile the card renders as a header over a
// row of em-dashes ("FUTURE & SAVINGS ($1,200)" over EMERGENCY FUND / RETIREMENT / DEBT PAYOFF,
// each showing a bare dash), which reads as broken.
describe('kpi — a grid of em-dashes is not a populated card', () => {
  function kpi(items: unknown) {
    return validateLiveResponse({
      title: 'Budget',
      narration: 'Here it is.',
      blocks: [{ type: 'kpi', props: { title: 'Future & savings', items } }],
    })?.blocks.find((b) => b.type === 'kpi');
  }

  it('drops a grid where no tile resolved a value', () => {
    expect(kpi([{ label: 'Emergency fund' }, { label: 'Retirement' }])).toBeUndefined();
    expect(kpi([{ label: 'Emergency fund', value: '' }])).toBeUndefined();
  });

  it('keeps the grid as soon as one tile has a real figure', () => {
    const block = kpi([{ label: 'Emergency fund', value: '$600' }, { label: 'Retirement' }]);
    expect(block).toBeDefined();
    const kpis = (block!.props as { kpis: { val: string; label: string }[] }).kpis;
    expect(kpis[0].val).toBe('$600');
  });

  it('reads the figure from the names a model actually uses', () => {
    for (const key of ['value', 'val', 'stat', 'amount', 'figure', 'number', 'total', 'target']) {
      const block = kpi([{ label: 'Emergency fund', [key]: '$600' }]);
      expect(block, `items[].${key}`).toBeDefined();
    }
  });
});

// Seen live a THIRD time, through yet another door: a `compare` whose cells the model wrote as
// {value} (or bare strings) coerced every cell to v:'' — headers and row labels rendered, the
// grid between them empty. compare has a bespoke coercer, so none of the itemShapes machinery
// covered it; its cells are its content, and the guard belongs in the builder itself.
describe('compare — a grid is its cells', () => {
  function compare(criteria: unknown) {
    return validateLiveResponse({
      title: 'T',
      narration: 'n',
      blocks: [
        {
          type: 'compare',
          props: {
            options: [
              { name: 'Spatial Computing', sub: 'Blended reality' },
              { name: 'Virtual Reality', sub: 'Total immersion' },
            ],
            criteria,
          },
        },
      ],
    })?.blocks.find((b) => b.type === 'compare');
  }

  it('reads cells written as {value}, {text}, or bare strings', () => {
    const block = compare([
      { label: 'Environment', cells: [{ value: 'Digital overlays' }, { text: 'Fully virtual' }] },
      { label: 'Primary Use', cells: ['Work', 'Gaming'] },
    ]);
    expect(block).toBeDefined();
    const crits = (block!.props as { criteria: { cells: { v: string }[] }[] }).criteria;
    expect(crits[0].cells.map((c) => c.v)).toEqual(['Digital overlays', 'Fully virtual']);
    expect(crits[1].cells.map((c) => c.v)).toEqual(['Work', 'Gaming']);
  });

  it('drops a row whose cells are all blank, and the block when none survive', () => {
    const partial = compare([
      { label: 'Environment', cells: [{}, {}] },
      { label: 'Primary Use', cells: [{ v: 'Work' }, { v: 'Gaming' }] },
    ]);
    const crits = (partial!.props as { criteria: { label: string }[] }).criteria;
    expect(crits.map((c) => c.label)).toEqual(['Primary Use']);
    expect(compare([{ label: 'Environment', cells: [{}, {}] }])).toBeUndefined();
  });
});

// And at the RENDERER, because a persisted answer validated by an older build replays without
// ever meeting the validator again — the user restored a session and the pre-fix empty grid
// came back. The renderer is the one layer every path passes.
describe('ComparisonMatrix — a restored empty grid refuses to draw', () => {
  it('drops blank rows and shows the calm placeholder when none survive', () => {
    render(
      <ComparisonMatrix
        options={[{ name: 'Spatial Computing' }, { name: 'Virtual Reality' }]}
        criteria={[
          { label: 'Environment', cells: [{ v: '' }, { v: '' }] },
          { label: 'Primary Use', cells: [{ v: '' }, { v: '' }] },
        ]}
      />,
    );
    expect(screen.getByText('No comparison to show')).toBeTruthy();
    expect(screen.queryByText('Environment')).toBeNull();
  });

  it('keeps the rows that carry cells, drops the one that does not', () => {
    render(
      <ComparisonMatrix
        options={[{ name: 'A' }, { name: 'B' }]}
        criteria={[
          { label: 'Empty row', cells: [{ v: '' }, { v: ' ' }] },
          { label: 'Real row', cells: [{ v: 'High' }, { v: 'Low' }] },
        ]}
      />,
    );
    expect(screen.getByText('Real row')).toBeTruthy();
    expect(screen.queryByText('Empty row')).toBeNull();
  });
});

// The sweep's remaining doors, all the same class: a bespoke builder read one terse key, a
// model wrote the natural synonym, and the card rendered its furniture with nothing inside.
describe('every bespoke builder survives the natural authoring', () => {
  const one = (block: unknown) =>
    validateLiveResponse(
      { title: 'T', narration: 'n', blocks: [block] },
      new Set(['ring', 'donut', 'bars', 'chart', 'diagramflow']),
      1,
    )?.blocks[0];

  it('ring: reads value/percent, normalizes the 0-100 scale, drops arc-less rings', () => {
    const b = one({
      type: 'ring',
      props: { title: 'Progress', rings: [{ name: 'Done', value: 72 }] },
    });
    const rings = (b?.props as { rings: { pct: number }[] }).rings;
    expect(rings[0].pct).toBeCloseTo(0.72);
    // An honest 1.0 (6 of 6) is not "100 on the wrong scale".
    const full = one({ type: 'ring', props: { title: 'P', rings: [{ label: 'All', pct: 1 }] } });
    expect((full?.props as { rings: { pct: number }[] }).rings[0].pct).toBe(1);
    // No share and no display → no arc to draw → no ring; none left → no block.
    expect(one({ type: 'ring', props: { title: 'P', rings: [{ label: 'X' }] } })).toBeUndefined();
  });

  it('donut: reads value/percent, scales fractional shares, refuses an all-zero ring', () => {
    const b = one({
      type: 'donut',
      props: {
        title: 'Share',
        rows: [
          { label: 'Chrome', value: 0.65 },
          { label: 'Safari', value: 0.2 },
        ],
      },
    });
    const rows = (b?.props as { rows: { pct: number }[] }).rows;
    expect(rows.map((r) => r.pct)).toEqual([65, 20]);
    expect(
      one({ type: 'donut', props: { title: 'S', rows: [{ label: 'A' }, { label: 'B' }] } }),
    ).toBeUndefined();
  });

  it('bars: reads val/figure, and drops a chart where no bar carried any number', () => {
    const b = one({
      type: 'bars',
      props: {
        title: 'Q',
        bars: [
          { label: 'Q1', val: '4.2' },
          { label: 'Q2', val: 5 },
        ],
      },
    });
    expect((b?.props as { bars: { value: number }[] }).bars.map((x) => x.value)).toEqual([4.2, 5]);
    // Genuinely all-zero data resolves its keys and STAYS…
    expect(
      one({ type: 'bars', props: { title: 'Q', bars: [{ label: 'Q1', value: 0 }] } }),
    ).toBeDefined();
    // …but labels with no numeric key anywhere is an axis over nothing.
    expect(
      one({ type: 'bars', props: { title: 'Q', bars: [{ label: 'Q1' }, { label: 'Q2' }] } }),
    ).toBeUndefined();
  });

  it('chart: reads {x,y} points and pairs; entries resolving nothing drop the series closed', () => {
    const b = one({
      type: 'chart',
      props: {
        title: 'Trend',
        labels: ['Jan', 'Feb'],
        series: [{ name: 'Rev', data: [{ x: 'Jan', y: 12 }, [1, 14]] }],
      },
    });
    expect((b?.props as { series: { data: number[] }[] }).series[0].data).toEqual([12, 14]);
    expect(
      one({
        type: 'chart',
        props: { title: 'T', labels: ['a'], series: [{ name: 'S', data: [{ x: 'a' }] }] },
      }),
    ).toBeUndefined();
  });

  it('diagramflow: resolves edges by label when unambiguous, drops a flow whose flow died', () => {
    const props = {
      title: 'Pipeline',
      nodes: [
        { id: 'e1', label: 'Extract' },
        { id: 'e2', label: 'Transform' },
      ],
      edges: [{ from: 'Extract', to: 'transform' }],
    };
    const b = one({ type: 'diagramflow', props });
    const edges = (b?.props as { edges: { from: string; to: string }[] }).edges;
    expect(edges).toEqual([{ from: 'e1', to: 'e2' }]);
    // Authored edges, none resolvable: unconnected ellipses under a flow title is a broken card.
    expect(
      one({
        type: 'diagramflow',
        props: { ...props, edges: [{ from: 'Load', to: 'Ship' }] },
      }),
    ).toBeUndefined();
  });

  it('compare: a cell echoing its own criterion label is not a value', () => {
    const b = one({ type: 'compare', props: {} });
    void b; // compare is exercised above; the echo rule rides the same builder:
    const r = validateLiveResponse({
      title: 'T',
      narration: 'n',
      blocks: [
        {
          type: 'compare',
          props: {
            options: [{ name: 'A' }, { name: 'B' }],
            criteria: [
              { label: 'Price', cells: [{ label: 'Price', score: '$99' }, { score: '$120' }] },
            ],
          },
        },
      ],
    })?.blocks.find((x) => x.type === 'compare');
    const cells = (r!.props as { criteria: { cells: { v: string }[] }[] }).criteria[0].cells;
    expect(cells.map((c) => c.v)).toEqual(['$99', '$120']);
  });
});

// The final door: a SAVED spec, validated by whatever build saved it, hydrating straight past
// the validator — the pre-fix empty comparison came back from disk and the Study cast it as the
// FRONT CARD: a "No comparison to show" placeholder headline with margin scrawls pointing at
// nothing. Restored content is scrubbed at the door now, tours re-pointed, like the demo loader.
describe('a restored session cannot cast a dead block', () => {
  it('drops the unusable block and re-points the tour', () => {
    const state = hydrateFromSession({
      history: [],
      frames: [
        {
          question: 'spatial vs vr?',
          narration: '',
          mode: 'replace',
          at: 1,
          tour: [
            { index: 0, say: 'the grid' },
            { index: 1, say: 'the lead' },
          ],
          spec: {
            id: 'live',
            title: 'Key distinctions',
            sub: '',
            blocks: [
              {
                type: 'compare',
                id: 'live-1',
                col: 12,
                props: {
                  options: [{ name: 'Spatial' }, { name: 'VR' }],
                  criteria: [{ label: 'Environment', cells: [{ v: '' }, { v: '' }] }],
                },
              },
              {
                type: 'insight',
                id: 'live-2',
                col: 4,
                num: '1',
                props: { title: 'The lead', stat: '2026' },
              },
            ],
          } as unknown as ConversationSpec,
        },
      ],
    } as never);
    expect(state.spec!.blocks.map((b) => b.type)).toEqual(['insight']);
    // The surviving tour stop follows its block to its new index.
    expect(state.frames[0].tour).toEqual([{ index: 0, say: 'the lead' }]);
  });

  it('usableBlock also refuses the zero-share visuals a pre-fix build saved', () => {
    expect(
      usableBlock('donut', {
        rows: [
          { label: 'A', pct: 0 },
          { label: 'B', pct: 0 },
        ],
      }),
    ).toBe(false);
    expect(usableBlock('ring', { rings: [{ label: 'A', pct: 0, display: '0%' }] })).toBe(false);
    // An honest zero beside a real share stays.
    expect(
      usableBlock('donut', {
        rows: [
          { label: 'A', pct: 0 },
          { label: 'B', pct: 60 },
        ],
      }),
    ).toBe(true);
  });
});

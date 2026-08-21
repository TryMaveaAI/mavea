// A card must never count rows it cannot show.
//
// A keyed table looks each cell up by a key owned by a SIBLING array — row[column.key]. Keyed by
// anything else, every cell resolves to nothing while `rows.length` still counts, so the card draws
// a header, five blank lines, and a footer reading "5 of 5 rows". It looks like data and says so.
// Two guards, because they catch it at different moments: the validator drops such a block before
// it reaches the canvas, and the renderer refuses it outright — which is the one that also covers
// a baked demo frame, since replay never revisits the validator.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { DataTable } from '../src/canvas/blocks/tables/DataTable';
import { hasKeyedRows, resolvesKeyedRows } from '../src/canvas/lib/empty';

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

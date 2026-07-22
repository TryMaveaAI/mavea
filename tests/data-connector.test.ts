// data-connector.test.ts — the file→typed-table→T1-value path. Locks the honesty invariants: cells
// are kept verbatim, a reduction names how many cells it used, a numeric reduction REFUSES a text
// column (never coerces), and a resolved value bridges to the spine as T1 with a receipt.
import { describe, it, expect } from 'vitest';
import { parseDataset } from '../src/live/data/parse';
import { resolveColumnRef, columnStats, toUserDatum } from '../src/live/data/resolve';
import type { Attachment } from '../src/live/attachments';

const csv = (name: string, text: string): Attachment => ({
  name,
  mime: 'text/csv',
  data: btoa(text),
  size: text.length,
});

const CSV = `month,revenue,region
Jan,"1,200",West
Feb,1500,East
Mar,1800,West`;

describe('dataset connector (CSV)', () => {
  it('types columns and keeps verbatim tokens', async () => {
    const { dataset, reason } = await parseDataset(csv('sales.csv', CSV), 1000);
    expect(reason).toBeUndefined();
    expect(dataset).toBeDefined();
    const cols = dataset!.columns;
    expect(cols.map((c) => c.label)).toEqual(['month', 'revenue', 'region']);
    const rev = cols.find((c) => c.label === 'revenue')!;
    expect(rev.type).toBe('number');
    expect(rev.values).toEqual([1200, 1500, 1800]);
    expect(rev.raw[0]).toBe('1,200'); // verbatim token preserved through the quote
    expect(cols.find((c) => c.label === 'region')!.type).toBe('text');
  });

  it('reduces a numeric column, receipt names the contributing count', async () => {
    const { dataset } = await parseDataset(csv('s.csv', CSV), 1000);
    const mean = resolveColumnRef(dataset!, {
      datasetId: dataset!.id,
      col: 'revenue',
      reduce: 'mean',
    })!;
    expect(mean.value).toBe(1500);
    expect(mean.tier).toBe('T1');
    expect(mean.receipt).toMatchObject({ col: 'revenue', rows: 3, file: 's.csv' });
    expect(
      resolveColumnRef(dataset!, { datasetId: dataset!.id, col: 'revenue', reduce: 'sum' })!.value,
    ).toBe(4500);
  });

  it('reads a single cell verbatim', async () => {
    const { dataset } = await parseDataset(csv('s.csv', CSV), 1000);
    const cell = resolveColumnRef(dataset!, { datasetId: dataset!.id, col: 'revenue', row: 1 })!;
    expect(cell.value).toBe(1200);
    expect(cell.display).toBe('1,200');
    expect(cell.receipt.rows).toBe(1);
  });

  it('REFUSES a numeric reduction on a text column; count still works', async () => {
    const { dataset } = await parseDataset(csv('s.csv', CSV), 1000);
    expect(
      resolveColumnRef(dataset!, { datasetId: dataset!.id, col: 'region', reduce: 'sum' }),
    ).toBeNull();
    expect(
      resolveColumnRef(dataset!, { datasetId: dataset!.id, col: 'region', reduce: 'count' })!.value,
    ).toBe(3);
  });

  it('columnStats + toUserDatum bridge to the spine', async () => {
    const { dataset } = await parseDataset(csv('s.csv', CSV), 1000);
    expect(columnStats(dataset!, 'revenue')).toMatchObject({
      min: 1200,
      max: 1800,
      mean: 1500,
      count: 3,
    });
    const g = resolveColumnRef(dataset!, { datasetId: dataset!.id, col: 'revenue', row: 2 })!;
    expect(toUserDatum('Feb revenue', g)).toMatchObject({
      label: 'Feb revenue',
      value: 1500,
      raw: '1500',
    });
  });

  it('rejects a non-table attachment with a reason, never a fabricated table', async () => {
    const { dataset, reason } = await parseDataset(
      { name: 'notes.txt', mime: 'text/plain', data: btoa('just some prose'), size: 15 },
      1,
    );
    expect(dataset).toBeUndefined();
    expect(reason).toBeTruthy();
  });
});

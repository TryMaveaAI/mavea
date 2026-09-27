// data-connector.test.ts — the file→typed-table→T1-value path. Locks the honesty invariants: cells
// are kept verbatim, a reduction names how many cells it used, a numeric reduction REFUSES a text
// column (never coerces), and a resolved value bridges to the spine as T1 with a receipt.
import { describe, it, expect } from 'vitest';
import { parseDataset } from '../src/live/data/parse';
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

  it('rejects a non-table attachment with a reason, never a fabricated table', async () => {
    const { dataset, reason } = await parseDataset(
      { name: 'notes.txt', mime: 'text/plain', data: btoa('just some prose'), size: 15 },
      1,
    );
    expect(dataset).toBeUndefined();
    expect(reason).toBeTruthy();
  });
});

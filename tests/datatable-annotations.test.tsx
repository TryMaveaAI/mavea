import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataTable } from '../src/canvas/blocks/tables/DataTable';
import { validateLiveResponse } from '../src/engine/liveSchema';
import type { Annotation } from '../src/canvas/lib/annotations';

// The flagship "annotate a base" scenario end to end: a plain `datatable` + a closed-grammar
// annotations array becomes a RECEIPT (currency-formatted prices + a computed total row + the total
// emphasized) — the same base component, adapted, with no bespoke `receipt` component. Covers both
// halves: liveSchema validates/ grounds the model's annotations, and the renderer applies them.

const receiptAnnotations: Annotation[] = [
  { op: 'format', target: { kind: 'column', key: 'price' }, as: 'currency' },
  { op: 'summary', stat: 'total', columns: ['price'] },
  { op: 'emphasize', target: { kind: 'row', match: 'Total' }, tone: 'presence' },
];

const columns = [
  { key: 'item', label: 'Item' },
  { key: 'price', label: 'Price', align: 'right' as const, numeric: true },
];
const rows = [
  { item: 'Coffee', price: '4.5' },
  { item: 'Bagel', price: '3.25' },
];

describe('datatable annotations — the receipt scenario', () => {
  it('renders currency formatting, a computed total row, and an emphasized row', () => {
    const { container, getByText } = render(
      <DataTable title="Order" columns={columns} rows={rows} annotations={receiptAnnotations} />,
    );
    // Currency formatting applied to the price column.
    expect(getByText('$4.50')).toBeTruthy();
    expect(getByText('$3.25')).toBeTruthy();
    // A computed total row in the tfoot — WE compute 4.5 + 3.25 = 7.75, currency-formatted.
    const foot = container.querySelector('tfoot');
    expect(foot).toBeTruthy();
    expect(foot!.textContent).toContain('Total');
    expect(foot!.textContent).toContain('$7.75');
  });

  it('renders a plain table when no annotations are given (additive, non-breaking)', () => {
    const { container, getByText } = render(
      <DataTable title="Order" columns={columns} rows={rows} />,
    );
    expect(getByText('4.5')).toBeTruthy(); // unformatted
    expect(container.querySelector('tfoot')).toBeNull();
  });
});

describe('liveSchema — annotations are validated + grounded against the real table data', () => {
  const allowed = new Set<string>(['datatable']);

  it('keeps valid annotations and drops ones referencing a nonexistent column (hallucination)', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'datatable',
            props: {
              title: 'Order',
              columns: [
                { key: 'item', label: 'Item' },
                { key: 'price', label: 'Price', numeric: true },
              ],
              rows: [{ item: 'Coffee', price: '4.5' }],
              annotations: [
                { op: 'format', target: { kind: 'column', key: 'price' }, as: 'currency' }, // kept
                { op: 'format', target: { kind: 'column', key: 'ghost' }, as: 'currency' }, // dropped
                { op: 'summary', stat: 'total' }, // kept
              ],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0] as { type: string; props: { annotations?: Annotation[] } };
    expect(b.type).toBe('datatable');
    expect(b.props.annotations).toBeTruthy();
    expect(b.props.annotations!.map((a) => a.op)).toEqual(['format', 'summary']);
  });

  it('omits annotations entirely when the model sends none', () => {
    const r = validateLiveResponse(
      {
        title: 'T',
        blocks: [
          {
            type: 'datatable',
            props: {
              title: 'Order',
              columns: [{ key: 'item', label: 'Item' }],
              rows: [{ item: 'Coffee' }],
            },
          },
        ],
      },
      allowed,
    );
    const b = r!.blocks[0] as { props: { annotations?: unknown } };
    expect(b.props.annotations).toBeUndefined();
  });
});

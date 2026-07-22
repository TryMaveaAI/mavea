import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { BillOfMaterialsProps, BomRow, BomRowKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BillOfMaterialsProps & { delay?: number };

function money(v: number, currency: string): string {
  return formatValue(v, { currency, decimals: 2 });
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

interface Computed {
  row: BomRow;
  indent: number;
  kind: BomRowKind;
  qty: number | null;
  unitCost: number | null;
  /** qty × unitCost, computed here — a row's own extended cost is never trusted as input because
   *  the prop shape doesn't accept one; this is the only source of truth for it. Null when either
   *  factor is missing, so an uncomputable row reads honestly as "—" instead of a false $0. */
  extended: number | null;
}

// A hierarchical parts list with cost rollup: rows nest by indent (FinancialStatement's
// technique), qty × unitCost always computed into an extended-cost column, a subassembly row
// rolls up every part nested under it, and a total row is the grand total across every part in
// the table. Manufacturing, hardware, procurement — "what does this build cost".
export function BillOfMaterials({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  rows,
  currency = 'USD',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const list = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && typeof r.label === 'string' && r.label.trim().length > 0,
  );

  const computed: Computed[] = list.map((row) => {
    const indent = Math.max(0, Math.round(row.indent || 0));
    const kind: BomRowKind = row.kind === 'subassembly' || row.kind === 'total' ? row.kind : 'part';
    const qty = num(row.qty);
    const unitCost = num(row.unitCost);
    const extended = kind === 'part' && unitCost != null ? (qty ?? 1) * unitCost : null;
    return { row, indent, kind, qty, unitCost, extended };
  });

  // A subassembly's rollup is the sum of every PART row nested strictly deeper than it, stopping
  // at the next row that isn't nested under it — a subtree sum, so nesting of any depth rolls up
  // correctly without a part ever being double-counted into two ancestors. Reading bottom-up lets
  // each row hand a finished subtotal up to whatever it turns out to be nested under: `pending`
  // carries the subtotals of the rows below that no shallower row has claimed yet.
  const rollups: number[] = new Array<number>(computed.length).fill(0);
  const pending: { indent: number; subtotal: number }[] = [];
  for (let i = computed.length - 1; i >= 0; i--) {
    const c = computed[i];
    let subtotal = 0;
    while (pending.length > 0 && pending[pending.length - 1].indent > c.indent) {
      subtotal += pending.pop()!.subtotal;
    }
    rollups[i] = subtotal;
    if (c.kind === 'part' && c.extended != null) subtotal += c.extended;
    pending.push({ indent: c.indent, subtotal });
  }

  // The grand total sums every part in the table directly — never a sum of subassembly rollups —
  // so it can't silently drift if a caller's indent nesting is uneven or a level goes missing.
  const grandTotal = computed
    .filter((c) => c.kind === 'part' && c.extended != null)
    .reduce((sum, c) => sum + (c.extended as number), 0);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {computed.length === 0 ? (
        <BlockEmpty message="No parts to list" />
      ) : (
        <div className="bom-scroll">
          <table className="bom-tbl">
            <thead>
              <tr>
                <th className="bom-h-label">Item</th>
                <th className="bom-h-part">Part #</th>
                <th className="bom-h-num">Qty</th>
                <th className="bom-h-num">Unit cost</th>
                <th className="bom-h-num">Ext. cost</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c, i) => {
                const rowValue =
                  c.kind === 'part'
                    ? c.extended
                    : c.kind === 'subassembly'
                      ? rollups[i]
                      : grandTotal;
                return (
                  <tr key={i} className={`bom-row bom-${c.kind}`}>
                    <td className="bom-label" style={{ paddingLeft: 2 + c.indent * 14 }}>
                      {c.row.label}
                    </td>
                    <td className="bom-part tab-num">
                      {c.kind === 'part' && c.row.partNo ? c.row.partNo : '—'}
                    </td>
                    <td className="bom-num tab-num">
                      {c.kind === 'part' && c.qty != null ? c.qty : '—'}
                    </td>
                    <td className="bom-num tab-num">
                      {c.kind === 'part' && c.unitCost != null ? money(c.unitCost, currency) : '—'}
                    </td>
                    <td className="bom-num bom-ext tab-num">
                      {rowValue != null ? money(rowValue, currency) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}

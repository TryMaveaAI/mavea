import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { DentalTreatmentPlanProps, DentalEntry, DentalPriority } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DentalTreatmentPlanProps & { delay?: number };

const PRIORITY_SET = new Set<DentalPriority>(['urgent', 'recommended', 'elective']);
const PRIORITY_COLOR: Record<DentalPriority, string> = {
  urgent: 'var(--danger)',
  recommended: 'var(--warning)',
  elective: 'var(--insight)',
};

/** A loose/misspelled priority still lands on a real chip — same reasoning as
 *  DataDictionary's `toDtype`. Falls back to the middle tier, not the alarming one, so a
 *  missing priority never dramatizes an unscored procedure into "urgent". */
function toPriority(v: unknown): DentalPriority {
  return typeof v === 'string' && PRIORITY_SET.has(v as DentalPriority)
    ? (v as DentalPriority)
    : 'recommended';
}

function toCost(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** No fixed status vocabulary across practices (the prop is a free string), so this is a soft
 *  keyword read, not an enum guard: a recognizable word gets a tint, anything else (or nothing)
 *  reads as neutral rather than guessing at a color that isn't backed by the text. */
function statusColor(status: string | undefined): string {
  if (!status) return 'var(--text-muted)';
  if (/complet|done/i.test(status)) return 'var(--insight)';
  if (/progress|underway|started/i.test(status)) return 'var(--warning)';
  return 'var(--text-muted)';
}

interface Normalized {
  entry: DentalEntry;
  priority: DentalPriority;
  cost: number | null;
  visit: string;
}

const UNSCHEDULED = 'Unscheduled';

// A dental treatment plan: entries grouped by visit (in the order visits first appear), a
// priority-colored chip per row (urgent/recommended/elective), and a running cost total per
// visit that rolls up into a grand total. Dentistry, patient billing — "what's the plan, and
// what does it cost".
export function DentalTreatmentPlan({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  entries,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const list = Array.isArray(entries) ? entries : [];
  const valid: Normalized[] = list
    .filter((e) => typeof e?.procedure === 'string' && e.procedure.trim().length > 0)
    .map((entry) => ({
      entry,
      priority: toPriority(entry.priority),
      cost: toCost(entry.cost),
      visit: typeof entry.visit === 'string' && entry.visit.trim() ? entry.visit : UNSCHEDULED,
    }));

  // Group by visit, preserving the order each visit name first appears — so a plan reads
  // top-to-bottom the way the patient will actually experience it.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byVisit = new Map<string, Normalized[]>();
    for (const n of valid) {
      if (!byVisit.has(n.visit)) {
        byVisit.set(n.visit, []);
        order.push(n.visit);
      }
      byVisit.get(n.visit)!.push(n);
    }
    return order.map((visit) => ({
      visit,
      rows: byVisit.get(visit)!,
      subtotal: byVisit.get(visit)!.reduce((sum, r) => sum + (r.cost ?? 0), 0),
    }));
  }, [valid]);

  // The grand total is ALWAYS the sum of every valid entry cost — never a caller-supplied
  // figure — the same "never trust a rollup as input" rule BillOfMaterials/FmeaTable follow,
  // so a stale or fabricated totalCost can't drift from what the rows actually add to.
  const grandTotal = valid.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  let rowIndex = 0;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No treatment entries planned" />
      ) : (
        <div className="dtp-scroll">
          <table className="dtp-table">
            <thead>
              <tr>
                <th className="dtp-th">Tooth</th>
                <th className="dtp-th dtp-th-proc">Procedure</th>
                <th className="dtp-th">Priority</th>
                <th className="dtp-th">Status</th>
                <th className="dtp-th dtp-th-num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.visit}>
                  <tr className="dtp-visit-row">
                    <td className="dtp-visit-head" colSpan={4}>
                      {g.visit}
                    </td>
                    <td className="dtp-visit-subtotal tab-num">
                      {formatValue(g.subtotal, { currency: 'USD', decimals: 0 })}
                    </td>
                  </tr>
                  {g.rows.map((r) => {
                    const i = rowIndex++;
                    return (
                      <tr
                        key={`${g.visit}-${i}`}
                        className="dtp-row m-stagger-item m-fade-rise"
                        style={{ ['--i' as string]: i } as CSSProperties}
                      >
                        <td className="dtp-tooth">{r.entry.tooth || '—'}</td>
                        <td className="dtp-proc">
                          {r.entry.procedure}
                          {r.entry.surface && (
                            <span className="dtp-surface"> · {r.entry.surface}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className="dtp-priority"
                            style={
                              { ['--dtp-c' as string]: PRIORITY_COLOR[r.priority] } as CSSProperties
                            }
                          >
                            {r.priority}
                          </span>
                        </td>
                        <td>
                          <span
                            className="dtp-status"
                            style={
                              {
                                ['--dtp-c' as string]: statusColor(r.entry.status),
                              } as CSSProperties
                            }
                          >
                            {r.entry.status || '—'}
                          </span>
                        </td>
                        <td className="dtp-num tab-num">
                          {r.cost == null
                            ? '—'
                            : formatValue(r.cost, { currency: 'USD', decimals: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="dtp-total-row">
                <td className="dtp-total-label" colSpan={4}>
                  Total plan cost
                </td>
                <td className="dtp-total-val tab-num">
                  {formatValue(grandTotal, { currency: 'USD', decimals: 0 })}
                </td>
              </tr>
            </tfoot>
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
